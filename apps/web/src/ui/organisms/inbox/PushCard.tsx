import { BellOff, BellRing, Check, MoreVertical, PlusSquare, Share, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEnablePush, usePushState } from '@/features/push';
import { useMeData } from '@/features/me';
import { isIos } from '@/infrastructure/push';
import { Button } from '@/ui/atoms/Button';

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-bg text-accent-700" aria-hidden>
        {icon}
      </span>
      <span className="text-[13px]">
        <b className="mr-1">{n}.</b>
        {children}
      </span>
    </li>
  );
}

/** Explains how to get push on this device (iOS install, blocked permission, or a "Turn on" button). */
export function PushCard({ showWhenOn = false }: { showWhenOn?: boolean }) {
  const me = useMeData();
  const [state, refresh] = usePushState();
  const enable = useEnablePush(() => refresh());
  if (state === 'granted') {
    if (!showWhenOn) return null;
    return (
      <div className="flex items-center gap-3 rounded-[24px] bg-accent-2-200 px-4 py-3 text-accent-2-900">
        <Check aria-hidden className="h-5 w-5" strokeWidth={3} />
        <span className="text-[14px] font-bold">Push is on for this device</span>
      </div>
    );
  }
  const shell = (icon: ReactNode, title: string, body: ReactNode) => (
    <div className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent-fill">{icon}</span>
        <span className="font-heading text-[19px] leading-tight">{title}</span>
      </div>
      {body}
    </div>
  );
  if (state === 'ios-needs-install')
    return shell(
      <Smartphone className="h-5 w-5" strokeWidth={2.75} />,
      'Add Clubhouse to your Home Screen',
      <>
        <p className="m-0 text-[13px] text-neutral-700">On iPhone, reminders only arrive when Clubhouse is installed. It takes ten seconds:</p>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          <Step n={1} icon={<Share className="h-5 w-5" strokeWidth={2.75} />}>
            Tap <b>Share</b> in Safari’s toolbar
          </Step>
          <Step n={2} icon={<PlusSquare className="h-5 w-5" strokeWidth={2.75} />}>
            Choose <b>Add to Home Screen</b>
          </Step>
          <Step n={3} icon={<BellRing className="h-5 w-5" strokeWidth={2.75} />}>
            Open Clubhouse from your Home Screen and come back here to turn on reminders
          </Step>
        </ol>
      </>,
    );
  if (state === 'denied')
    return shell(
      <BellOff className="h-5 w-5" strokeWidth={2.75} />,
      'Notifications are blocked',
      <>
        <p className="m-0 text-[13px] text-neutral-700">Your browser is blocking Clubhouse. To let reminders through:</p>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {isIos() ? (
            <Step n={1} icon={<Smartphone className="h-5 w-5" strokeWidth={2.75} />}>
              Open <b>Settings › Notifications › Clubhouse</b> and switch on <b>Allow Notifications</b>
            </Step>
          ) : (
            <>
              <Step n={1} icon={<MoreVertical className="h-5 w-5" strokeWidth={2.75} />}>
                Tap the lock or <b>ⓘ</b> next to the address (or open the app’s <b>Site settings</b>)
              </Step>
              <Step n={2} icon={<BellRing className="h-5 w-5" strokeWidth={2.75} />}>
                Set <b>Notifications</b> to <b>Allow</b>, then come back here
              </Step>
            </>
          )}
        </ol>
      </>,
    );
  if (state === 'unsupported')
    return shell(<BellOff className="h-5 w-5" strokeWidth={2.75} />, 'No push in this browser', <p className="m-0 text-[13px] text-neutral-700">This browser can’t show notifications. Everything still lands in your inbox here.</p>);
  return shell(
    <BellRing className="h-5 w-5" strokeWidth={2.75} />,
    'Get a nudge at mealtimes',
    <>
      <p className="m-0 text-[13px] text-neutral-700">Reminders for meals, mentions from the crew and streak saves — never spam, and you choose which.</p>
      <Button onClick={() => enable.mutate(me.vapidPublicKey)} loading={enable.isPending} disabled={!me.vapidPublicKey} className="self-start">
        Turn on notifications
      </Button>
      {!me.vapidPublicKey && <span className="text-[12px] text-neutral-700">Push isn’t set up for this team yet — ask your admin.</span>}
    </>,
  );
}
