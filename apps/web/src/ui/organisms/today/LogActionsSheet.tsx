import { useNavigate } from '@tanstack/react-router';
import { Copy, MessageCircle, Pencil, RotateCcw, Scale, Trash2, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { ApiError } from '@clubhouse/client';
import { slotForTime } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { activityLogToUpsert } from '@/features/activity';
import { foodLogToUpsert, optimisticFoodLog, shareLogToChat } from '@/features/food';
import { fmt, SLOT_LABEL } from '@/features/format';
import { useSaveActivityLog, useSaveFoodLog, useSaveWeight } from '@/features/logs';
import { useMeData } from '@/features/me';
import { memberNow } from '@/features/summary';
import { useUi } from '@/app/uiStore';
import { nowIso, uuid } from '@/lib/ids';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import type { LogEntry } from './LoggedList';
import { useListMotion } from './motion';

interface Action {
  key: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}

function titleOf(e: LogEntry) {
  if (e.kind === 'food') return `${SLOT_LABEL[e.log.mealSlot]} · ${fmt(e.log.totals.kcal)} kcal`;
  if (e.kind === 'activity') return `${e.log.typeName} · ${e.log.durationMin} min`;
  return 'Weigh-in';
}

/** Edit, delete (confirm), duplicate, log again now, share to chat — for a row on Today. */
export function LogActionsSheet({ entry, onClose }: { entry: LogEntry | null; onClose: () => void }) {
  const me = useMeData();
  const navigate = useNavigate();
  const openWeightSheet = useUi((s) => s.openWeightSheet);
  const saveFood = useSaveFoodLog();
  const saveAct = useSaveActivityLog();
  const saveWeight = useSaveWeight();
  const [confirm, setConfirm] = useState<LogEntry | null>(null);
  const m = useListMotion(0.03);

  const now = () => memberNow(me);
  const del = (e: LogEntry) => {
    const stamp = nowIso();
    if (e.kind === 'food') saveFood.mutate({ id: e.log.id, data: foodLogToUpsert(e.log, { deleted: true, clientUpdatedAt: stamp }), optimistic: { ...e.log, deleted: true } }, { onSuccess: () => toast.show('Log removed') });
    else if (e.kind === 'activity') saveAct.mutate({ id: e.log.id, data: activityLogToUpsert(e.log, { deleted: true, clientUpdatedAt: stamp }), optimistic: { ...e.log, deleted: true } }, { onSuccess: () => toast.show('Activity removed') });
    else saveWeight.mutate({ id: e.log.id, data: { date: e.log.date, weightKg: e.log.weightKg, note: e.log.note, clientUpdatedAt: stamp, deleted: true } }, { onSuccess: () => toast.show('Weigh-in removed') });
  };

  const copyFood = (e: Extract<LogEntry, { kind: 'food' }>, again: boolean) => {
    const id = uuid();
    const n = now();
    const stamp = nowIso();
    const data = foodLogToUpsert(e.log, again ? { date: n.date, mealSlot: slotForTime(n.time, me.team.mealSlots), loggedAt: stamp, clientUpdatedAt: stamp } : { loggedAt: stamp, clientUpdatedAt: stamp });
    saveFood.mutate({ id, data, optimistic: optimisticFoodLog(id, data) }, { onSuccess: () => toast.success(again ? `Logged again for ${SLOT_LABEL[data.mealSlot].toLowerCase()}` : `Duplicated · ${fmt(e.log.totals.kcal)} kcal`) });
  };
  const copyActivity = (e: Extract<LogEntry, { kind: 'activity' }>, again: boolean) => {
    const id = uuid();
    const stamp = nowIso();
    const data = activityLogToUpsert(e.log, { planItemId: null, loggedAt: stamp, clientUpdatedAt: stamp, ...(again ? { date: now().date } : {}) });
    saveAct.mutate({ id, data, optimistic: { ...e.log, id, date: data.date, loggedAt: stamp, clientUpdatedAt: stamp, planItemId: null, addedLate: false } }, { onSuccess: () => toast.success(again ? `${e.log.typeName} logged again` : `${e.log.typeName} duplicated`) });
  };
  const share = (kind: 'food_log' | 'activity_log', id: string) =>
    shareLogToChat(kind, id)
      .then((r) => toast.success(r === 'sent' ? 'Shared to the team chat' : 'Will share to chat when you’re back online'))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t share that.'));

  const actions: Action[] = [];
  if (entry?.kind === 'food') {
    const e = entry;
    actions.push(
      { key: 'edit', label: 'Edit', sub: 'Change items, portions or meal', icon: Pencil, run: () => void navigate({ to: '/log/food', search: { edit: e.log.id, date: e.log.date } }) },
      { key: 'dup', label: 'Duplicate', sub: `Another ${SLOT_LABEL[e.log.mealSlot].toLowerCase()} just like it`, icon: Copy, run: () => copyFood(e, false) },
      { key: 'again', label: 'Log again now', sub: 'Same food, right now', icon: RotateCcw, run: () => copyFood(e, true) },
      { key: 'share', label: 'Share to chat', icon: MessageCircle, run: () => void share('food_log', e.log.id) },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true, run: () => setConfirm(e) },
    );
  } else if (entry?.kind === 'activity') {
    const e = entry;
    actions.push(
      { key: 'edit', label: 'Edit', sub: 'Type, time or burn', icon: Pencil, run: () => void navigate({ to: '/log/activity', search: { edit: e.log.id, date: e.log.date } }) },
      { key: 'dup', label: 'Duplicate', icon: Copy, run: () => copyActivity(e, false) },
      { key: 'again', label: 'Log again now', icon: RotateCcw, run: () => copyActivity(e, true) },
      { key: 'share', label: 'Share to chat', icon: MessageCircle, run: () => void share('activity_log', e.log.id) },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true, run: () => setConfirm(e) },
    );
  } else if (entry?.kind === 'weight') {
    const e = entry;
    actions.push({ key: 'edit', label: 'Update weight', icon: Scale, run: () => openWeightSheet() }, { key: 'delete', label: 'Delete', icon: Trash2, danger: true, run: () => setConfirm(e) });
  }

  return (
    <>
      <MemberSheet open={!!entry} onClose={onClose} title={entry ? titleOf(entry) : undefined} label="Log actions">
        <motion.ul variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col gap-2 p-0">
          {actions.map((a) => (
            <motion.li key={a.key} variants={m.item}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  onClose();
                  a.run();
                }}
                className={cn('flex min-h-14 w-full items-center gap-3.5 rounded-[22px] px-4 py-3 text-left', a.danger ? 'bg-band-red-bg text-band-red-fg' : 'bg-surface text-text')}
              >
                <a.icon className="h-5 w-5 shrink-0" strokeWidth={2.75} aria-hidden />
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">{a.label}</span>
                  {a.sub && <span className="text-[12px] opacity-80">{a.sub}</span>}
                </span>
              </motion.button>
            </motion.li>
          ))}
        </motion.ul>
      </MemberSheet>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) del(confirm);
          setConfirm(null);
        }}
        title={confirm?.kind === 'weight' ? 'Delete this weigh-in?' : 'Delete this log?'}
        body="It comes off your day and your totals update straight away."
        confirmLabel="Delete"
        danger
      />
    </>
  );
}
