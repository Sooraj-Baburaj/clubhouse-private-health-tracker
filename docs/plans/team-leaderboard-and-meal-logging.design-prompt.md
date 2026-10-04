# Design prompt — Team tab, Leaderboard, Snap and Meal logging

How to use: open the member design project in Claude Design (`91cad80f-ab18-484f-acc2-1b92c0755cb6`, file
`Clubhouse Member App.dc.html`) and paste everything under **Member app prompt**. The shorter **Admin prompt** at the end
goes into the admin project (`f6099bb7-14f8-4345-92f0-ba4e679b695f`, `Clubhouse Admin.dc.html`). Build follows
[team-leaderboard-and-meal-logging.md](team-leaderboard-and-meal-logging.md) once the screens are picked.

---

## Member app prompt

Update **Clubhouse Member App** with four changes:

1. The **Chat tab becomes a Team tab** with a crew **Leaderboard**, crew streaks and today's crew status. Chat moves
   behind a floating button on the bottom-left of the Team tab.
2. **Progress becomes personal-only.** Nothing about teammates stays there.
3. **Food logging gets a Snap pill** (bottom-left, camera icon) that works with Team AI mode on or off, a cleaner
   **Meal** screen, a **Food detail** screen, and **Dishes** made of ingredients (a fruit salad and the fruits in it).
4. **Create a food** supports several portion units (scoop, piece, cup, katori…) instead of grams only.

### Work inside the existing file and system

- Keep the 390×844 phone frame, the screen switcher (`SCREENS`) and the side panel (palette picker, Team AI mode). Add
  switcher entries for every new screen and variant, numbered after the existing ones: Today 1x, Log food 2x,
  Progress 3x, Habits 4x, then **Team 5x, Snap 6x, Food 7x, Create food 8**.
- Use the Organic tokens only: `var(--color-*)`, the 100–900 ramps, `--on-accent`, `--on-accent-fill`,
  `--on-accent-sub`, `--shadow-*`. No new hex values. Every frame must read well in the default **day** palette and in
  **night**, and survive the other palettes in the picker.
- Reuse what the file already does: Caprasimo for headings and hero numbers, Figtree for body text; 12 px uppercase
  eyebrow labels (letter-spacing 0.1em, accent-700); surface cards with 24–36 px radii; pill buttons and chips 40–52 px
  tall; 44 px circular icon buttons on a surface fill; the small **AI** pill (accent-2-200 / accent-2-800), shown only
  when Team AI mode is on; the dark card (`--color-text` fill) for team and narrative moments; the tab bar with the
  centre + button; bottom sheets with a grab handle and a 36 px top radius; the stripe placeholder for photos.
- Lucide icons at stroke 2.75. Touch targets of at least 44 px. Every animation has a reduced-motion fallback (fade or
  none).
- Copy is warm, short and never shaming. Never use "cheat", "guilty", "bad", "fail", "lazy" or "should have". Streaks
  pause, they don't break. Nobody is ever singled out for being last.
- Sample data: the crew already in the file — **You (Arjun)**, Priya, Rohan, Sneha, Meera, Kabir. Team name "The
  Clubhouse", team streak 9, current week "Week 41 · 29 Sep – 5 Oct".

### 1. Navigation

- The tab bar becomes **Today · Diet · (+) · Progress · Team**. Team carries the unread-chat count badge the Chat tab
  had (accent-2).
- Switching to **Team** from another tab: if there are unread messages, the **Chat** screen opens straight away on top
  of the Team tab, and closing chat lands on the Team view. With nothing unread, the Team view shows. Tapping Team
  while already on it scrolls to the top.
- Add two side-panel toggles: **Unread chat** (on/off) to demo both paths, and **Leaderboard** (on/off — the admin's
  switch) to show the Team tab without the board.

### 2. Team tab — two directions

Design the same content in two directions so we can pick one: **Team 5a — Podium** (celebratory) and **Team 5b — Race**
(shows the gaps between people). Top to bottom:

1. **Header** — "The Clubhouse" (Caprasimo 24), sub-line "6 members · team streak 9".
2. **Your week** — an accent hero card: rank "#3" and "412 pts" in Caprasimo, a gap line "38 behind Priya", a pending
   line "+40 more tonight if you stay on track" (calorie and protein points settle overnight), and two or three
   **next-move chips** with their points: "Log dinner +10", "20-min walk +40", "Weigh in +10". A chip starts that log.
