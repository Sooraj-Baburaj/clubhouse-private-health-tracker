# Team tab, Leaderboard and Meal logging — feature plan

Status: **v1 built (2026-10-04)** from the Claude Design screens (member `Clubhouse Member App.dc.html`, admin
`Clubhouse Admin.dc.html`; the prompt is [team-leaderboard-and-meal-logging.design-prompt.md](team-leaderboard-and-meal-logging.design-prompt.md)).
Ships with migration `0006_board_and_meals`; run `pnpm board:backfill` once after the deploy (DEPLOY.md §7).

Built: Team tab (Your week, 5a podium board with This week / Solid days, 👑 Most consistent, last week's results and
awards, Crew today, team streak, points and member sheets), chat as a layer behind the Chat pill, Progress and Momentum
made personal, the meal flow (Meal screen, Snap with AI on or off, the AI read with "Not right?" swaps and grouping into a
dish, Food detail, Dish with ingredients and recipes, Create a food with portions), photo-only meals ("Finish later"),
offline photo uploads, and the admin Leaderboard settings, Overview card and Foods portions editor.

Decisions taken (the §11 questions): everyone is on the board with a privacy opt-out; team pulse steps aside while the
board is on; habits stay separate; unplanned workouts count from 20 minutes (team setting); the Snap and Chat pills sit
**bottom-right** as designed (not bottom-left as first planned), with Snap on Today and the Meal screen; photo-only meals
count for the logging streak and +5; weeks close Monday 03:00; results post to chat when 3+ are ranked; offline snaps
are in; admins see a top-five card on the Overview.

Not in v1 yet: label scanning on Create a food (design 8c), AI-proposed ingredients for mixed dishes, meme trigger
events for the board, and an e2e test for the dish and create-food flows. Back-filled weeks use today's streaks for
their awards.

Three changes, shipped as independent phases:

1. **Team tab and Leaderboard** — the Chat tab becomes Team: a crew leaderboard (weekly **Crew points** plus a 28-day
   **Solid days** ranking whose leader holds the **Most consistent** crown), last week's awards, Crew today and the team
   streak. Chat moves behind a floating pill on the bottom-left of the Team tab, and opens straight away when the tab is
   tapped with unread messages.
2. **Progress is personal** — the Team section and the team-streak bits leave Progress and Momentum for the Team tab.
   Every personal section and analytic stays exactly as it is.
3. **Meal logging** — a Snap pill (bottom-left, camera) that works with AI on or off, a Meal screen with a Food detail
   screen, Dishes made of ingredients (a fruit salad and its fruits with portions) that can be saved as recipes, and
   Create a food with several portion units (scoop, piece, cup, katori…).

## 1. Goals and non-goals

Goals:

- Rank the crew on consistency and the decisions that move each person towards their own goal, fairly across different
  goals, body sizes and plans.
- Make chat one tap away without spending a tab on it, and give everything crew-based one home.
- Let members capture a meal in one tap even with AI off, and log composite meals truthfully.

Non-goals for v1:

- Weight, weight change, calorie totals or foods anywhere on the board.
- Several leagues, cross-team boards, prizes.
- Habits in Crew points (habit momentum stays separate from health momentum, as decided for Daily Habits).
- Members editing team-verified foods (admins keep that), AI ingredient breakdown of mixed dishes (later).

## 2. Decisions taken while planning

Change any of these in design review; the open questions in §11 are the ones that still need an answer.

| Topic | Decision |
|---|---|
| Chat entry | A floating "Chat" pill on the Team tab only (bottom-left). The unread badge moves from the Chat tab to Team. |
| Unread opens chat | Switching to Team from another tab with unread chat opens Chat over Team; back lands on Team. Tapping Team while on Team scrolls to the top. |
| Chat URL | `/chat` (with `?seq=` and `?tag=`) stays, so push and inbox links keep working; it becomes a full-screen layer over the tabs, kept mounted after the first open. |
| Ranking | Weekly Crew points (Mon–Sun, member-local) for the race; 28-day solid-day rate for the crown. |
| Fairness | Judged against each member's own targets and plan; daily and weekly caps; vacation days filled with your weekly average; logs added late earn nothing; an honest over-target day still earns its meal points. |
| Source of truth | Points are derived from day facts by a pure, versioned function — no event ledger — so edits, deletes and late fixes recompute cleanly. |
| Snap pill | On the Log food (Meal) screen, AI on or off; "Snap a meal" is always in the + sheet. Whether it also sits on Today is decided from the design trial. |
| Dishes | Stored as components inside the log item (a snapshot), one level deep, optionally saved as a recipe. |
| Portions | `ServingJson` gains unit metadata; per-100 g stays the canonical nutrition everywhere. |

