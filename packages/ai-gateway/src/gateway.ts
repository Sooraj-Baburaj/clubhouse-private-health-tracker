import type { AiFeatureKey } from '@clubhouse/contracts';
import { FALLBACK_BETA, getAnthropic, outputFormat, sdkErrors } from './client';
import { costOf, monthKey } from './pricing';
import { FEATURES, UnregisteredFeatureError, isRegistered, type FeatureDef, type FeatureInput, type FeatureOutput, type UserBlock } from './registry';
import type { AiCallContext, AiResult, AiStore, CallRowFinish } from './types';

export interface GatewayDeps {
  store: AiStore;
  mode: 'live' | 'mock' | 'off';
  apiKey?: string;
  fallbacks: boolean;
  now: () => Date;
  /** Test hook: replace the Anthropic client. */
  clientOverride?: unknown;
}

export interface AiGateway {
  callFeature<K extends AiFeatureKey>(key: K, ctx: AiCallContext, input: FeatureInput<K>): Promise<AiResult<FeatureOutput<K>>>;
  mode: 'live' | 'mock' | 'off';
}

const blank: Omit<CallRowFinish, 'model' | 'outcome' | 'latencyMs'> = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  errorCategory: null,
  errorMessage: null,
  requestId: null,
  promptSnapshot: null,
};

function snapshotText(blocks: UserBlock[]): string {
  return blocks.map((b) => (b.type === 'text' ? b.text : '[image]')).join('\n');
}

/**
 * The single gateway every AI call passes through (SYS-AI-10…16). It never throws for expected failures —
 * callers always get `{ ok: false, reason }` and fall back to the logic path without an error state (SYS-AI-04).
 */
