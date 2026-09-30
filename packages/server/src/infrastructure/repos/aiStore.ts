import { and, desc, eq, gte, lte, notInArray, sql } from 'drizzle-orm';
import type { AiStore, AiTeamSettings, CallRowFinish, CallRowStart, Pricing } from '@clubhouse/ai-gateway';
import { schema as s, type Db } from '@clubhouse/db';

export class DrizzleAiStore implements AiStore {
  constructor(private db: Db) {}

  async getSettings(teamId: string): Promise<AiTeamSettings> {
    const row = await this.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) });
    if (!row) return { globalOn: false, features: {}, budget: { monthlyCapUsd: 0, alertAtPercent: 80, atCapBehaviour: 'disable' }, promptRetentionDays: 0 };
    return { globalOn: row.globalOn, features: row.features, budget: row.budget, promptRetentionDays: row.promptRetentionDays };
  }

  async monthSpend(teamId: string, month: string): Promise<number> {
    const row = await this.db.query.aiBudgets.findFirst({ where: and(eq(s.aiBudgets.teamId, teamId), eq(s.aiBudgets.month, month)) });
    return row ? Number(row.spentUsd) : 0;
  }

  async memberCallsSince(userId: string, feature: string, since: Date): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.userId, userId), eq(s.aiCalls.feature, feature), gte(s.aiCalls.startedAt, since), notInArray(s.aiCalls.outcome, ['budget_blocked', 'cap_blocked']), eq(s.aiCalls.test, false)));
    return r?.n ?? 0;
  }

  async startCall(row: CallRowStart): Promise<string> {
    const [r] = await this.db
      .insert(s.aiCalls)
      .values({ ...row, model: row.requestedModel, outcome: 'pending' })
      .returning({ id: s.aiCalls.id });
    return r!.id;
  }

  async finishCall(id: string, row: CallRowFinish, month: string, teamId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(s.aiCalls)
        .set({ ...row, finishedAt: new Date() })
        .where(eq(s.aiCalls.id, id));
      if (row.costUsd > 0 || row.outcome === 'ok' || row.outcome === 'fallback') {
        const settings = await tx.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) });
        await tx
          .insert(s.aiBudgets)
          .values({ teamId, month, capUsd: settings?.budget.monthlyCapUsd ?? 0, spentUsd: row.costUsd, calls: 1 })
          .onConflictDoUpdate({
            target: [s.aiBudgets.teamId, s.aiBudgets.month],
            set: { spentUsd: sql`${s.aiBudgets.spentUsd} + ${row.costUsd}`, calls: sql`${s.aiBudgets.calls} + 1`, updatedAt: new Date() },
          });
      }
    });
  }

  async pricingFor(model: string, onDate: string): Promise<Pricing | null> {
    const row = await this.db.query.aiPricing.findFirst({
      where: and(eq(s.aiPricing.model, model), lte(s.aiPricing.effectiveFrom, onDate)),
      orderBy: [desc(s.aiPricing.effectiveFrom)],
    });
    if (!row) {
      const any = await this.db.query.aiPricing.findFirst({ where: eq(s.aiPricing.model, model), orderBy: [desc(s.aiPricing.effectiveFrom)] });
      return any ?? null;
    }
    return row;
  }
}
