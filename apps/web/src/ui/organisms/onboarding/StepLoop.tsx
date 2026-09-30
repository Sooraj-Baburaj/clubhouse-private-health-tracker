import { Bell, BellOff, Check, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { enablePush, pushState, type PushState } from '@/infrastructure/push';
import { Button } from '@/ui/atoms/Button';

const COPY: Record<PushState, { title: string; body: string }> = {
  default: { title: 'Meal-time nudges', body: 'A gentle ping at breakfast, lunch and dinner, and one when your streak needs you. Never spammy — tune it any time.' },
  granted: { title: 'Reminders are on', body: 'We’ll nudge you around meal times. Change times or switch any of them off in Settings.' },
  denied: { title: 'Reminders are blocked', body: 'Your browser said no. You can allow notifications for Clubhouse in the browser settings, then switch them on in Settings.' },
  'ios-needs-install': { title: 'One step first on iPhone', body: 'iPhone only shows reminders for apps on the Home Screen. The next step shows how — then turn them on in Settings.' },
  unsupported: { title: 'Reminders aren’t available here', body: 'This browser can’t show notifications. Everything else works the same.' },
};

/** Step 3 "Stay in the loop": asks for notification permission inside the tap (an iOS requirement). */
export function StepLoop({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<PushState>(() => pushState());
  const [busy, setBusy] = useState(false);
  const [serverOff, setServerOff] = useState(false);
  const turnOn = async () => {
    setBusy(true);
    try {
      const r = await enablePush(vapidPublicKey);
      if (r === 'default' && !vapidPublicKey) setServerOff(true);
      setState(r);
    } catch {
      setState('denied');
    } finally {
      setBusy(false);
    }
  };
  const copy = serverOff ? { title: 'Reminders aren’t switched on yet', body: 'Your team hasn’t set up reminders on the server. You can turn them on later in Settings.' } : COPY[state];
  const Icon = state === 'granted' ? Check : state === 'default' ? Bell : state === 'ios-needs-install' ? Smartphone : BellOff;
  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="wait">
        <motion.div key={state + String(serverOff)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex gap-4 rounded-[28px] bg-surface p-5">
          <motion.span
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className={state === 'granted' ? 'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill' : 'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-200 text-accent-800'}
          >
            <Icon className="h-5 w-5" strokeWidth={2.75} aria-hidden />
          </motion.span>
          <div className="flex flex-col gap-1">
            <div className="font-heading text-[19px] leading-tight">{copy.title}</div>
            <p className="m-0 text-[14px] leading-normal text-neutral-700">{copy.body}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      {state === 'default' && !serverOff && (
        <Button size="lg" block onClick={() => void turnOn()} loading={busy} icon={<Bell className="h-5 w-5" strokeWidth={2.75} aria-hidden />}>
          Turn on reminders
        </Button>
      )}
    </div>
  );
}
