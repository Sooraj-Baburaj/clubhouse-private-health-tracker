import { useNavigate } from '@tanstack/react-router';
import type { BoardResponse } from '@clubhouse/contracts';
import { BOARD_RULES as R } from '@clubhouse/domain';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

type Rule = { what: string; sub?: string; pts: string };

/** The rules, from the domain constants and the team's knobs, so the sheet always matches what is counted. */
function groups(rules: BoardResponse['rules']): { title: string; rows: Rule[] }[] {
  return [
    {
      title: 'Every day',
      rows: [
        { what: 'Each meal logged', sub: `Up to ${R.mealCap} a day`, pts: `+${R.meal}` },
        { what: 'A snapped meal still waiting for its foods', pts: `+${R.snapMeal} until you finish it` },
        { what: 'Calories on track', sub: `A bit over or a bit low: +${R.kcal.near} · counted overnight`, pts: `+${R.kcal.on}` },
        { what: 'Protein on track', sub: `A bit low: +${R.protein.near} · counted overnight`, pts: `+${R.protein.on}` },
      ],
    },
    {
      title: 'Every week (Mon–Sun)',
      rows: [
        { what: 'Each workout', sub: `Planned, or any ${rules.workoutMinMinutes}+ minutes · up to ${rules.workoutCap} a week`, pts: `+${R.workout}` },
        { what: 'Your weekly activity plan done', sub: `No plan: ${rules.noPlanTarget} workouts`, pts: `+${R.planDone}` },
        { what: 'A weigh-in', sub: 'The number is never used', pts: `+${R.weighIn}` },
        { what: 'Two or more meals logged every day of the week', pts: `+${R.fullWeek}` },
      ],
    },
  ];
}

const NOTES = (rules: BoardResponse['rules']) => [
  'Log everything you eat — days far under your target don’t earn calorie points.',
  'Logs added more than two days late don’t earn points.',
  'Vacation days are filled with your average day.',
  'The week closes Monday at 3 am.',
  `A solid day is two or more meals logged plus one good call: calories on track or close, protein on track, or a ${rules.workoutMinMinutes}-minute workout.`,
  'Ties share a rank.',
];

/** "How points work": the rules tables, the small print and the way off the board. */
export function PointsSheet({ open, onClose, rules }: { open: boolean; onClose: () => void; rules: BoardResponse['rules'] | null }) {
  const navigate = useNavigate();
  return (
    <MemberSheet open={open && !!rules} onClose={onClose} title="How points work">
      {rules && (
        <div className="flex flex-col gap-3.5 pb-2">
          <div className="rounded-[26px] bg-accent-2-200 px-4 py-3.5 text-[15px] font-semibold leading-normal text-accent-2-900">
            Points come from your own targets and plan, so it’s effort, not size. Your weight and calories are never shown to the crew.
          </div>
          {groups(rules).map((g) => (
            <div key={g.title} className="flex flex-col">
              <div className="flex justify-between px-1 pb-1.5">
                <span className="eyebrow">{g.title}</span>
                <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Points</span>
              </div>
              <ul className="m-0 list-none rounded-[26px] bg-surface px-4 py-0.5">
                {g.rows.map((r, i) => (
                  <li key={r.what} className="flex items-start gap-3 py-3" style={{ borderBottom: i < g.rows.length - 1 ? '1px solid var(--color-divider)' : undefined }}>
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-semibold leading-snug">{r.what}</span>
                      {r.sub && <span className="text-[12px] leading-snug text-neutral-700">{r.sub}</span>}
                    </span>
                    <span className="max-w-[110px] text-right text-[14px] font-extrabold text-accent-700">{r.pts}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Good to know</span>
            {NOTES(rules).map((n) => (
              <div key={n} className="flex gap-2.5 text-[14px] leading-normal">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{n}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              void navigate({ to: '/settings/$section', params: { section: 'privacy' } });
            }}
            className="min-h-11 self-start border-0 bg-transparent p-0 text-[14px] font-bold text-accent-700"
          >
            Hide me from the leaderboard →
          </button>
        </div>
      )}
    </MemberSheet>
  );
}
