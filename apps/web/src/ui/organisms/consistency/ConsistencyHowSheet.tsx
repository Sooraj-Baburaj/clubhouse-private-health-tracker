import { CONSISTENCY_WEIGHTS } from '@clubhouse/domain';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

const PARTS = [
  { key: 'logging', title: 'Logging', body: 'Days you logged food. Today counts once you’ve logged something.' },
  { key: 'calories', title: 'Calories in range', body: 'Finished days where your calories landed inside your range. A day with nothing logged can’t be in range.' },
  { key: 'protein', title: 'Protein', body: 'Finished days where you reached your protein target (more is fine).' },
  {
    key: 'activity',
    title: 'Activity plan',
    body: 'Sessions from your weekly plan. Any day of the week counts, so moving Tuesday’s walk to Thursday changes nothing. A session is only missed once there aren’t enough days left in the week to fit it in. One session per activity a day counts.',
  },
  { key: 'habits', title: 'Habits', body: 'Required habits kept on the days they’re due. Weekly habits work like plan sessions: any days of the week.' },
] as const;

/** "How it works" for the consistency score (SYS-CALC-33 v2). */
export function ConsistencyHowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MemberSheet open={open} onClose={onClose} title="How consistency works">
      <p className="m-0 text-[14px] text-neutral-700">
        A score out of 100 for how closely you follow your plan, over a week (Monday to Sunday) or a month. It’s made of five parts, each the share of what was due that you did.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {PARTS.map((p) => (
          <li key={p.key} className="flex flex-col gap-0.5 rounded-[22px] bg-surface px-4 py-3">
            <span className="flex items-center justify-between gap-2 text-[15px] font-bold">
              {p.title}
              <span className="rounded-full bg-bg px-2.5 py-0.5 text-[12px] tabular">{CONSISTENCY_WEIGHTS[p.key]} pts</span>
            </span>
            <span className="text-[13px] text-neutral-700">{p.body}</span>
          </li>
        ))}
      </ul>
      <h3 className="m-0 pt-1 font-heading text-[18px]">Fair by design</h3>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-neutral-700">
        <li>Nothing counts against you before it could have happened: today’s calories wait until the day is over.</li>
        <li>A part that doesn’t apply to you, like a plan you don’t have or habits nobody set, is left out. The other parts share its points.</li>
        <li>Days on a break, rest weeks and days before you joined don’t count either way.</li>
        <li>Everything is judged against your own targets, so different goals compare fairly.</li>
      </ul>
      <h3 className="m-0 pt-1 font-heading text-[18px]">What the words mean</h3>
      <p className="m-0 text-[13px] text-neutral-700">
        <b className="text-text">Solid</b> 75 and up · <b className="text-text">Building</b> 45 to 74 · <b className="text-text">Rough week</b> (or month) under 45.
      </p>
      <p className="m-0 pb-2 text-[13px] text-neutral-700">The crew sees your score and these parts as days and sessions, never calories, foods or weight.</p>
    </MemberSheet>
  );
}
