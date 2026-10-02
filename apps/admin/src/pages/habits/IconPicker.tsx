import { useState } from 'react';
import { HABIT_ICON_SETS, isSingleEmoji } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { Input } from '@/ui';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** First grapheme of what was typed or pasted (so "🧘 yoga" still picks 🧘). */
function firstGrapheme(v: string): string {
  const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v.trim());
  return first?.segment ?? '';
}

/** Curated emoji by theme, plus any other emoji typed or pasted (validated as exactly one emoji). */
export function IconPicker({ value, onChange, error }: { value: string; onChange: (icon: string) => void; error?: string }) {
  const curated = HABIT_ICON_SETS.find((s) => s.icons.includes(value));
  const [set, setSet] = useState(curated?.label ?? HABIT_ICON_SETS[0]!.label);
  const [typed, setTyped] = useState(curated ? '' : value);
  const [typedError, setTypedError] = useState<string | null>(null);
  const icons = HABIT_ICON_SETS.find((s) => s.label === set)?.icons ?? [];

  const onType = (v: string) => {
    const g = firstGrapheme(v);
    setTyped(g);
    if (!g) return setTypedError(null);
    if (!isSingleEmoji(g)) return setTypedError('That isn’t an emoji. Use the emoji keyboard or paste one.');
    setTypedError(null);
    onChange(g);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Separate chips rather than one pill track: the six themes wrap in a drawer, and a wrapped track looks broken. */}
      <div role="radiogroup" aria-label="Icon theme" className="flex flex-wrap gap-1.5">
        {HABIT_ICON_SETS.map((s) => {
          const on = s.label === set;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSet(s.label)}
              className={cn('h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors', on ? 'border-ink bg-ink text-white' : 'border-border bg-white text-muted hover:border-muted hover:text-ink')}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label={`${set} icons`} className="grid grid-cols-8 gap-1.5">
        {icons.map((icon) => (
          <button
            key={icon}
            type="button"
            aria-pressed={value === icon}
            aria-label={`Icon ${icon}`}
            onClick={() => {
              setTyped('');
              setTypedError(null);
              onChange(icon);
            }}
            className={cn('grid aspect-square place-items-center rounded-[10px] bg-white text-[18px] transition-colors', value === icon ? 'border-2 border-ink' : 'border border-border hover:border-muted')}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <Input
          aria-label="Any other emoji"
          value={typed}
          onChange={(e) => onType(e.target.value)}
          placeholder="Or type any emoji"
          invalid={!!typedError}
          className={cn('w-[170px]', typed && !typedError && value === typed && 'border-ink')}
        />
        <span className="text-[12px] leading-snug text-muted">{isMac ? 'Emoji keyboard: ⌃ ⌘ Space' : 'Emoji keyboard: Win + .'}</span>
      </div>
      {(typedError || error) && (
        <span role="alert" className="text-[12px] font-semibold text-accent-dark">
          {typedError ?? error}
        </span>
      )}
    </div>
  );
}
