# Daily Habits — feature plan

Status: **planned, not designed, not built.** Next step is design (see "Before building" at the end).

## 1. What it is

A daily checklist of non-health habits — skin care, laundry, reading, water plants, journaling — that admins define in
the admin panel and members tick off every day in the member app. It sits next to food and activity logging but is
deliberately lighter: one tap to complete, no numbers to type for most habits.

Goals:

- Admins create and maintain the habit catalogue and decide who gets which habit.
- Members see today's habits in one place, complete them in a tap (offline too), and see a simple history.
- Habits reuse what Clubhouse already has: streaks that pause instead of breaking, reminders, the team chat and meme
  triggers, the admin audit log.

Non-goals for v1: members creating their own private habits, habit photos, habit-specific AI.

## 2. Concepts

| Concept | Meaning |
|---|---|
| **Habit** | Admin-defined item, e.g. "Night skin care". Name, emoji/icon, colour, kind, schedule, target, optional reminder time, optional note/how-to. |
| **Kind** | `check` (done / not done), `count` (e.g. 8 glasses, 3 loads), `duration` (minutes, e.g. 20 min reading), `scale` (1–5 rating, e.g. "how did skin feel"). |
| **Schedule** | Every day; specific weekdays (laundry on Sat + Wed); or *N times a week*, any day (e.g. laundry 2×/week). |
| **Assignment** | Everyone, or selected members. Members can hide an assigned habit only if the admin marks it optional. |
| **Check-in** | One row per member, habit, local date: value (true / number), note, timestamps. Client UUID + last-write-wins like other logs. |
| **Group** (optional) | Admin-defined section to order the list: Morning, Evening, Home, Self-care. |

## 3. Member app

- **Entry point (decide in design):**
  - (a) a "Habits" card on Today showing "3 of 5 done" with a progress ring, tapping into a full Habits screen; or
  - (b) a segmented switch on Today ("Fuel · Habits"); or
  - (c) a sixth surface in the log sheet ("Tick habits").
  The tab bar is already full (Today · Diet · + · Progress · Chat), so (a) is the default recommendation.
- **Habits screen:** today's habits grouped (Morning / Evening / …), each row with icon, name, schedule hint ("2 of 2
  this week"), and a control that matches its kind: tap-to-check, ± stepper, minutes chip, 1–5 dots. Completed rows
  animate (check bounce, bar fill) and move to a "Done" section. Day switcher to fix yesterday (48 h "added later" rule
  as for logs).
- **History:** per-habit 5-week dot grid and current/best streak; weekly "N of M habits kept" on Progress.
- **Momentum:** a new streak kind `habits` (days where all *required* habits scheduled that day were completed; weekly
  habits judged at the end of the week). Reuses the existing streak engine with grace days and pauses.
- **Notifications:** optional per-habit reminder time from the admin, member can change time or turn off in
  Settings › Notifications; suppressed when already done; "Done" action on the push ticks it.
- **Offline:** check-ins go through the existing outbox (new op kind `habit_checkin`).
- **Privacy:** teammates see only the daily "habits kept" count in Team, never individual habits unless the member
  opts into full sharing.

## 4. Admin panel

New sidebar item **Habits** (under Team):

- Catalogue table: name, kind, schedule, assigned to, adherence last 14 days, on/off.
- Habit editor drawer: name, emoji/icon picker, colour, group, kind + target/unit, schedule, assignment (everyone /
  members multi-select), required vs optional, default reminder time, short how-to note, start/end date.
- Templates: starter set (Skin care AM/PM, Laundry 2×/week, Water plants, Read 20 min, Journal, Drink water 8 glasses)
  that admins can add with one click.
- Adherence view: member × habit heatmap for the last 4 weeks; member detail page gets a Habits tab.
- Every create/edit/archive is audited. Archiving keeps history; deleting is not offered once check-ins exist.

## 5. Backend

- **Tables:** `habits` (team_id, name, icon, colour, group, kind, target, unit, schedule jsonb, required, reminder_time,
  note, starts_on, ends_on, archived_at, sort_order, created_by), `habit_assignments` (habit_id, user_id | all),
  `habit_member_prefs` (user_id, habit_id, hidden, reminder_time override), `habit_checkins` (id client UUID, user_id,
  habit_id, date, value numeric, done bool, note, added_late, client_updated_at, server_updated_at, deleted_at; unique
  live row per user+habit+date). Habit definitions are versioned by `updated_at`; check-ins snapshot target at write time.
- **Contracts:** `HabitDto`, `HabitTodayResponse`, `HabitCheckinUpsert`, admin `HabitDefinition` (zod), history DTOs.
- **Domain (pure, unit-tested):** `habitsDueOn(date, habits)`, `isHabitComplete(kind, value, target)`,
  `weeklyHabitProgress`, `habitsDayQualifies` for the streak, adherence %.
- **API:** member `GET /habits/today?date=`, `PUT /habits/checkins/:id`, `GET /habits/:id/history`; sync op
  `habit_checkin` in `POST /sync`; admin `/admin/habits` CRUD, `/admin/habits/templates`, `/admin/habits/adherence`.
- **Jobs:** new scheduled notification type `habit_reminder` (one schedule row per member+habit, or one per time slot
  bundling habits due at the same time to avoid push spam); nightly rollover adds the `habits` streak.
- **Meme triggers:** new events `habit_checked` and condition `habit_completed` / `all_habits_done` so admins can
  celebrate "laundry hero" moments; roast guardrails unchanged.
- **Today payload:** add `habits: { done, total, nextDue }` so the card needs no extra request.

## 6. Delivery phases

1. Contracts + domain + migration + seed templates (with unit tests).
2. Member API + sync op + integration tests.
3. Admin API + Habits admin page + member detail tab.
4. Member Habits screen + Today card + offline outbox + animations.
5. Streak kind, Progress/Team summaries, reminders, meme trigger events.
6. E2E: admin creates habit → member sees it → ticks offline → reconnects → streak and admin adherence update.

Estimated size: roughly a third of the original diet feature.

## 7. Open questions (answer during design)

1. Where does it live in the member app: Today card + screen (recommended), Today switch, or log sheet?
2. Does the `habits` streak count toward "logged today" for the logging streak and team streak, or stay separate?
   (Recommended: separate, so health momentum is unaffected.)
3. Can members add their own private habits later? (Out of v1; the schema allows `created_by` = member later.)
4. Reminder bundling: one push per habit, or one "3 habits due this evening" push? (Recommended: bundled.)
5. Should admins see individual members' habit check-ins, or only adherence percentages?

## Before building

1. **Design:** add a "Habits" screen, the Today card, and the admin Habits page + editor drawer to the Claude Design
   projects (member `91cad80f-…`, admin `f6099bb7-…`), using the Organic palette and existing components.
2. Answer the open questions above.
3. Then implement phases 1–6.