## 3. Team tab

### 3.1 Navigation and behaviour

- `apps/web/src/app/uiStore.ts`: `TabKey` becomes `'today' | 'diet' | 'progress' | 'team'`, and `ORDER` follows.
- `apps/web/src/app/routes.tsx`: a new tab route `/team` (component `Empty`, like the other tabs); `TAB_PATHS` gains
  `'/team': 'team'` and drops `/chat`. `chatRoute` keeps `/chat` and its `seq` / `tag` search params but is rendered
  by the chat layer instead of the tab host. `/team/$memberId` (member day) is unchanged.
- `apps/web/src/app/AppShell.tsx`:
  - `TABS` swaps `chat: ChatPage` for `team: TeamPage`.
  - A new `ChatLayer`, next to `StackHost`, mounts `ChatPage` the first time `/chat` opens and keeps it mounted
    (hidden and `inert` when closed) so scroll position and the draft survive — the same reason tabs stay mounted
    (APP-NAV-07). It grows out of the pill (slides up when opened from the tab or a link) and closes with back, the
    header chevron or an edge swipe; reduced motion fades.
  - `/chat` is no longer a tab path, so today's `isStack = tabFromPath === null` would slide an empty stack screen in
    under the layer: treat `/chat` as its own case — tab bar hidden, tabs `inert`, `StackHost` closed.
  - `useUnreadAndLive(onChat)` takes "chat layer open" instead of "the active tab is chat".
- `apps/web/src/app/TabBar.tsx`: Team replaces Chat and shows `chatUnread`. Its click: when `chatUnread > 0` and the
  current tab isn't Team, navigate to `/team` and then push `/chat`, so back returns to Team. On Team already, scroll
  the pane to the top.
- `apps/web/src/pages/chat/ChatPage.tsx`: `active` stays `pathname === '/chat'`; the layer provides its scroll
  container through `PaneContext`; `ChatHeader` gains a back chevron. `Composer.tsx`'s `CHAT_DOCK_OFFSET` is worked
  out against the tab bar and the tab pane's 104 px bottom padding — redo it for the layer, docking on the safe-area
  inset.
- Back from a deep-linked chat with no history (opened from a push) goes to `/team`.
- `ui/organisms/team/ChatFab.tsx`: the pill, fixed bottom-left above the tab bar, with the unread count and a preview
  bubble on `chat.*` realtime events while Team is active (it reads the newest message from the chat cache).

### 3.2 Team tab contents

`pages/team/TeamPage.tsx`, top to bottom (the design picks Podium 5a or Race 5b):

1. Header — team name, member count, team-streak chip.
2. Your week — rank, points, the gap to the next person, pending points (yours only), next-move chips that deep-link
   to `/log/food?slot=…`, `/log/activity` and the weight sheet.
3. Leaderboard — This week | Solid days; podium or race rows; "How points work" sheet; member-card sheet; last week.
4. Last week's awards.
5. Crew today — the current `ui/organisms/team/TeamSection.tsx`, moved here (team pulse per open question 2).
6. Team streak — the dark tile from Momentum's `StreakTiles`.
7. The chat pill.

With the leaderboard switched off (team flag), sections 2–4 are hidden and the rest stays.

### 3.3 What leaves Progress and Momentum

- `pages/progress/ProgressPage.tsx`: drop the `team` section and the `TeamSection` import. Nothing links to
  `/progress?section=team` today (recap pushes link to `section=recaps`, which stays).
- `ui/organisms/progress/MomentumCard.tsx`: drop the "· team streak N" suffix.
- `ui/organisms/momentum/MomentumPieces.tsx` (`StreakTiles`): drop the dark Team streak tile; add the "Team streak is on
  the Team tab" link from the design.