3. **Leaderboard** card — a segmented control **This week | Solid days**, the week label, and a "Last week's results"
   link.
   - **5a Podium**: the top three on rounded pedestals of three heights (1st in the centre), avatar, first name and
     points on each; then rows from #4: rank, avatar (accent ring when they've logged today), name, seven day-dots
     Mon–Sun (full · partial · nothing · vacation 🏖 · today, pending · future), points, movement (▲2 · ▼1 · —).
   - **5b Race**: one list; each row has a rounded horizontal bar for points relative to the leader (leader = full
     width), rank in Caprasimo, avatar, name, points at the bar's end, movement arrow. Your row is highlighted and
     sticks to the bottom of the card when it scrolls out of view.
   - **Solid days** view (show it in your preferred direction): ranks the last 28 days by solid days — a percentage
     plus a 28-dot strip (4 rows of 7) per person. The leader wears the 👑 **Most consistent** crown, which also shows
     next to their name on This week. Members with fewer than 7 days show "Warming up".
   - A "How points work" link under the board opens the sheet in §4.
4. **Last week's awards** — horizontally scrolling tiles: 🏆 Week winner · 👑 Most consistent · 🔥 Iron streak ·
   💪 Plan keeper · 🥚 Protein pro · 📈 Comeback. Each tile: emoji, award name, avatar and first name, one reason line
   ("27 of 28 solid days").
5. **Crew today** — what used to sit at the bottom of Progress: "4 of 6 logged", then per member an avatar (ring when
   logged), name, flame streak, "2 meals logged", a band pill ("on track", "a bit over"), and a chevron to their day. It
   may start as a compact avatar row that expands to the list — your call.
6. **Team streak** — the dark card that used to be on Momentum: "9 days together", "Best together: 14", crew avatars
   (ring = logged today), and a neutral line like "Rohan and Kabir haven't logged yet today".
7. **Chat pill** — floating bottom-left above the tab bar with a 16 px gutter: message-circle icon and "Chat", dark fill
   (`--color-text`) so it doesn't compete with the accent + button, unread count badge. When a message arrives while
   you're on Team, a small preview bubble ("Rohan: Sunday 6 am run?") slides out of the pill for about four seconds.

Keep enough bottom padding in the scroll content to clear the pill and the tab bar.

### 3. Chat (opened from the pill)

A full-screen layer above the tabs (tab bar hidden) that grows out of the pill at the bottom-left (reduced motion:
fade). Header: back chevron (back to Team), "The Clubhouse", "6 members · team streak 9". Everything else follows the
current Team chat frame: pinned banner, grouped bubbles, meme cards, reactions, tag-a-log, the unread divider and the
"↓ 3 new" pill. The composer now docks to the bottom safe area because there's no tab bar under it. Also show the chat
opened automatically from the Team tab, with the unread divider in view.

### 4. Sheets

- **How points work** (tall sheet). Lead with the promise: "Points come from your own targets and plan, so it's effort,
  not size. Your weight and calories are never shown to the crew." Then the rules:

  | Every day | Points |
  |---|---|
  | Each meal logged (up to 3 a day) | +10 |
  | A snapped meal still waiting for its foods | +5 until you finish it |
  | Calories on track (a bit over or a bit low: +10) — counted overnight | +25 |
  | Protein on track (a bit low: +5) — counted overnight | +15 |

  | Every week (Mon–Sun) | Points |
  |---|---|
  | Each workout — planned, or any 20+ minutes (up to 4 a week) | +40 |
  | Your weekly activity plan done (no plan: 3 workouts) | +40 |
  | A weigh-in (the number is never used) | +10 |
  | Two or more meals logged every day of the week | +50 |

  Then short notes: log everything you eat — days far under your target don't earn calorie points; logs added more
  than two days late don't earn points; vacation days are filled with your average day; the week closes Monday at
  3 am; a **solid day** is two or more meals logged plus one good call (calories on track or close, protein on track,
  or a 20-minute workout); ties share a rank. End with "Hide me from the leaderboard →" (Settings › Privacy).