export function createAiGateway(deps: GatewayDeps): AiGateway {
  async function callFeature<K extends AiFeatureKey>(key: K, ctx: AiCallContext, input: FeatureInput<K>): Promise<AiResult<FeatureOutput<K>>> {
    if (!isRegistered(key)) throw new UnregisteredFeatureError(key);
    const def = FEATURES[key] as unknown as FeatureDef<FeatureInput<K>, FeatureOutput<K>>;
    if (deps.mode === 'off') return { ok: false, reason: 'disabled', callId: null, message: 'AI is off in this environment.' };
    const settings = await deps.store.getSettings(ctx.teamId);
    const feature = settings.features[key];
    if (!settings.globalOn || !feature?.on) return { ok: false, reason: 'disabled', callId: null, message: 'This AI feature is switched off.' };
    if (ctx.memberOptedOut) return { ok: false, reason: 'opted_out', callId: null, message: 'You opted out of this AI feature.' };

    const parsedInput = def.input.safeParse(input);
    if (!parsedInput.success) return { ok: false, reason: 'error', callId: null, message: `Invalid input: ${parsedInput.error.issues[0]?.message ?? 'unknown'}` };
    const now = deps.now();
    const month = monthKey(now);
    const model = feature.model || def.defaultModel;
    const start = {
      teamId: ctx.teamId,
      userId: ctx.userId,
      feature: key,
      requestedModel: model,
      promptVersion: def.promptVersion,
      entityType: ctx.entity?.type ?? null,
      entityId: ctx.entity?.id ?? null,
      imageCount: def.imageCount(parsedInput.data),
      test: !!ctx.test,
    };

    // Budget (SYS-AI-12): monthly team cap with at-cap behaviour, then the per-member daily cap per feature.
    const spent = await deps.store.monthSpend(ctx.teamId, month);
    const atCap = spent >= settings.budget.monthlyCapUsd;
    if (atCap && settings.budget.atCapBehaviour === 'disable') {
      const id = await deps.store.startCall(start);
      await deps.store.finishCall(id, { ...blank, model, outcome: 'budget_blocked', latencyMs: 0, errorCategory: 'budget', errorMessage: 'Monthly AI budget reached' }, month, ctx.teamId);
      return { ok: false, reason: 'budget', callId: id, message: 'The team’s monthly AI budget is used up.' };
    }
    if (ctx.userId && !ctx.test) {
      const used = await deps.store.memberCallsSince(ctx.userId, key, ctx.dayStart);
      if (used >= feature.dailyCap) {
        const id = await deps.store.startCall(start);
        await deps.store.finishCall(id, { ...blank, model, outcome: 'cap_blocked', latencyMs: 0, errorCategory: 'member_cap', errorMessage: `Daily cap ${feature.dailyCap} reached` }, month, ctx.teamId);
        return { ok: false, reason: 'member_cap', callId: id, message: 'You’ve reached today’s limit for this AI feature.' };
      }
    }

    const callId = await deps.store.startCall(start);
    const t0 = Date.now();
    const userBlocks = def.buildUser(parsedInput.data);
    const snapshot = (response: string) => (settings.promptRetentionDays > 0 ? { system: def.system, user: snapshotText(userBlocks), response } : null);

    if (deps.mode === 'mock') {
      const data = def.sanitise(def.mock(parsedInput.data), parsedInput.data);
      const latencyMs = Date.now() - t0;
      await deps.store.finishCall(callId, { ...blank, model: 'mock', outcome: 'ok', latencyMs, promptSnapshot: snapshot(JSON.stringify(data)) }, month, ctx.teamId);
      return { ok: true, data, callId, model: 'mock', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, latencyMs }, warnAtCap: atCap };
    }

    if (!deps.apiKey) {
      await deps.store.finishCall(callId, { ...blank, model, outcome: 'error', latencyMs: 0, errorCategory: 'config', errorMessage: 'ANTHROPIC_API_KEY is not set' }, month, ctx.teamId);
      return { ok: false, reason: 'error', callId, message: 'AI is not configured.' };
    }

    const errs = await sdkErrors();
    try {
      const client = (deps.clientOverride ?? (await getAnthropic(deps.apiKey))) as Awaited<ReturnType<typeof getAnthropic>>;
      const isSonnet = model.startsWith('claude-sonnet');
      const format = await outputFormat(def.output);
      const params = {
        model,
        max_tokens: def.maxTokens,
        system: [{ type: 'text' as const, text: def.system, cache_control: { type: 'ephemeral' as const } }],
        messages: [{ role: 'user' as const, content: userBlocks }],
        output_config: isSonnet ? { format, effort: def.effort } : { format },
        ...(isSonnet && deps.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      };
      const res = await client.beta.messages.parse(params as never, { signal: AbortSignal.timeout(def.timeoutMs), timeout: def.timeoutMs });
      const latencyMs = Date.now() - t0;
      const usage = res.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; iterations?: { type: string }[] | null };
      const pricing = await deps.store.pricingFor(res.model, now.toISOString().slice(0, 10));
      const tokens = {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd: costOf(usage, pricing),
      };
      const requestId = (res as { _request_id?: string | null })._request_id ?? null;
      if (res.stop_reason === 'refusal') {
        const category = (res as { stop_details?: { category?: string | null } | null }).stop_details?.category ?? 'refusal';
        await deps.store.finishCall(callId, { ...blank, ...tokens, model: res.model, outcome: 'refused', latencyMs, errorCategory: category, errorMessage: 'Model declined', requestId }, month, ctx.teamId);
        return { ok: false, reason: 'refused', callId, message: 'The AI declined this request.' };
      }
      const parsed = res.parsed_output == null ? null : def.output.safeParse(res.parsed_output);
      if (!parsed || !parsed.success) {
        await deps.store.finishCall(callId, { ...blank, ...tokens, model: res.model, outcome: 'invalid_output', latencyMs, errorCategory: res.stop_reason === 'max_tokens' ? 'max_tokens' : 'schema', errorMessage: 'Output failed validation', requestId }, month, ctx.teamId);
        return { ok: false, reason: 'invalid_output', callId, message: 'The AI answer could not be used.' };
      }
      const data = def.sanitise(parsed.data, parsedInput.data);
      const usedFallback = (usage.iterations ?? []).some((i) => i.type === 'fallback_message');
      await deps.store.finishCall(callId, { ...blank, ...tokens, model: res.model, outcome: usedFallback ? 'fallback' : 'ok', latencyMs, requestId, promptSnapshot: snapshot(JSON.stringify(data)) }, month, ctx.teamId);
      return { ok: true, data, callId, model: res.model, usage: { inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, cacheReadTokens: tokens.cacheReadTokens, costUsd: tokens.costUsd, latencyMs }, warnAtCap: atCap };
    } catch (e) {
      const latencyMs = Date.now() - t0;
      const timeout = errs.isTimeout(e);
      const status = errs.status(e);
      await deps.store.finishCall(
        callId,
        { ...blank, model, outcome: timeout ? 'timeout' : 'error', latencyMs, errorCategory: timeout ? 'timeout' : status ? `http_${status}` : 'exception', errorMessage: ((e as Error).message ?? 'error').slice(0, 300), requestId: errs.requestId(e) },
        month,
        ctx.teamId,
      );
      return { ok: false, reason: timeout ? 'timeout' : 'error', callId, message: timeout ? 'The AI took too long.' : 'The AI call failed.' };
    }
  }
  return { callFeature, mode: deps.mode };
}