- Today keeps its Crew row (`ui/organisms/today/CrewRow.tsx`); its title can link to `/team`.
- `MomentumResponse.team` and `crew` stay in the payload for now; trim later if nothing reads them.

## 4. Leaderboard

### 4.1 Principles

1. **Rank actions, never bodies.** No weight, weight change, kcal totals or foods on the board.
2. **Relative to you.** Calories and protein are judged against your own targets (which already encode lose, maintain
   or gain), workouts against your own plan — so different goals and sizes compete fairly.
3. **Honesty pays.** Logging an over-target day always earns more than not logging it.
4. **Consistency over bursts.** Daily caps, a weekly workout cap, and a 28-day ranking for the crown.
5. **Fresh starts.** The race resets every week; the bottom of the board is never called out.
6. **Deterministic.** A pure function of day facts, versioned, so rule changes recompute cleanly.

### 4.2 Crew points (rules v1)

| Every day (max 70) | Points | Settles |
|---|---|---|
| Each meal logged on time, up to 3 meal slots | +10 | when saved |
| A snapped meal still waiting for its foods (within the 3) | +5, topped up to +10 when finished | when saved |
| Calories on track (green) / a bit over or a bit low (yellow, from 70 % of target) | +25 / +10 | overnight |
| Protein on track or plenty (green, or yellow over) / a bit low (yellow, from 60 % of target) | +15 / +5 | overnight |

| Every week, Mon–Sun (max 260) | Points | Settles |
|---|---|---|
| Each workout — attributed to a plan item, or any activity of 20+ minutes — up to 4 a week | +40 | when saved |
| Weekly activity plan done (no plan: 3 workouts) | +40 | when the last session lands |
| A weigh-in (the value is never used) | +10, once | when saved |
| Full week: 2+ meals on time on every eligible day | +50, once | at week close |

Maximum 750 a week. Definitions:

- **On time** = not `addedLate` (the existing 48-hour rule in `isAddedLate`). Snack slots count as meals.
- **Calorie band** = `bandFor('kcal', eaten, budget, thresholds, true)` with the member's frozen day target and
  eat-back setting — the same band Today shows once the day closes. **Protein band** likewise.
- **Floors**: the default thresholds never turn under-eating red (anything under 85 % of the calorie target is yellow
  "a bit low", and the in-range streak counts it). The board adds floors — 70 % for calories, 60 % for protein — so a day
  with one small snack logged earns no calorie points and isn't a solid day. Constants in `BOARD_RULES_V1`.
- **Plan done** reuses the weekly plan logic (`attributeLogs`, `weekPlanProgress`). A week that is frozen for the
  activity streak (approved rest week, or 3+ vacation days) credits the bonus.
- The minimum minutes (20), the weekly workout cap (4) and the no-plan target (3) are team settings.

### 4.3 Solid days and the crown

- A **solid day** is a settled, eligible day with 2+ meals on time **and** at least one good call: calories that earned
  points (green, or yellow above the floor), protein on track, or a workout.
- **Solid-day rate** = solid days ÷ eligible days over the last 28 settled days (vacation days and days before joining
  are not eligible). Ranked from 7 eligible days ("Warming up" before); ties go to the longer logging streak, then the
  best streak.
- **👑 Most consistent**: the solid-day leader with at least 14 eligible days. The holder keeps it on a tie; a change of
  holder posts a celebrate system message in chat.
- The Progress "Consistency" score (SYS-CALC-33, 40/30/30) is personal and stays unchanged; the board uses the separate
  "Solid days" name to avoid confusing the two.

### 4.4 The weekly cycle

- A week is Monday to Sunday in each member's local time (`weekStartOf`).
- During the week, meals, workouts and weigh-ins count as they're saved; band and protein points land when the member's
  day settles (the 03:00 rule in `rolloverTargetDate`), which makes for a morning reveal.
- Movement arrows compare with the **dawn standings**, written by the team rollover once every member has settled
  yesterday (`rolloverTeams` already waits for that).
