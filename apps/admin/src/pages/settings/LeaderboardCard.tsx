import { Minus, Plus } from 'lucide-react';
import { DEFAULT_BOARD_SETTINGS } from '@clubhouse/contracts';
import { BOARD_RULES } from '@clubhouse/domain';
import { cn } from '@/lib/cn';
import { Toggle, ToggleRow } from '@/ui';
import { SettingsCard } from './SettingsParts';
import type { SettingsForm } from './settingsForm';

type BoardNumKey = 'workoutMinMinutes' | 'workoutCap' | 'noPlanTarget';
const NUMS: { k: BoardNumKey; pre: string; post: string; min: number; max: number; step: number }[] = [
  { k: 'workoutMinMinutes', pre: 'A workout counts from', post: 'minutes', min: 5, max: 90, step: 5 },
  { k: 'workoutCap', pre: 'Workouts that earn points each week', post: 'workouts', min: 1, max: 7, step: 1 },
  { k: 'noPlanTarget', pre: 'Weekly target for members without a plan', post: 'workouts', min: 1, max: 7, step: 1 },
];

/** −/+ stepper for a whole number within bounds (keyboard: the buttons, and the value is announced). */
function Stepper({ label, value, min, max, step, post, disabled, invalid, onChange }: { label: string; value: number | null; min: number; max: number; step: number; post: string; disabled: boolean; invalid?: string; onChange: (v: number) => void }) {
  const v = value ?? min;
  const btn = 'grid h-8 w-8 place-items-center rounded-full border border-border bg-white text-ink disabled:opacity-40';
  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-bg p-3.5" role="group" aria-label={label}>
      <span className="text-[13px] font-medium leading-snug">{label}</span>
      <div className="flex items-center gap-2.5">
        <button type="button" className={btn} aria-label={`Lower: ${label.toLowerCase()}`} disabled={disabled || v <= min} onClick={() => onChange(Math.max(min, v - step))}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-7 text-center font-display text-[20px] font-extrabold" aria-live="polite">
          {v}
        </span>
        <button type="button" className={btn} aria-label={`Raise: ${label.toLowerCase()}`} disabled={disabled || v >= max} onClick={() => onChange(Math.min(max, v + step))}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="text-[13px] text-muted">{post}</span>
      </div>
      {invalid && <span className="text-[12px] font-semibold text-accent-dark">{invalid}</span>}
    </div>
  );
}

/**
 * Leaderboard (admin design: Team settings): the switch, results-to-chat and the Overview card, the workout rules, and a
 * read-only table of how members earn points (from the rules the server scores with).
 */
export function LeaderboardCard({ form, dirty, err, setOn, patch }: { form: SettingsForm; dirty: boolean; err: (k: string) => string | undefined; setOn: (v: boolean) => void; patch: (v: Partial<SettingsForm['board']>) => void }) {
  const on = form.featureFlags.leaderboard;
  const b = form.board;
  const R = BOARD_RULES;
  const D = DEFAULT_BOARD_SETTINGS;
  const table = [
    {
      h: 'Every day',
      rows: [
        [`Each meal logged (up to ${R.mealCap} a day)`, `+${R.meal}`],
        ['A snapped meal still waiting for its foods', `+${R.snapMeal} until finished`],
        [`Calories on track (a bit over or low: +${R.kcal.near}) · counted overnight`, `+${R.kcal.on}`],
        [`Protein on track (a bit low: +${R.protein.near}) · counted overnight`, `+${R.protein.on}`],
      ],
    },
    {
      h: 'Every week (Mon–Sun)',
      rows: [
        [`Each workout — planned, or any ${b.workoutMinMinutes ?? D.workoutMinMinutes}+ minutes (up to ${b.workoutCap ?? D.workoutCap} a week)`, `+${R.workout}`],
        [`Weekly activity plan done (no plan: ${b.noPlanTarget ?? D.noPlanTarget} workouts)`, `+${R.planDone}`],
        ['A weigh-in (the number is never used)', `+${R.weighIn}`],
        [`${R.fullWeekMinMeals} or more meals logged every day of the week`, `+${R.fullWeek}`],
      ],
    },
  ];
  return (
    <SettingsCard
      id="settings-board"
      title="Leaderboard"
      dirty={dirty}
      description={on ? 'Weekly crew board on the member Team tab. Week runs Mon–Sun and closes Monday at 3 am.' : 'Off. Members see the Team tab without the board, awards or results.'}
      actions={<Toggle size="lg" label="Leaderboard on or off" checked={on} onChange={setOn} />}
    >
      <div className={cn('flex flex-col gap-4 transition-opacity', !on && 'opacity-45')} aria-disabled={!on || undefined}>
        <div className="flex flex-col">
          <ToggleRow label="Post weekly results to chat" hint="Monday morning: podium, awards and “new week, everyone’s back to 0”." checked={on && b.postResults} disabled={!on} onChange={(v) => patch({ postResults: v })} />
          <ToggleRow label="Show on Overview" hint="Adds a top-five card to the admin dashboard." checked={on && b.showOnDashboard} disabled={!on} onChange={(v) => patch({ showOnDashboard: v })} />
        </div>
        <div className="grid gap-3 border-t border-hairline pt-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {NUMS.map((n) => (
            <Stepper key={n.k} label={n.pre} value={b[n.k]} min={n.min} max={n.max} step={n.step} post={n.post} disabled={!on} invalid={err(`board.${n.k}`)} onChange={(v) => patch({ [n.k]: v })} />
          ))}
        </div>
        <div className="flex flex-col gap-2.5 border-t border-hairline pt-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold">What members see</span>
            <span className="th">Read-only preview</span>
          </div>
          <p className="m-0 text-[13px] leading-relaxed">Points come from each member’s own targets and plan, so it’s effort, not size. Weight and calories are never shown to the crew.</p>
          {table.map((g) => (
            <div key={g.h} className="overflow-hidden rounded-md border border-hairline">
              <div className="grid gap-3 bg-bg px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted [grid-template-columns:minmax(0,1fr)_140px]">
                <span>{g.h}</span>
                <span>Points</span>
              </div>
              {g.rows.map(([l, p]) => (
                <div key={l} className="grid gap-3 border-t border-hairline px-3.5 py-2 text-[13px] leading-snug [grid-template-columns:minmax(0,1fr)_140px]">
                  <span>{l}</span>
                  <span className="font-mono text-[12px]">{p}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SettingsCard>
  );
}
