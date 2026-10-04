/**
 * `pnpm seed:demo` — a demo team for local development, screenshots and e2e: six members with 30 days of food,
 * activity and weight logs, activity plans, two diet plans and a little chat. Everything is written through the real
 * application services with a moving clock, so streaks, day facts and bands come out exactly as in production.
 *
 * Refuses to run with NODE_ENV=production. Re-run with --reset to delete and recreate the demo members.
 */
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ActivityLevel, GoalType, MealSlot, Role, Sex } from '@clubhouse/contracts';
import { addDays, dateRange, localDateOf, nutritionFor, roundTotals, sumTotals, weekdayOf, zonedToUtc } from '@clubhouse/domain';
import { schema as s, seed } from '@clubhouse/db';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const { loadEnv } = await import('../src/config/env');
const { buildContainer } = await import('../src/container');
const { FixedClock } = await import('../src/infrastructure/clock');
const { completeOnboarding, updatePreferences } = await import('../src/application/profile');
const { upsertActivityLog, upsertFoodLog, upsertWeight } = await import('../src/application/logs');
const { computeDayFacts, recomputeMemberStreaks, recomputeTeamStreak } = await import('../src/application/momentum');
const { sendMessage } = await import('../src/application/chat');
const { getTeam, invalidateTeam } = await import('../src/application/team');
const { storeImage } = await import('../src/application/media');
const { createFood, createRecipe } = await import('../src/application/foods');
const { backfillBoard } = await import('../src/application/board');
import type { AuthUser } from '../src/interface/http/types';

const env = loadEnv();
if (env.isProd && !process.argv.includes('--force')) {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}
const RESET = process.argv.includes('--reset');
const DAYS = 30;
export const DEMO_PASSWORD = 'clubhouse-demo-1';

const clock = new FixedClock(new Date());
const c = buildContainer(env, { clock });