- The week **closes** when every active member has settled Sunday (Monday 03:00 local for the last one). The team
  rollover then finalises: final ranks, awards, the crown, a chat post, a push, and the Monday results card. Logs for
  Sunday saved after the close still count for streaks, not for the closed week (open question 7).

### 4.5 Awards (need 3+ ranked members)

| Award | Goes to |
|---|---|
| 🏆 Week winner | Most Crew points |
| 👑 Most consistent | The crown holder (28-day solid days) |
| 🔥 Iron streak | Longest active logging streak |
| 💪 Plan keeper | Most workouts counted, ties to plan done |
| 🥚 Protein pro | Most days with protein on track |
| 📈 Comeback | Biggest gain over the week before (at least +100) |

### 4.6 Edge cases

- **Vacation**: each vacation day is credited with the member's average daily points over the week's settled
  non-vacation days (shown 🏖). Four or more vacation days → "Away this week": not ranked, no awards.
- **Joined mid-week**: days before joining are treated like vacation days.
- **Deactivated**: dropped from live boards; finished weeks keep their row.
- **Small crews**: fewer than 3 ranked members → no podium and no awards.
- **Ties** share a rank; display order is solid days, then logging streak.
- **Rule changes**: rows store `rulesVersion`; a change recomputes the current week only.
- **Photo-only meals** count for the logging streak and +5, but the day's band is computed on what's logged, so the
  member is nudged to finish them.

### 4.7 Privacy

- The board shows rank, points, category points (meals, calories, protein, workouts, bonus), day-dots and streak
  flames. Never kcal, grams, foods or weight; a contract test asserts the payload has no such fields.
- Calories points reveal no more than the band pill teammates already see in Crew today; protein points are new
  information at category level (open question 1).
- **Show me on the leaderboard** (Settings › Privacy, `PrivacyPrefs.showOnBoard`, default on). Hidden members are left
  out of everyone's board, awards and crown; they still see the board and their own would-be rank.
- Team flag `featureFlags.leaderboard`. Team pulse is superseded while the board is on (open question 2).
- Ranks are never roast material: new trigger conditions are celebrate or neutral only (extend
  `ROAST_FORBIDDEN_CONDITIONS`).

### 4.8 Live feedback

- `LogSideEffects.points` drives a toast after a save — "+10 Crew points · you're #3" — and a small celebration on a
  rank-up (reduced-motion aware).
- Your week shows pending points ("+40 more tonight if you stay on track"), visible only to you.
- Next-move chips come from a pure `nextActions()`: meal slots not logged yet today, workouts left under the cap,
  weigh-in not done this week.

## 5. Meal logging

### 5.1 Vocabulary

**Meal** = one food log in a slot. **Food** = one item. **Dish** = an item made of ingredients. **Recipe** = a saved
dish. **Portion** = an amount and a unit.

### 5.2 Meal screen

`/log/food`, a rework of `pages/log/LogFoodPage.tsx` to the design's 2c:

- The draft moves out of component state into `features/mealDraft.ts` (zustand, persisted to `sessionStorage` per
  draft) so the Food detail, Dish and Create food overlays — and a camera-permission round trip — can't lose it. Edit
  mode loads a saved log into a draft, as `cartFromLog` does today.
- `CartItem` (`features/food.ts`) gains `components?: CartItem[]` and `batchServings?: number`; `itemNutrition`,
  `cartToItems` and `cartFromLog` handle dishes.
- Overlays are full-screen panels inside the flow that push a history entry, so Android back and the edge swipe close
  them before leaving the meal.
- The bottom row holds the Snap pill (left) and the save pill (right).

### 5.3 Snap

- `ui/organisms/log/SnapPill.tsx` and a full-screen `SnapCamera.tsx` that reuses `CameraCapture`'s getUserMedia and
  picker logic.
- **AI on** (`me.ai.photoAvailable`): the existing recognise path; the results view adds where-the-numbers-come-from
  badges, near-match alternatives, "Save as a food" for unmatched items, and multi-select "Group into a dish".
- **AI off, opted out, or over budget**: compress → upload (`useUploadFoodPhoto`) → photo card, search focused, and
  **Finish later**. This replaces `PhotoOffCard`.
- **+ sheet** (`pages/log/LogSheet.tsx`): "Snap a meal" is always present; its copy and the AI pill depend on
  `photoAvailable`; it opens `/log/food?mode=camera`.
