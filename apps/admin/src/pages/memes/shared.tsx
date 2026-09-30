import { ImageOff } from 'lucide-react';
import { MEME_TAGS_DEFAULT, type CompareOp, type CooldownScope, type MemeTone, type PersonalRecord, type TriggerAction, type TriggerEvent } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import { Pill, type PillTone } from '@/ui';

/* ───────── Friendly labels ───────── */

export const EVENT_LABELS: Record<TriggerEvent, string> = {
  log_saved: 'Any log saved',
  food_log_saved: 'Food logged',
  activity_log_saved: 'Activity logged',
  weight_log_saved: 'Weight logged',
  day_end: 'Day ends',
  streak_changed: 'Streak changed',
  chat_message_posted: 'Chat message posted',
  weekly_recap: 'Weekly recap',
};

export const EVENT_HINTS: Record<TriggerEvent, string> = {
  log_saved: 'Runs after any food, activity or weight entry.',
  food_log_saved: 'Runs each time a member logs food.',
  activity_log_saved: 'Runs each time a member logs an activity.',
  weight_log_saved: 'Runs each time a member logs a weigh-in.',
  day_end: 'Runs once per member in the nightly rollover for the day just finished.',
  streak_changed: 'Runs when a streak grows, pauses, resumes or resets.',
  chat_message_posted: 'Runs on every chat message a member posts.',
  weekly_recap: 'Runs when the weekly recap is built on Monday.',
};

export const ACTION_LABELS: Record<TriggerAction, string> = {
  show_private: 'Show privately to the member',
  post_chat_tag: 'Post in chat and tag the member',
  post_chat_no_tag: 'Post in chat without a tag',
  reply_to_message: 'Reply to their chat message',
  react_to_message: 'React to their chat message',
};

export const COOLDOWN_LABELS: Record<CooldownScope, string> = {
  member_day: 'Once per member per day',
  member_week: 'Once per member per week',
  team_day: 'Once per day for the whole team',
  plan_item_week: 'Once per plan item per week',
  record_week: 'Once per record per week',
  none: 'No cooldown',
};

export const OP_LABELS: Record<CompareOp, string> = {
  gt: 'more than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  eq: 'exactly',
};

export const RECORD_LABELS: Record<PersonalRecord, string> = {
  longest_run: 'Longest run',
  longest_swim: 'Longest swim',
  longest_ride: 'Longest ride',
  longest_streak: 'Longest streak',
  most_sessions_week: 'Most sessions in a week',
};

export const MACRO_LABELS = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre' } as const;

export const STREAK_KIND_LABELS = { logging: 'Logging streak', activity: 'Activity streak', in_range: 'In-range streak', team: 'Team streak' } as const;

export const BAND_LABELS = { green: 'In range', under: 'Under target', over: 'Over target', red: 'Well over target' } as const;

export const TONE_LABELS: Record<MemeTone, string> = { roast: 'Roast', celebrate: 'Celebrate', neutral: 'Neutral' };
const TONE_PILL: Record<MemeTone, PillTone> = { roast: 'accent', celebrate: 'in', neutral: 'neutral' };

export function eventLabel(e: string): string {
  return EVENT_LABELS[e as TriggerEvent] ?? humanize(e);
}
export function actionLabel(a: string): string {
  return ACTION_LABELS[a as TriggerAction] ?? humanize(a);
}
export function tagLabel(t: string): string {
  return humanize(t);
}

/** Tags offered in pickers: the defaults plus whatever the library already uses. */
export function tagOptions(libraryTags: Iterable<string>): string[] {
  return Array.from(new Set<string>([...MEME_TAGS_DEFAULT, ...libraryTags])).sort((a, b) => a.localeCompare(b));
}

/* ───────── Small display pieces ───────── */

export function TonePill({ tone, className }: { tone: MemeTone; className?: string }) {
  return (
    <Pill tone={TONE_PILL[tone]} className={className}>
      {TONE_LABELS[tone]}
    </Pill>
  );
}

/** Square meme image (thumb first, lazy) with the design's striped placeholder when there is no image. */
export function MemeImage({ url, alt, className, rounded = false }: { url: string | null | undefined; alt: string; className?: string; rounded?: boolean }) {
  return (
    <div
      className={cn('relative aspect-square w-full overflow-hidden', rounded && 'rounded-[12px]', className)}
      style={url ? { background: '#F8F7F4' } : { background: 'repeating-linear-gradient(135deg,#F8F7F4 0 8px,#EEECE7 8px 16px)' }}
    >
      {url ? (
        <img src={url} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span className="flex flex-col items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <ImageOff aria-hidden className="h-4 w-4" />
            No image
          </span>
        </div>
      )}
    </div>
  );
}

/* ───────── Validation issues → friendly text ───────── */

export interface Issue {
  path: PropertyKey[];
  message: string;
  code?: string;
  [k: string]: unknown;
}

/** Turns zod issues into plain language; custom (guardrail) messages pass through unchanged. */
export function friendlyIssue(i: Issue): string {
  const origin = typeof i.origin === 'string' ? i.origin : '';
  const last = i.path[i.path.length - 1];
  switch (i.code) {
    case 'custom':
      return i.message;
    case 'invalid_type':
      return i.expected === 'number' ? 'Enter a number.' : 'This is required.';
    case 'too_small':
      if (origin === 'array') return i.minimum === 1 ? 'Pick at least one.' : `Pick at least ${String(i.minimum)}.`;
      if (origin === 'string') return last === 'name' ? 'Give the trigger a name.' : 'This is required.';
      return `Use ${String(i.minimum)} or more.`;
    case 'too_big':
      if (origin === 'array') return `Up to ${String(i.maximum)} allowed.`;
      if (origin === 'string') return `Keep it to ${String(i.maximum)} characters.`;
      return `Use ${String(i.maximum)} or less.`;
    case 'invalid_format':
      return i.format === 'uuid' ? 'Pick one from the list.' : i.format === 'regex' ? 'Use a time like 21:30.' : 'Check this value.';
    case 'not_multiple_of':
      return 'Use a whole number.';
    case 'invalid_value':
      return 'Pick one of the options.';
    default:
      return i.message;
  }
}

/** Issues whose path starts with `prefix` (exact = only issues at exactly that path). */
export function issuesAt(issues: Issue[], prefix: PropertyKey[], exact = false): string[] {
  const out = issues
    .filter((i) => (exact ? i.path.length === prefix.length : i.path.length >= prefix.length) && prefix.every((p, n) => i.path[n] === p))
    .map(friendlyIssue);
  return Array.from(new Set(out));
}

export function IssueText({ messages, className }: { messages: string[]; className?: string }) {
  if (!messages.length) return null;
  return (
    <span role="alert" className={cn('text-[12px] font-semibold leading-snug text-accent-dark', className)}>
      {messages.join(' ')}
    </span>
  );
}