// Deterministic randomness so every run produces the same demo (mulberry32).
let seedState = 20260930;
const rand = () => {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

interface DemoMember {
  username: string;
  displayName: string;
  role: Role;
  sex: Sex;
  dob: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  pace: number | null;
  targetWeightKg: number | null;
  consistency: number;
  plan: { type: string; perWeek: number; days: number[]; time: string; minutes: number }[];
  privacy?: { teammatesSee: 'summary' | 'full'; teamPulseOptIn: boolean };
}

const MEMBERS: DemoMember[] = [
  { username: 'rahul', displayName: 'Rahul Mehta', role: 'member', sex: 'male', dob: '1990-05-10', heightCm: 178, weightKg: 84, activityLevel: 'moderate', goalType: 'lose', pace: 0.5, targetWeightKg: 76, consistency: 0.92, plan: [{ type: 'gym', perWeek: 3, days: [0, 2, 4], time: '07:00', minutes: 50 }] },
  { username: 'priya', displayName: 'Priya Nair', role: 'member', sex: 'female', dob: '1996-08-21', heightCm: 160, weightKg: 58, activityLevel: 'light', goalType: 'maintain', pace: null, targetWeightKg: null, consistency: 0.82, plan: [{ type: 'yoga', perWeek: 3, days: [1, 3, 5], time: '06:30', minutes: 40 }], privacy: { teammatesSee: 'full', teamPulseOptIn: true } },
  { username: 'arjun', displayName: 'Arjun Singh', role: 'member', sex: 'male', dob: '1988-11-02', heightCm: 172, weightKg: 70, activityLevel: 'active', goalType: 'gain', pace: 0.25, targetWeightKg: 74, consistency: 0.72, plan: [{ type: 'running', perWeek: 4, days: [0, 2, 4, 6], time: '06:00', minutes: 35 }] },
  { username: 'meera', displayName: 'Meera Iyer', role: 'member', sex: 'female', dob: '1992-02-14', heightCm: 168, weightKg: 66, activityLevel: 'moderate', goalType: 'lose', pace: 0.25, targetWeightKg: 61, consistency: 0.97, plan: [{ type: 'walking', perWeek: 5, days: [0, 1, 2, 3, 4], time: '18:30', minutes: 40 }], privacy: { teammatesSee: 'full', teamPulseOptIn: true } },
  { username: 'kabir', displayName: 'Kabir Khan', role: 'member', sex: 'male', dob: '1999-07-30', heightCm: 181, weightKg: 76, activityLevel: 'very_active', goalType: 'maintain', pace: null, targetWeightKg: null, consistency: 0.6, plan: [{ type: 'cycling', perWeek: 3, days: [1, 4, 5], time: '07:30', minutes: 60 }] },
  { username: 'neha', displayName: 'Neha Kapoor', role: 'admin', sex: 'female', dob: '1991-04-03', heightCm: 163, weightKg: 62, activityLevel: 'light', goalType: 'lose', pace: 0.25, targetWeightKg: 58, consistency: 0.85, plan: [{ type: 'gym', perWeek: 2, days: [1, 3], time: '19:00', minutes: 45 }, { type: 'walking', perWeek: 3, days: [0, 2, 5], time: '07:00', minutes: 30 }] },
];

const MENU: Record<MealSlot, string[][]> = {
  breakfast: [['Poha', 'Masala chai'], ['Idli', 'Sambar'], ['Masala dosa'], ['Upma', 'Masala chai'], ['Oats porridge', 'Banana'], ['Boiled egg', 'Roti'], ['Aloo paratha', 'Buttermilk']],
  morning_snack: [['Banana'], ['Apple'], ['Almonds'], ['Roasted chana'], ['Coffee, brewed']],
  lunch: [['Dal tadka', 'Roti', 'Jeera rice'], ['Rajma', 'Jeera rice'], ['Chicken curry', 'Roti', 'Green salad'], ['Chole', 'Roti'], ['Sambar', 'Jeera rice'], ['Dal fry', 'Roti', 'Green salad']],
  evening_snack: [['Masala chai', 'Samosa'], ['Roasted chana'], ['Buttermilk'], ['Masala chai'], ['Apple', 'Almonds']],
  dinner: [['Paneer butter masala', 'Roti'], ['Dal fry', 'Roti'], ['Chicken biryani'], ['Egg bhurji', 'Roti'], ['Dal tadka', 'Jeera rice', 'Green salad'], ['Chicken curry', 'Jeera rice']],
};
const SLOT_TIME: Record<MealSlot, string> = { breakfast: '08:45', morning_snack: '11:15', lunch: '13:40', evening_snack: '17:30', dinner: '20:45' };

const byName0 = (users: { m: DemoMember; user: AuthUser }[], username: string) => users.find((u) => u.m.username === username)!.user;

async function main() {
  const team = (await c.db.query.teams.findFirst()) ?? (await seed.ensureTeam(c.db, { name: 'Clubhouse', timezone: 'Asia/Kolkata' }));
  await seed.seedActivityTypes(c.db);
  await seed.seedPricing(c.db);
  await seed.seedTriggers(c.db, team.id);
  const tz = team.timezone;

  const usernames = MEMBERS.map((m) => m.username);
  const existing = await c.db.query.users.findMany({ where: and(eq(s.users.teamId, team.id), inArray(s.users.username, usernames)) });
  if (existing.length && !RESET) {
    console.log(`Demo members already exist (${existing.map((u) => u.username).join(', ')}). Run with --reset to recreate them.`);
    return;
  }
  if (existing.length) {
    const ids = existing.map((u) => u.id);
    await c.db.delete(s.messages).where(inArray(s.messages.userId, ids));
    await c.db.delete(s.users).where(inArray(s.users.id, ids));
    console.log(`Removed ${ids.length} demo members.`);
  }

  // Foods by name (global seed rows only).
  const names = [...new Set(Object.values(MENU).flat(2))];
  const foods = await c.db.select().from(s.foodItems).where(and(isNull(s.foodItems.teamId), isNull(s.foodItems.deletedAt), inArray(s.foodItems.name, names)));
  // Prefer the curated Indian rows (household servings) over USDA rows with the same name.
  const food = new Map([...foods].sort((a, b) => Number(a.source === 'seed') - Number(b.source === 'seed')).map((f) => [f.name, f]));
  const missing = names.filter((n) => !food.has(n));
  if (missing.length) console.warn(`Foods not in the database (skipped): ${missing.join(', ')}. Run pnpm seed:foods first for a complete demo.`);
  const types = await c.db.query.activityTypes.findMany({ where: isNull(s.activityTypes.teamId) });
  const typeByKey = new Map(types.map((t) => [t.key, t]));

  const now = new Date();
  const today = localDateOf(now, tz);
  const start = addDays(today, -DAYS);
  const hash = await c.hasher.hash(DEMO_PASSWORD);
  const admin = await c.db.query.users.findFirst({ where: and(eq(s.users.teamId, team.id), eq(s.users.role, 'super_admin')) });

  const users: { m: DemoMember; user: AuthUser }[] = [];
  for (const m of MEMBERS) {
    clock.set(zonedToUtc(start, '09:00', tz));
    const row = await seed.provisionMember(c.db, { teamId: team.id, username: m.username, displayName: m.displayName, email: `${m.username}@demo.clubhouse.test`, role: m.role, passwordHash: hash, mustChangePassword: false, tempPasswordExpiresAt: null, createdBy: admin?.id ?? null });
    await c.db.update(s.users).set({ createdAt: clock.now() }).where(eq(s.users.id, row.id));
    const user: AuthUser = { id: row.id, teamId: team.id, username: row.username, displayName: row.displayName, email: row.email, role: m.role, mustChangePassword: false, timezone: tz, teamTimezone: tz, totpEnabled: false, avatarImageId: null };
    await completeOnboarding(c, user, { units: 'metric', heightCm: m.heightCm, weightKg: m.weightKg, dob: m.dob, sex: m.sex, activityLevel: m.activityLevel, goalType: m.goalType, paceKgWeek: m.pace, targetWeightKg: m.targetWeightKg, targetDate: null, timezone: tz });
    if (m.privacy) await updatePreferences(c, user, { privacy: { ...m.privacy, roastMemes: true, roastPromptSeen: true } });

    // Activity plan with the member's chosen days.
    const [plan] = await c.db.insert(s.activityPlans).values({ userId: user.id, note: 'Keep it steady — any day of the week counts.', createdBy: admin?.id ?? null }).returning();
    for (const [i, p] of m.plan.entries()) {
      const t = typeByKey.get(p.type)!;
      const [item] = await c.db.insert(s.activityPlanItems).values({ planId: plan!.id, typeId: t.id, perWeek: p.perWeek, targetMin: p.minutes, suggestedDays: p.days, sortOrder: i }).returning();
      await c.db.insert(s.activityPlanDays).values(p.days.map((weekday) => ({ itemId: item!.id, weekday, time: p.time })));
    }
    await c.db.update(s.activityPlans).set({ createdAt: clock.now() }).where(eq(s.activityPlans.id, plan!.id));
    users.push({ m, user });
  }

  // Two members get a published diet plan built from real foods.
  for (const { user, m } of users.filter((u) => ['rahul', 'meera'].includes(u.m.username))) {
    const [plan] = await c.db
      .insert(s.dietPlans)
      .values({ teamId: team.id, userId: user.id, name: m.goalType === 'lose' ? 'Lean week' : 'Steady plates', version: 1, status: 'published', note: 'More protein at lunch, lighter dinners.', createdBy: admin?.id ?? null, publishedBy: admin?.id ?? null, publishedAt: new Date(now.getTime() - 10 * 86400_000), effectiveFrom: addDays(today, -10) })
      .returning();
    let order = 0;
    for (const slot of Object.keys(MENU) as MealSlot[]) {
      for (const combo of MENU[slot].slice(0, 3)) {
        const items = combo
          .map((n) => food.get(n))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .map((f) => {
            const sv = f.servingOptions.find((o) => o.label === f.defaultServing) ?? f.servingOptions[0] ?? { label: '100 g', grams: 100 };
            return { foodId: f.id, name: f.name, grams: sv.grams, servings: 1, servingLabel: sv.label, nutrition: roundTotals(nutritionFor(f.per100g, sv.grams)), source: 'diet' as const, aiEstimate: false };
          });
        if (!items.length) continue;
        await c.db.insert(s.dietMealOptions).values({ planId: plan!.id, mealSlot: slot, name: combo.join(' + '), items, nutrition: roundTotals(sumTotals(items.map((i) => i.nutrition))), sortOrder: order++ });
      }
    }
  }

  // 30 days of logs, written with the clock at the moment each entry was made.
  let foodLogs = 0;
  let activityLogs = 0;
  let weights = 0;
  for (const { m, user } of users) {
    const drift = m.goalType === 'lose' ? -0.06 : m.goalType === 'gain' ? 0.035 : 0;
    for (const date of dateRange(addDays(start, 1), today)) {
      const isToday = date === today;
      const nowLocal = localDateOf(now, tz) === date ? now : null;
      if (rand() > m.consistency && !isToday) continue;
      for (const slot of Object.keys(MENU) as MealSlot[]) {
        if ((slot === 'morning_snack' || slot === 'evening_snack') && rand() < 0.45) continue;
        const at = zonedToUtc(date, SLOT_TIME[slot], tz);
        if (nowLocal && at > nowLocal) continue;
        clock.set(new Date(at.getTime() + Math.floor(rand() * 20) * 60_000));
        const combo = pick(MENU[slot]).map((n) => food.get(n)).filter((f): f is NonNullable<typeof f> => !!f);
        if (!combo.length) continue;
        const factor = 0.8 + rand() * 0.6;
        await upsertFoodLog(
          c,
          user,
          randomUUID(),
          {
            date,
            mealSlot: slot,
            loggedAt: clock.now().toISOString(),
            clientUpdatedAt: clock.now().toISOString(),
            items: combo.map((f) => {
              const sv = f.servingOptions.find((o) => o.label === f.defaultServing) ?? f.servingOptions[0] ?? { label: '100 g', grams: 100 };
              return { foodId: f.id, name: f.name, grams: Math.round(sv.grams * factor), servings: Math.round(factor * 10) / 10, servingLabel: sv.label, source: 'search' as const };
            }),
          },
          { skipEffects: true },
        );
        foodLogs++;
      }
      for (const p of m.plan) {
        if (!p.days.includes(weekdayOf(date)) || rand() < 0.2) continue;
        const at = zonedToUtc(date, p.time, tz);
        if (nowLocal && at > nowLocal) continue;
        clock.set(new Date(at.getTime() + (p.minutes + 5) * 60_000));
        const t = typeByKey.get(p.type)!;
        const minutes = p.minutes + Math.round((rand() - 0.5) * 20);
        await upsertActivityLog(
          c,
          user,
          randomUUID(),
          {
            date,
            loggedAt: clock.now().toISOString(),
            clientUpdatedAt: clock.now().toISOString(),
            typeId: t.id,
            durationMin: minutes,
            distanceKm: t.inputs.includes('distance') ? Math.round(minutes * (p.type === 'cycling' ? 0.33 : p.type === 'running' ? 0.16 : 0.09) * 10) / 10 : null,
            intensity: t.inputs.includes('intensity') ? pick(['light', 'moderate', 'hard'] as const) : null,
            focus: t.inputs.includes('focus') ? pick(['strength', 'mixed', 'cardio'] as const) : null,
          },
          { skipEffects: true },
        );
        activityLogs++;
      }
      if (weekdayOf(date) === 0 || date === addDays(start, 1)) {
        clock.set(zonedToUtc(date, '07:10', tz));
        const days = DAYS - (Date.parse(today) - Date.parse(date)) / 86400_000;
        await upsertWeight(c, user, randomUUID(), { date, weightKg: Math.round((m.weightKg + drift * days + (rand() - 0.5) * 0.6) * 10) / 10, clientUpdatedAt: clock.now().toISOString() }, { skipEffects: true });
        weights++;
      }
    }
  }

  // Day facts and streaks, computed once at the end exactly as the nightly job would.
  clock.set(now);
  for (const { user } of users) {
    for (const date of dateRange(start, today)) await computeDayFacts(c, user.id, date);
    await recomputeMemberStreaks(c, user.id, today);
  }
  await recomputeTeamStreak(c, team.id, today);

  // A food with portions (scoop, tbsp) and a saved dish with its ingredients, both logged today.
  const rahul = byName0(users, 'rahul');
  const priya = byName0(users, 'priya');
  clock.set(now);
  const whey = await createFood(c, rahul, {
    name: 'Whey protein',
    brand: 'MuscleBlaze Biozyme',
    basis: { unit: 'scoop', amount: 1, grams: 32 },
    nutrients: { kcal: 120, protein: 24, carbs: 3, fat: 1.6, fibre: 0 },
    portions: [{ unit: 'tbsp', amount: 1, grams: 8 }],
    tags: ['high_protein'],
    veg: true,
  });
  const fruitNames = ['Apple', 'Banana', 'Grapes', 'Pomegranate'];
  const fruits = await c.db.select().from(s.foodItems).where(and(isNull(s.foodItems.teamId), isNull(s.foodItems.deletedAt), inArray(s.foodItems.name, fruitNames)));
  const fruit = new Map(fruits.map((f) => [f.name, f]));
  const dishParts = [
    ['Apple', 150, '1 medium'],
    ['Banana', 118, '1 piece'],
    ['Grapes', 92, '1 cup'],
    ['Pomegranate', 87, '½ cup'],
  ] as const;
  const components = dishParts.filter(([n]) => fruit.has(n)).map(([n, grams, label]) => ({ foodId: fruit.get(n)!.id, name: n, grams, servings: 1, servingLabel: label }));
  if (components.length >= 2) {
    const recipe = await createRecipe(c, priya, { name: 'Fruit salad', components, makes: 2 });
    const at = zonedToUtc(today, '11:05', tz);
    if (at <= now) {
      clock.set(at);
      await upsertFoodLog(c, priya, randomUUID(), { date: today, mealSlot: 'morning_snack', loggedAt: at.toISOString(), clientUpdatedAt: at.toISOString(), items: [{ foodId: null, name: 'Fruit salad', grams: 0, servings: 1, servingLabel: '1 of 2 servings', source: 'recipe', components, batchServings: 2, recipeId: recipe.id }] }, { skipEffects: true });
    }
  }
  const wheyAt = zonedToUtc(today, '07:40', tz);
  if (wheyAt <= now) {
    clock.set(wheyAt);
    await upsertFoodLog(c, rahul, randomUUID(), { date: today, mealSlot: 'breakfast', loggedAt: wheyAt.toISOString(), clientUpdatedAt: wheyAt.toISOString(), items: [{ foodId: whey.id, name: whey.name, grams: 64, servings: 2, servingLabel: '1 scoop', source: 'search' }] }, { skipEffects: true });
  }
  clock.set(now);

  // The leaderboard, rebuilt from those logs exactly as the deploy backfill does (closed weeks get awards, quietly).
  await backfillBoard(c, team.id, DAYS);

  // A little chat so the Chat tab is not empty.
  const lines: [string, string][] = [
    ['meera', 'Morning walk done 🌅 who is joining tomorrow?'],
    ['rahul', 'Gym streak alive. Legs day was brutal 😅'],
    ['priya', 'Tried the curd rice from my plan, 10/10'],
    ['arjun', 'Long run on Sunday, 10k at easy pace. Anyone?'],
    ['kabir', 'In! Count me for Sunday'],
    ['neha', 'Reminder: log dinner before 10 so your streaks stay safe 🙌'],
  ];
  const byName = new Map(users.map((u) => [u.m.username, u.user]));
  for (const [i, [who, body]] of lines.entries()) {
    clock.set(new Date(now.getTime() - (lines.length - i) * 47 * 60_000));
    await sendMessage(c, byName.get(who)!, randomUUID(), { body, attachments: [] }).catch((e: Error) => console.warn('chat:', e.message));
  }
  await c.db.execute(sql`delete from ${s.notifications} where user_id in ${users.map((u) => u.user.id)} and type = 'chat_mention'`).catch(() => undefined);

  // A small meme library (generated cards) and a few enabled starter triggers, so meme moments can be tried locally.
  const memeCount = await c.db.$count(s.memes, eq(s.memes.teamId, team.id));
  if (memeCount === 0) {
    const owner = byName.get('neha')!;
    const cards: { caption: string; tags: string[]; tone: 'roast' | 'celebrate' | 'neutral'; bg: string; emoji: string }[] = [
      { caption: 'Salad era unlocked', tags: ['salad', 'celebrate'], tone: 'celebrate', bg: '#5f8f2f', emoji: '🥗' },
      { caption: 'Gym target: smashed', tags: ['gym', 'celebrate'], tone: 'celebrate', bg: '#2f6f8f', emoji: '🏋️' },
      { caption: 'That plate had ambitions', tags: ['heavy'], tone: 'roast', bg: '#b6316c', emoji: '🍛' },
      { caption: 'Midnight fridge raid spotted', tags: ['late'], tone: 'roast', bg: '#3b2f6f', emoji: '🌙' },
      { caption: 'Dessert, again? Respect.', tags: ['dessert'], tone: 'roast', bg: '#c26a1b', emoji: '🍰' },
      { caption: 'New personal best!', tags: ['record', 'celebrate'], tone: 'celebrate', bg: '#8f6f2f', emoji: '🏅' },
      { caption: 'The comeback is real', tags: ['comeback', 'celebrate'], tone: 'celebrate', bg: '#2f8f6a', emoji: '🔥' },
      { caption: 'Full house today, crew!', tags: ['team', 'celebrate'], tone: 'celebrate', bg: '#6f2f8f', emoji: '🎉' },
    ];
    const sharp = (await import('sharp')).default;
    for (const card of cards) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" rx="32" fill="${card.bg}"/><text x="300" y="220" font-size="150" text-anchor="middle">${card.emoji}</text><text x="300" y="360" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="40" fill="#fff" text-anchor="middle">${card.caption}</text></svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const { row } = await storeImage(c, owner, png, 'meme');
      await c.db.insert(s.memes).values({ teamId: team.id, imageId: row.id, caption: card.caption, tags: card.tags, tone: card.tone, enabled: true, status: 'approved' });
    }
    await c.db
      .update(s.memeTriggers)
      .set({ enabled: true })
      .where(and(eq(s.memeTriggers.teamId, team.id), inArray(s.memeTriggers.catalogKey, ['salad_energy', 'gym_target_hit', 'heavy_meal', 'new_best', 'comeback', 'team_full_house'])));
    invalidateTeam(team.id);
  }

  const settings = await getTeam(c, team.id);
  console.log(
    [
      `Demo team "${settings.name}" ready: ${users.length} members, ${foodLogs} food logs, ${activityLogs} activities, ${weights} weigh-ins over ${DAYS} days.`,
      `Sign in as any of: ${usernames.join(', ')}  (password: ${DEMO_PASSWORD})`,
    ].join('\n'),
  );
}

try {
  await main();
} finally {
  await c.sql.end({ timeout: 5 });
}
