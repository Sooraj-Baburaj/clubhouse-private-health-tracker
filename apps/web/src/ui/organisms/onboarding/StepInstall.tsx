import { CheckCircle2, EllipsisVertical, MonitorDown, Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { isIos, isStandalone } from '@/infrastructure/push';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { Toggle } from '@/ui/atoms/Toggle';
import { useListMotion } from '@/ui/organisms/today/motion';

type Platform = 'installed' | 'ios' | 'android' | 'desktop';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detect(): Platform {
  if (isStandalone()) return 'installed';
  if (isIos()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
}

const STEPS: Record<Exclude<Platform, 'installed'>, { icon: LucideIcon; text: string }[]> = {
  ios: [
    { icon: Share, text: 'Tap the Share button at the bottom of Safari.' },
    { icon: SquarePlus, text: 'Scroll down and tap “Add to Home Screen”.' },
    { icon: CheckCircle2, text: 'Tap Add, then open Clubhouse from your Home Screen.' },
  ],
  android: [
    { icon: EllipsisVertical, text: 'Tap the ⋮ menu at the top right of Chrome.' },
    { icon: MonitorDown, text: 'Tap “Install app” (or “Add to Home screen”).' },
    { icon: CheckCircle2, text: 'Open Clubhouse from your home screen or app drawer.' },
  ],
  desktop: [
    { icon: MonitorDown, text: 'Click the install icon at the right of the address bar.' },
    { icon: EllipsisVertical, text: 'No icon? Open the browser menu and choose “Install Clubhouse”.' },
    { icon: CheckCircle2, text: 'Clubhouse opens in its own window, like any app.' },
  ],
};

export interface AiChoices {
  photo: boolean;
  summary: boolean;
}

/** Step 4: Add-to-Home-Screen pictures for this browser, plus the AI notice with opt-outs when team AI is on. */
export function StepInstall({ aiOn, ai, onAiChange }: { aiOn: boolean; ai: AiChoices; onAiChange: (a: AiChoices) => void }) {
  const [platform] = useState(detect);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(platform === 'installed');
  const m = useListMotion(0.08, 0.1);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {installed ? (
        <div className="flex items-center gap-3 rounded-[28px] bg-accent-200 p-5 text-accent-900">
          <CheckCircle2 className="h-6 w-6 shrink-0" strokeWidth={2.75} aria-hidden />
          <span className="text-[15px] font-bold">You’re running Clubhouse from your Home Screen. Nice.</span>
        </div>
      ) : (
        <motion.ol variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col gap-2.5 p-0">
          {STEPS[platform as Exclude<Platform, 'installed'>].map((s, i) => (
            <motion.li key={i} variants={m.item} className="flex items-center gap-3.5 rounded-[26px] bg-surface px-4 py-3.5">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-bg">
                <s.icon className="h-5 w-5 text-accent-700" strokeWidth={2.75} aria-hidden />
                <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-text text-[11px] font-extrabold text-bg">{i + 1}</span>
              </span>
              <span className="text-[14px] font-semibold leading-snug">{s.text}</span>
            </motion.li>
          ))}
        </motion.ol>
      )}
      {prompt && !installed && (
        <Button
          variant="dark"
          block
          icon={<MonitorDown className="h-5 w-5" strokeWidth={2.75} aria-hidden />}
          onClick={() => {
            void prompt.prompt();
            void prompt.userChoice.then((c) => c.outcome === 'accepted' && setInstalled(true));
            setPrompt(null);
          }}
        >
          Install now
        </Button>
      )}

      {aiOn && (
        <div className="flex flex-col gap-3 rounded-[28px] bg-text p-5 text-bg">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-400">About AI</span>
            <AIBadge tone="dark" />
          </div>
          <p className="m-0 text-[14px] leading-normal">
            Your team uses AI to read meal photos and write a short daily summary. Anything AI makes carries this badge, and search works exactly the same without it. Switch either off here or later in Settings.
          </p>
          <label className="flex min-h-11 items-center justify-between gap-3 text-[14px] font-bold">
            Read my meal photos with AI
            <Toggle checked={ai.photo} onChange={(photo) => onAiChange({ ...ai, photo })} label="Read my meal photos with AI" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-[14px] font-bold">
            AI daily summary
            <Toggle checked={ai.summary} onChange={(summary) => onAiChange({ ...ai, summary })} label="AI daily summary" />
          </label>
        </div>
      )}
    </div>
  );
}