- **Finish later**: a food log with `items: []`, an `imageId` and `pendingDetails: true` (§6). Today's logged list shows
  it as "Lunch · photo only — Add what's in it"; opening it lands on the Meal screen with the photo. It counts for the
  logging streak and +5 points.
- **Offline snaps** (phase 6b): the photo stays in IndexedDB; the outbox gains an `image_upload` op that runs before
  the dependent `food_log` op, and the log refers to the photo by its client id. `images.client_id` is already unique
  per owner and `storeImage` already dedupes on it, so the server can resolve the id once the upload lands.

### 5.4 Food detail

Replaces `ui/organisms/log/PortionSheet.tsx` for search results, plate rows and ingredients: unit chips from the food's
portions, fraction quick-picks, a typed g / ml amount (not offered for estimated-weight foods), the nutrition preview
(`nutritionFor`), favourite (existing endpoint), "Your usual" from `food_usage.last_serving_label` / `last_grams`, and
"Edit food" on your own foods.

### 5.5 Dishes and recipes

- **Make a dish** (empty), or **Group into a dish** from plate rows or AI results → the Dish view: name, ingredients
  (each a food and a portion, or a quick-add with nutrition), "Makes N servings" (batch) and "You had M", and "Save to My
  recipes".
- Logged as one item with `components`, a snapshot. Item nutrition = Σ components × eaten ÷ batch. Item tags = the
  union of the ingredients' food tags, so `food_tags` meme triggers and the fruit/vegetable tags keep working.
- **Saved recipes** extend the existing `recipes` table and `POST /recipes` (component portions, quick-add ingredients,
  edit and delete). Recipes already create a member food (`category: 'recipe'`, `external_id: 'recipe:<id>'`), so they
  are searchable and offline; the catalogue row gains `recipeId` so picking one opens the Dish view prefilled. Tweaks
  change only that meal unless the member taps "Update my recipe too".

### 5.6 Create or edit a food

A full-screen `CreateFoodPage` (an overlay in the meal flow, also reachable from My foods), replacing `CreateFoodSheet`
in `ui/organisms/log/FoodSheets.tsx`:

- **Basis**: "Nutrition is for [amount] [unit] ([weight] g, or not sure)", then calories (required), protein, carbs,
  fat and fibre.
- **Portions**: unit, amount, grams (or ml), estimated flag and default — up to 12, matching the admin drawer.
- **Unknown weight** (count-like units only): stored with a nominal weight flagged `estimated`, so per-unit nutrition
  stays exact; g / ml portions aren't offered for that food, and its other portions are multiples of the basis unit.
- **Edit** your own foods while they're unverified (`PUT /foods/:id`); past logs keep their snapshot nutrition.
- AI on: "Save as a food" from snap results prefills the form; "Scan the label" is a later, optional phase (§6.6).

## 6. Backend

### 6.1 Data model and migrations

Each migration has to reach production through `migrate.yml` on `main` **before** the code that reads it deploys (the
2026-10-02 `habit_prefs` outage).

**Migration A — leaderboard**

- `day_facts` gains `meals_on_time smallint`, `snap_only smallint`, `kcal_band text`, `protein_band text`,
  `workouts smallint`, `weighed_in boolean`, `points smallint`, `points_parts jsonb`, `solid boolean`,
  `settled boolean` (defaults 0 / false / null).
- `board_weeks` (`team_id`, `week_start`, `user_id`, `points`, `parts jsonb`, `days jsonb` (7 × state and points),
  `workouts`, `full_days`, `vacation_days`, `away`, `rank_at_dawn`, `final_rank`, `final`, `awards text[]`,
  `rules_version`, `updated_at`); primary key (`team_id`, `week_start`, `user_id`). It holds the live week and the
  closed ones, so a board read is one query.
- `team_board_state` (`team_id` pk, `crown_user_id`, `crown_since`, `last_closed_week`).
- Team settings JSON: `featureFlags.leaderboard` (on; see open question 1) and `board: { workoutMinMinutes: 20,
  workoutCap: 4, noPlanTarget: 3, postResults: true }`, backfilled into existing teams.
