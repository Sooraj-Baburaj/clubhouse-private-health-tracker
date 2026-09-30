import type { AiFeatureKey, AiModel, AiOutcome } from '@clubhouse/contracts';

export interface AiFeatureSetting {
  on: boolean;
  model: string;
  dailyCap: number;
}

export interface AiTeamSettings {
  globalOn: boolean;
  features: Record<string, AiFeatureSetting>;
  budget: { monthlyCapUsd: number; alertAtPercent: number; atCapBehaviour: 'disable' | 'warn' };
  promptRetentionDays: number;
}

export interface Pricing {
  model: string;
  inputPerMtok: number;
  outputPerMtok: number;
  cacheReadPerMtok: number;
  cacheWritePerMtok: number;
}

export interface CallRowStart {
  teamId: string;
  userId: string | null;
  feature: AiFeatureKey;
  requestedModel: string;
  promptVersion: string;
  entityType: string | null;
  entityId: string | null;
  imageCount: number;
  test: boolean;
}

export interface CallRowFinish {
  model: string;
  outcome: AiOutcome;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  errorCategory: string | null;
  errorMessage: string | null;
  requestId: string | null;
  promptSnapshot: { system: string; user: string; response: string } | null;
}

/** Persistence port implemented by the server (Drizzle). */
export interface AiStore {
  getSettings(teamId: string): Promise<AiTeamSettings>;
  monthSpend(teamId: string, month: string): Promise<number>;
  memberCallsSince(userId: string, feature: AiFeatureKey, since: Date): Promise<number>;
  startCall(row: CallRowStart): Promise<string>;
  finishCall(id: string, row: CallRowFinish, month: string, teamId: string): Promise<void>;
  pricingFor(model: string, onDate: string): Promise<Pricing | null>;
}

export interface AiCallContext {
  teamId: string;
  userId: string | null;
  /** Start of the member's local day, for per-member daily caps. */
  dayStart: Date;
  memberOptedOut?: boolean;
  entity?: { type: string; id: string } | null;
  test?: boolean;
}

export type AiFailureReason = 'disabled' | 'opted_out' | 'budget' | 'member_cap' | 'timeout' | 'invalid_output' | 'refused' | 'error';

export type AiResult<T> =
  | { ok: true; data: T; callId: string; model: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number; latencyMs: number }; warnAtCap: boolean }
  | { ok: false; reason: AiFailureReason; callId: string | null; message: string };

export type ModelId = AiModel | 'mock';
