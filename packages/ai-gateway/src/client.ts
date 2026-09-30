/**
 * The ONLY file in the repository allowed to import the Anthropic SDK (SYS-AI-10).
 * test/guards.test.ts fails the build if the SDK or the API host is referenced anywhere else.
 */
import type AnthropicType from '@anthropic-ai/sdk';

let client: AnthropicType | null = null;

export async function getAnthropic(apiKey: string): Promise<AnthropicType> {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return client;
}

export async function outputFormat<T>(schema: import('zod').ZodType<T>) {
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
  return betaZodOutputFormat(schema as never);
}

export async function sdkErrors() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return {
    isTimeout: (e: unknown) => e instanceof Anthropic.APIConnectionTimeoutError || (e as Error)?.name === 'AbortError' || (e as Error)?.name === 'TimeoutError',
    isRateLimit: (e: unknown) => e instanceof Anthropic.RateLimitError,
    isApiError: (e: unknown) => e instanceof Anthropic.APIError,
    status: (e: unknown) => (e instanceof Anthropic.APIError ? e.status : undefined),
    requestId: (e: unknown) => (e instanceof Anthropic.APIError ? (e.requestID ?? null) : null),
  };
}

/** Beta header for the server-side refusal fallback in its "default" scalar form. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