- `profiles.privacy.showOnBoard = true`, backfilled.
- Notification type `board_results` with preferences and schedules backfilled (the pattern `0004_habits` used for
  `habit_reminder`).

**Migration B — meal logging**

- `food_logs.pending_details boolean not null default false`.
- `recipes.image_id uuid` (optional).
- No column changes for portions or dish components: `food_items.serving_options`, `recipes.items` and
  `food_logs.items` are jsonb and gain optional fields.

**Backfill**: `pnpm board:backfill` (`packages/server/scripts`) recomputes `day_facts` for the last 35 days for active
members, then the current and previous `board_weeks`. Safe to re-run; added to the README seeds table and DEPLOY.md.
`seed:demo` learns to produce a varied board, a dish and a multi-portion food.

### 6.2 Contracts (`packages/contracts`)

- New `api/board.ts`: `BoardView`, `BoardRow`, `SolidDaysRow`, `BoardResponse`, `MemberCardResponse`, `AwardKey`.
- `api/logs.ts`: `LogSideEffects.points`; `FoodLogComponentInput`; `FoodLogItemInput.components` (1–30) and
  `batchServings`; `FoodLogUpsert.pendingDetails`, refined so empty `items` are allowed only with an image and
  `pendingDetails`; matching DTO fields.
- `api/common.ts`: `PortionUnit` enum; `ServingOptionSchema` gains optional `unit`, `amount`, `ml`, `estimated`.
- `api/foods.ts`: `CreateFoodRequest` v2 (basis, nutrients, portions, default portion) — the server also accepts the v1
  shape for one release, for PWAs still running the old bundle; `UpdateFoodRequest`; `CreateRecipeRequest` and
  `RecipeDto` v2; `CatalogFood.recipeId`; `FOOD_CATALOG_FORMAT = 2` (each browser re-downloads the catalogue once).
- `api/ai.ts`: `RecognisedItemDto.alternatives` and `suggestedFood`; optional `dishHint`.
- `settings.ts`: `featureFlags.leaderboard`, `board` settings. `enums.ts`: `board_results` notification type,
  `weekly_results` trigger event. `triggers.ts`: `board_rank` and `crown_won` conditions (celebrate or neutral).
- `api/profile.ts`: `PrivacyPrefs.showOnBoard`; `Me.team.featureFlags.leaderboard`.

### 6.3 Domain (`packages/domain`, pure and unit-tested)

- `board.ts`: `BOARD_RULES_V1`, `dayPoints(fact)`, `isSolidDay(fact)`, `weekStanding(input)` (vacation credit, workout
  cap, plan bonus, weigh-in, full week), `rankRows`, `movement`, `solidDayRate`, `crownHolder`, `weeklyAwards`,
  `nextActions`.
- `portions.ts`: unit metadata (singular, plural, kind, typical g or ml), `formatPortion(qty, option)` ("½ katori",
  "2 scoops"), `gramsFor`, `nominalWeight`.
- `nutrition.ts`: `dishNutrition(components, batch, eaten)`.
- Tests — `board.test.ts`: an honest over-target day beats no log; the caps; vacation credit and away; a mid-week
  joiner; plan above the cap; the no-plan target; late logs; snap-only meals; ties; fewer than 3 members; rule
  versions. `portions.test.ts`; dish nutrition.

### 6.4 API (Hono routes + `packages/client`)

- `GET /team/board?view=week|solid&week=YYYY-MM-DD` → `BoardResponse` (hidden members filtered; past weeks from closed
  rows). `GET /team/members/:id/points?week=` → the member card, next to the existing `/team/members/:id/day`.
  `GET /team/summary` (Crew today) and `GET /chat/unread` stay as they are.
- Foods: `POST /foods` v2, `PUT /foods/:id`; recipes: `POST /recipes` v2, `GET`, `PUT` and `DELETE /recipes/:id`.
- `PUT /logs/food/:id` and the `food_log` sync op accept components and `pendingDetails`; `resolveItems`
  (`application/logs.ts`) resolves components like items, computes the dish nutrition and unions the tags.
- `POST /ai/food-photo` returns the new fields.
- Admin: the settings update accepts the new flag and board settings; `GET /admin/board` for the optional dashboard
  card.