- **Member card** (sheet from a board row — e.g. Priya, #2, 450 pts): avatar, name, rank and points this week, their
  day-dots with points per day, category chips (Meals 140 · Calories 145 · Protein 45 · Workouts 80 · Bonus 40),
  logging streak, badge count, and "See their day" (the existing member-day screen). On your own card, add "How you
  earned it", day by day.

### 5. Week results (Monday)

The first open of Team after the week closes shows a celebration card at the top: "Week 41 results", the final podium
(Priya 612 · You 588 · Sneha 540), your finish ("You finished #2 — 588 pts, your best week yet"), the awards, and "New
week — everyone's back to 0." Also show **This week on Monday morning**: everyone at 0, a friendly empty state with
last week's top three and the next-move chips.

### 6. Progress, Momentum, Settings

- **Progress 3a / 3b**: personal only — no crew rows, team pulse or crew avatars anywhere. Weight, calories, nutrients,
  activity, habits, consistency, momentum, recaps and export stay as they are.
- **Momentum**: replace the dark Team streak tile with a personal tile (in-range streak or best ever) and add a small
  link "Team streak is on the Team tab →".
- **Settings**: Privacy gains "Show me on the leaderboard" (on by default); Notifications gains "Weekly results".

### 7. Food logging

Words used on screen: a **meal** is one log in a slot (Lunch); a **food** is one item; a **dish** is an item made of
ingredients (fruit salad); a **recipe** is a saved dish; a **portion** is an amount and a unit (2 scoops, ½ katori,
150 g).

#### 7.1 Log food 2c — Meal

One cleaner screen replaces the camera-first and search-first directions (keep 2a / 2b in the switcher for reference):

- Header: back, "Lunch" (Caprasimo) with a date-time pill "Today · 1:20 pm" (tap to change), and the existing slot
  chips under it. Editing a saved meal adds a delete icon.
- **Meal photo**, when there is one: a rounded, washed photo card about 140 px tall with a status chip — "AI read 3
  things" (with the AI pill), "Photo added", or "Uploading…". Tap to view, retake or remove.
- **On your plate**: rows on surface cards — name, portion ("2 scoops · 64 g"), kcal. A dish row reads "Fruit salad ·
  5 ingredients" with tiny ingredient chips and a chevron. Tap a row for Food detail or Dish. Removing shows an undo
  toast.
- **Totals**: "540 kcal" large, then P · C · F · Fibre.
- **Add more**: the search pill ("Roti, dosa, dal…"), "Your usuals" chips, then rows for **Make a dish**, **Create a
  food**, **Quick add** and **My foods & recipes**.
- **Snap pill**, floating bottom-left: camera icon and "Snap", 52 px tall, always there — AI on or off. Give it the
  same dark fill as the Team tab's chat pill, so the bottom-left pill reads as the app's quick-capture spot everywhere.
  When the plate has items, the accent **Add to lunch · 540 kcal** pill floats bottom-right on the same row and the
  snap pill shrinks to a 52 px camera circle to make room. Show both the empty and the filled state.
- Also try one frame of **Today 1b with the Snap pill** bottom-left above the tab bar (one-tap meal capture) so we can
  decide whether it belongs on Today too.

#### 7.2 Snap 6a — Camera

Full-screen dark viewfinder (stripe placeholder), ✕ top-left, a status chip at the top: AI on → "AI on · we'll read
the plate" with the AI pill; AI off → "The photo goes on your meal — you add the foods". A rounded plate guide, the
78 px shutter, a gallery button bottom-left, and "Search instead". Show the fallback when the camera is blocked
("Camera unavailable — choose a photo").

#### 7.3 Snap 6b — AI read (AI on)

"Reading your plate… up to 20 s" (the existing analysing card), then the results:

- Photo header, "Found 4 things", and "Check portions — numbers come from our food database."
- Each row says where its numbers come from: **In our foods ✓** (verified or team food) or **New to Clubhouse · AI
  estimate** with a "Save as a food" link that opens Create food prefilled with the AI's name, portion and estimate.
- Each row has a portion chip ("1 katori ▾" opens the unit picker), a stepper and kcal. "Not right?" opens search with
  near matches ("Did you mean: Dal fry · Dal makhani · Moong dal").
- A select mode → **Group into a dish** → name it → one dish row with its ingredients. When the AI thinks the items are
  one dish, offer a suggestion chip: "These look like a fruit salad — group them?"
- Low confidence: "Couldn't quite tell — is it one of these?" with guess chips and search; the photo stays on the meal.
  Not food: "That doesn't look like food" with retake and search.
- Footer: Retake · Add to lunch.

#### 7.4 Snap 6c — AI off, finish later

After the shutter with AI off: back on the Meal screen with the photo card ("Photo added · AI is off") and the search
focused under "What's on the plate?", with recents and usuals. A secondary **Finish later** button saves the photo as a
lunch that still needs its foods. Also show:

- **Today 1b** with that meal in the logged list: thumbnail, "Lunch · photo only", and an "Add what's in it" pill. It
  counts for the logging streak; its calories show "—" until it's finished.
- The **+ sheet**: "Snap a meal" is always first now. AI on keeps the AI pill and "One photo, we read the plate"; AI
  off says "Photo first, add the foods after".
- Offline: a chip on the photo — "Waiting for a connection — it uploads by itself".

#### 7.5 Food 7a — Food detail

A full-screen detail (back chevron, favourite heart): name in Caprasimo 28, brand, source badges (Verified · Team ·
Mine · AI estimate). Portion picker: unit chips from the food's portions ("scoop", "piece", "100 g", "g"), a stepper
with quick fractions (¼ · ½ · ¾ · 1 · 1½ · 2), or a typed amount for g / ml. A large kcal number that rolls as the
portion changes, and macro tiles. When a food's weight is only estimated, show "≈" and "weight is approximate". A hint
"Your usual: 2 scoops", "Edit food" on foods you created, and the CTA "Add to lunch" (or "Update" when editing).

#### 7.6 Food 7b — Dish with ingredients

The same shell for a dish: an editable name ("Fruit salad"), an optional photo, and an **Ingredients** list — Apple ·
1 medium · 150 g · 78 kcal; Banana · 1 · 118 g · 105; Grapes · 1 cup · 92 g · 64; Pomegranate · ½ cup · 87 g · 72;
Honey · 1 tsp · 7 g · 21. Tap an ingredient to change its portion, remove it, or **+ Add ingredient** (search sheet).
**Makes 2 servings · You had 1** steppers with "Your share: 170 kcal of 340". A **Save to My recipes** toggle ("next
time it's one tap"). CTA "Add to lunch". Empty state: "Name it, then add what went in." Also show a saved recipe
opened from search: ingredients prefilled, portion tweaks allowed for this meal, and "Update my recipe too".

#### 7.7 Create food 8

A full-screen form replacing today's sheet:

- Name, brand (optional), and Veg / Egg / Non-veg / Not sure chips.
- **Nutrition is for**: amount and unit chip ("1 scoop") plus its weight ("32 g"), or "Not sure of the weight" for
  count-like units — then the food is logged by that unit only.
- Calories (required), protein, carbs, fat, fibre.
- **Portions**: the ways you measure it — "1 scoop · 32 g ★ default", "1 tbsp · 8 g", "100 g". **+ Add a portion**
  opens a unit picker grid (g, ml, piece, scoop, cup, glass, katori, bowl, plate, tbsp, tsp, slice, packet, serving,
  custom) → amount and weight, with a typical weight suggested (cup ≈ 240 ml) → done.
- A live preview line: "2 scoops = 240 kcal · 48 g protein".
- AI on: a "Scan the label" button (camera) that fills the numbers from a nutrition label — show it as an optional
  variant.
- Footer "Save and add to lunch"; validation states such as "Add the calories for 1 scoop".

### 8. States to show

Loading skeletons (Team, board, meal); offline (board "Updated 10 min ago"); leaderboard switched off; fewer than three
members (no podium, no awards); hidden from the board ("You're hidden — only you see this row"); away ("Away this
week 🏖" — vacation days are filled with your average); warming up (a new member); the Monday reset; an error with
retry.

### 9. Accessibility

Each board row reads as one sentence ("Rank 3 of 6, you, 412 points, up 2"); day-dots have text alternatives; point
changes are announced politely; chat pill label "Open team chat, 3 unread"; snap pill label "Snap a photo of your
meal"; small text on accent fills uses deep ramp steps for AA contrast.

### 10. Deliverables (switcher entries)

- Team: 5a Podium, 5b Race, Solid days view, Week results, Monday at 0
- Team chat: opened from the pill, and opened automatically with unread messages
- Sheets: How points work, Member card
- Progress 3a / 3b (personal only), Momentum (no team tile), Settings rows (privacy, weekly results)
- Log food 2c Meal (empty and filled)
- Snap: 6a Camera, 6b AI read, 6c AI off and finish later
- Food: 7a Food detail, 7b Dish
- Create food 8, with the add-portion picker and the label-scan variant
- Today 1b: the photo-only meal row, the Snap pill trial, the updated + sheet

The side-panel toggles (Team AI mode, Unread chat, Leaderboard) must drive every frame they affect.

---

## Admin prompt

Update **Clubhouse Admin** with three small additions, in the existing style:

1. **Team settings › Leaderboard** card: on/off; "Post weekly results to chat"; "A workout counts from [20] minutes";
   "Workouts that earn points each week [4]"; "Weekly target for members without a plan [3] workouts"; and a read-only
   preview of the points table members see.
2. **Foods › food drawer**: "Serving options" becomes **Portions** — each row has a unit picker (g, ml, piece, scoop,
   cup, glass, katori, bowl, plate, tbsp, tsp, slice, packet, serving, custom), an amount, a weight in g (or ml for
   volume units), an "estimated weight" flag and a default star (12 at most). Member-created foods show the portions
   the member entered; a recipe food shows its ingredients read-only.
3. **Dashboard**: an optional "This week's leaderboard" card (top five, points, solid-day %), linking to member detail.