### 6.5 Jobs, notifications, chat, triggers, realtime

- `computeDayFacts` (`application/momentum.ts`) fills the new fact columns, day points, `solid` and `settled`.
- `afterLogSaved` (`application/effects.ts`) refreshes the member's `board_weeks` row for the log's week (and the old
  date's week when a log moved), returns `effects.points`, and signals the team so open boards refetch.
- `rolloverMembers` refreshes the weeks it settled days in; vacation changes, the privacy toggle and admin rule changes
  refresh the current week.
- `rolloverTeams`, once every member has settled yesterday: writes `rank_at_dawn`; when yesterday was Sunday, closes the
  week — final ranks, awards and crown, a system message ("🏆 Week 41: Priya 612 · Arjun 588 · Sneha 540", plus the
  awards), a `board_results` push per member (deduped per user and week), and the `weekly_results` trigger event.
  Idempotent through `final` and the dedupe keys.

### 6.6 AI gateway

- `food.photo`: an optional `dishHint` in the output (schema, sanitiser, mock and guard tests). The server adds
  `alternatives` (the top three `matchFood` candidates instead of only the best) and `suggestedFood` (from
  `estimatePer100g`, `householdMeasure`, `portionGrams` and the tags) for unmatched items.
- Later, optional: a `food.label` feature that reads a nutrition-label photo into per-serving values — registry entry,
  pricing, budgets, mock, and a row in the admin AI registry.

## 7. Member app code map

| Area | Files |
|---|---|
| Shell and navigation | `app/{uiStore,routes,AppShell,TabBar}.tsx`, new `ChatLayer` |
| Team tab | new `pages/team/TeamPage.tsx`; new `ui/organisms/team/{YourWeekCard,Leaderboard,Podium,RaceRow,SolidDaysView,AwardsStrip,TeamStreakCard,ChatFab,PointsSheet,MemberCardSheet}.tsx`; `TeamSection.tsx` moved in; `features/board.ts`; `features/keys.ts` |
| Chat | `pages/chat/ChatPage.tsx`, `ui/organisms/chat/{ChatHeader,Composer}.tsx` |
| Progress and Momentum | `pages/progress/ProgressPage.tsx`, `ui/organisms/progress/MomentumCard.tsx`, `ui/organisms/momentum/MomentumPieces.tsx` |
| Settings | `ui/organisms/settings/SmallSections.tsx` (privacy toggle), `NotificationsSection.tsx` (weekly results) |
| Meal and snap | `pages/log/{LogFoodPage,LogSheet}.tsx`; new `features/mealDraft.ts`; `features/food.ts`; `ui/organisms/log/{PlateReview,CameraCapture,SearchPanel,AttachedPhoto}.tsx`; new `SnapPill`, `SnapCamera`, `FoodDetail`, `DishView`, `CreateFoodPage` |
| Today | `ui/organisms/today/{LoggedList,LogRow,LogActionsSheet}.tsx` (dish and photo-only rows) |
| Offline | `infrastructure/outbox.ts` (`image_upload` op), `infrastructure/cache/foodCatalog.ts` (format 2) |

## 8. Admin panel

- **Team settings › Leaderboard** card (`pages/settings/TeamSettingsPage.tsx`, `settingsForm.ts`): on/off, post weekly
  results to chat, minimum workout minutes, weekly workout cap, no-plan target, and a read-only points table.
- **Foods** (`pages/foods/FoodDrawer.tsx`): the serving editor becomes Portions — unit, amount, grams or ml, estimated,
  default — on the same `ServingOptionSchema`. Member foods show their portions; recipe foods show their ingredients
  read-only.
- Optional: a dashboard "This week's leaderboard" card; a Points history on member detail.
- Settings changes are already audited.

## 9. Delivery phases

1. **Navigation** — the Team tab shell (Crew today, team streak, chat pill), the chat layer, the unread behaviour,
   Progress and Momentum cleanup. No migration. Tests: e2e opens chat from the Team tab with unread and from the pill,
   back returns to Team; `member.chat.spec.ts` updated; the a11y spec covers the Team tab.
2. **Leaderboard engine** — domain `board.ts` and tests, migration A, `computeDayFacts` and `board_weeks` refresh, the
   backfill script, board endpoints, the dawn and weekly-close steps with awards, chat post and push. Integration tests:
   board payload, hidden members, no private fields, close idempotency, members in two timezones.
3. **Leaderboard UI** — Your week, the board (the picked direction) and Solid days, awards, sheets, point toasts, the
   privacy and notification settings, and the admin settings card. E2E: log a meal → the points and rank move.
4. **Portions and foods** — `PortionUnit` and domain `portions.ts`; `createFood` v2 and food edit; catalogue format 2;
   Food detail (replacing `PortionSheet`); the Create food screen; the admin portions editor. `member.logging.spec.ts`
   and `member.photo.spec.ts` follow the new screens here and in phases 5–6.
5. **Meal screen and dishes** — `mealDraft`; the Meal screen; the Dish view; components in contracts, `resolveItems`
   and trigger tags; recipes v2; dish rows on Today (edit and duplicate in `LogActionsSheet`). Integration: component
   nutrition is recomputed on the server. E2E: log a fruit salad with five fruits.
6. **Snap** — the Snap pill and camera; AI-on results (alternatives, save as a food, group into a dish); the AI-off
   flow; the + sheet; migration B and Finish later with the Today row. **6b**: offline photo queue. E2E: with AI off,
   snap → Finish later → finish it from Today.
7. **Polish** — label scan (optional), board meme conditions, a rank line in the weekly recap, a performance pass, docs
   (README, DEPLOY seeds and backfill), memory notes.

Phases 1, 2–3 and 4–6 are independent tracks; 5 depends on 4 (Food detail and portions), and 6 depends on 5 (group
into a dish).

## 10. Rollout, testing and risks

- **Migrations first**: confirm the `migrate.yml` run on `main` before the code that uses the new columns deploys.
- **Version skew**: the server accepts the v1 create-food shape and the old log payloads for one release; the catalogue
  format bump re-downloads about 2,100 foods per browser once.
- **Unread auto-open** could hide the board from members of a busy chat — it only triggers when switching tabs, and
  reading the chat clears it. Watch whether it annoys people.
- **Cost**: a board read is one query on `board_weeks`; each log save adds one row refresh over at most 7 day facts.
- **Timezones**: the weekly close waits for the last member to settle.
- **Fairness complaints**: rules are versioned, explained in the sheet, and the main knobs are team settings.
- **Copy lint** (`BANNED_COPY_WORDS`) covers the new strings; "last place" never appears in the UI.
- **Privacy regression**: a contract test fails if a board payload ever carries kcal, grams, foods or weight.

## 11. Open questions (answer during design)

1. Participation: everyone on the board with an opt-out (recommended), or opt-in like team pulse?
2. Retire team pulse while the board is on (recommended), or keep its opt-in comparison inside Crew today?
3. Should habits earn points (say +5 for all required habits done), or stay separate (recommended)?
4. Do unplanned workouts count when they're 20+ minutes (recommended, within the cap of 4)?
5. Should the Snap pill also sit on Today, bottom-left above the tab bar? Decide from the design trial.
6. Photo-only meals: count for the logging streak and +5 (recommended)? Remind with a push, or only the Today row?
7. Week close: Monday 03:00 for quick results (recommended), or Tuesday 03:00 once Sunday's 48-hour late window ends?
8. Post weekly results to chat automatically — top three and awards only (recommended)?
9. Offline snaps in the first release, or as 6b (recommended)?
10. Should admins see the board on the dashboard?
11. Later: should AI propose ingredients for mixed dishes (biryani, salads)?

## Before building

1. **Design**: run the design prompt in Claude Design (member project `91cad80f-…`; the admin prompt in `f6099bb7-…`),
   pick 5a or 5b, and save copies to `design/` with DesignSync.
2. **Decide**: answer §11 and update the SRS — Member web app (navigation APP-NAV, Progress and Team APP-PROG-07/08,
   chat §8.12, food logging APP-HOME-20…27), Shared subsystems (Crew points and solid days next to SYS-CALC-33, streak
   rules), Admin panel (team settings, foods).
3. **Build** phases 1–7.
