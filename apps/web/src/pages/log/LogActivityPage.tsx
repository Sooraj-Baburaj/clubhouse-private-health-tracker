import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { ActivityLogUpsert, ActivityTypeDto, GymFocus, Intensity, PlanItemDto } from '@clubhouse/contracts';
import { computeBurn } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import { activityLogToUpsert, FOCUS_OPTIONS, INTENSITY_OPTIONS, optimisticActivity, useActivityLogById, useActivityTypes, usePlan } from '@/features/activity';
import { fmt } from '@/features/format';
import { useSaveActivityLog } from '@/features/logs';
import { useMeData } from '@/features/me';
import { useMoments } from '@/features/moments';
import { memberNow } from '@/features/summary';
import { nowIso, uuid } from '@/lib/ids';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { IconButton } from '@/ui/atoms/IconButton';
import { Segmented } from '@/ui/atoms/Segmented';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { ActivityTypeGrid, BurnCard, DurationPicker, PlanChips } from '@/ui/organisms/log/ActivityPieces';
import { shortDay } from '@/ui/organisms/today/dates';
import { useListMotion } from '@/ui/organisms/today/motion';

/** First selection: ?plan=, ?type=, the next unfinished plan item, else the first type. */
function startingPick(types: ActivityTypeDto[], plan: PlanItemDto[], planParam?: string, typeParam?: string): { typeId: string; planItemId: string | null; duration: number } | null {
  const fromPlan = (p: PlanItemDto) => ({ typeId: p.typeId, planItemId: p.itemId, duration: p.targetMin ?? types.find((t) => t.id === p.typeId)?.defaultDurationMin ?? 30 });
  const fromType = (t: ActivityTypeDto) => ({ typeId: t.id, planItemId: null, duration: t.defaultDurationMin || 30 });
  const byParam = plan.find((p) => p.itemId === planParam);
  if (byParam) return fromPlan(byParam);
  const byKey = types.find((t) => t.key === typeParam);
  if (byKey) return fromType(byKey);
  const next = plan.find((p) => p.done < p.target);
  if (next) return fromPlan(next);
  return types[0] ? fromType(types[0]) : null;
}

/** APP-HOME-30/31: plan first, then type, duration, intensity/distance/focus, live MET burn, editable kcal. */
export function LogActivityPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const search = useSearch({ from: '/shell/log/activity' });
  const now = memberNow(me);
  const types = useActivityTypes();
  const plan = usePlan();
  const editing = useActivityLogById(search.edit, search.date ?? now.date);
  const log = editing.data ?? null;
  const date = log?.date ?? search.date ?? now.date;
  const save = useSaveActivityLog();
  const pushEffects = useMoments((s) => s.pushEffects);
  const m = useListMotion(0.05);

  const [typeId, setTypeId] = useState<string | null>(null);
  const [planItemId, setPlanItemId] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [focus, setFocus] = useState<GymFocus>('mixed');
  const [distance, setDistance] = useState('');
  const [override, setOverride] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeList = types.data ?? [];
  const planItems = plan.data?.hasPlan ? plan.data.items : [];
  const type = typeList.find((t) => t.id === typeId) ?? null;

  const pickType = (t: ActivityTypeDto, keepDuration = false) => {
    setTypeId(t.id);
    setOverride(null);
    if (!keepDuration) setDuration(t.defaultDurationMin || 30);
    if (planItemId && !planItems.some((p) => p.itemId === planItemId && p.typeId === t.id)) setPlanItemId(null);
  };
  const pickPlan = (p: PlanItemDto) => {
    const t = typeList.find((x) => x.id === p.typeId);
    setPlanItemId(p.itemId);
    setTypeId(p.typeId);
    setOverride(null);
    setDuration(p.targetMin ?? t?.defaultDurationMin ?? 30);
  };

  // Initial selection, once the data is in (adjust state during render): the edited log, ?plan=, ?type=,
  // the next unfinished plan item, else the first type.
  const [initialised, setInitialised] = useState(false);
  if (!initialised && typeList.length && !(search.edit && !log) && !(plan.isPending && plan.fetchStatus === 'fetching')) {
    setInitialised(true);
    if (log) {
      setTypeId(log.typeId);
      setPlanItemId(log.planItemId);
      setDuration(log.durationMin);
      if (log.intensity === 'light' || log.intensity === 'moderate' || log.intensity === 'hard') setIntensity(log.intensity);
      if (log.focus === 'strength' || log.focus === 'cardio' || log.focus === 'mixed') setFocus(log.focus);
      setDistance(log.distanceKm ? String(log.distanceKm) : '');
      setOverride(log.kcalOverridden ? log.kcalBurned : null);
    } else {
      const pick = startingPick(typeList, planItems, search.plan, search.type);
      if (pick) {
        setTypeId(pick.typeId);
        setPlanItemId(pick.planItemId);
        setDuration(pick.duration);
      }
    }
  }

  const weightKg = me.profile.weightKg ?? 70;
  const km = Number(distance.replace(',', '.'));
  const distanceKm = type?.inputs.includes('distance') && distance.trim() && Number.isFinite(km) && km > 0 ? km : null;
  const burn = type
    ? computeBurn(type, { durationMin: duration, distanceKm, intensity: type.inputs.includes('intensity') ? intensity : null, focus: type.inputs.includes('focus') ? focus : null }, weightKg)
    : { kcal: 0, met: 0 };
  const kcal = override ?? burn.kcal;
  const planLine = planItems.filter((p) => p.target > 0).map((p) => `${p.typeName} ${p.done} of ${p.target}`);
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));
  const done = () => void navigate({ to: '/', search: date === now.date ? {} : { date }, replace: true });

  const submit = () => {
    if (!type) return;
    const id = log?.id ?? uuid();
    const stamp = nowIso();
    const data: ActivityLogUpsert = {
      date,
      loggedAt: log?.loggedAt ?? stamp,
      typeId: type.id,
      durationMin: duration,
      distanceKm,
      intensity: type.inputs.includes('intensity') ? intensity : null,
      focus: type.inputs.includes('focus') ? focus : null,
      kcalOverride: override,
      planItemId: planItemId && planItems.some((p) => p.itemId === planItemId && p.typeId === type.id) ? planItemId : (log?.planItemId ?? null),
      note: log?.note ?? null,
      clientUpdatedAt: stamp,
    };
    save.mutate(
      { id, data, optimistic: optimisticActivity(id, data, type, kcal, override == null ? burn.met : null) },
      {
        onSuccess: (r) => {
          const pp = r.effects?.planProgress;
          if (!r.queued) toast.success(log ? 'Changes saved' : `${type.name} logged · −${fmt(kcal)} kcal${pp ? ` · ${pp.typeName} ${pp.done} of ${pp.target} this week` : ''}`);
          pushEffects(r.effects);
          done();
        },
      },
    );
  };
  const del = () => {
    if (!log) return;
    save.mutate({ id: log.id, data: activityLogToUpsert(log, { deleted: true }), optimistic: { ...log, deleted: true } }, { onSuccess: () => toast.show('Activity removed') });
    setConfirmDelete(false);
    done();
  };

  const header = (
    <StackHeader
      title={log ? 'Edit activity' : 'Log a move'}
      subtitle={date !== now.date ? `For ${shortDay(date)}` : undefined}
      onBack={back}
      right={
        log ? (
          <IconButton label="Delete this activity" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </IconButton>
        ) : undefined
      }
    />
  );

  if (types.isPending || (search.edit && editing.isPending)) {
    return (
      <div className="flex flex-col gap-[18px] px-5 pb-10 pt-2" aria-busy="true">
        {header}
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} h={64} r={24} />
          ))}
        </div>
        <Skeleton h={180} r={32} />
        <Skeleton h={120} r={32} />
      </div>
    );
  }
  if (types.isError || !typeList.length || (search.edit && !log)) {
    return (
      <div className="flex flex-col gap-[18px] px-5 pb-10 pt-2">
        {header}
        <EmptyState
          illustration="rings"
          title={search.edit && !log ? 'Couldn’t find that activity' : 'Activities didn’t load'}
          body="Check your connection and try again."
          action={
            <Button variant="dark" onClick={() => void (search.edit ? editing.refetch() : types.refetch())}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <motion.div variants={m.container} initial="hidden" animate="show" className="flex min-h-full flex-col gap-[18px] px-5 pb-10 pt-2">
      {header}
      <motion.div variants={m.item}>
        <PlanChips items={planItems} selected={planItemId} onPick={pickPlan} />
      </motion.div>
      <motion.div variants={m.item}>
        <ActivityTypeGrid types={typeList} value={typeId} onPick={(t) => pickType(t)} />
      </motion.div>
      {type && (
        <>
          <motion.div variants={m.item}>
            <DurationPicker
              value={duration}
              onChange={(v) => {
                setDuration(v);
              }}
            >
              {type.inputs.includes('focus') && <Segmented label="Focus" value={focus} onChange={setFocus} options={FOCUS_OPTIONS} />}
              {type.inputs.includes('intensity') && !distanceKm && <Segmented label="Intensity" value={intensity} onChange={setIntensity} options={INTENSITY_OPTIONS} />}
              {type.inputs.includes('distance') && (
                <TextField
                  label="Distance (optional)"
                  inputMode="decimal"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
                  suffix={<span className="text-neutral-700">km</span>}
                  hint={distanceKm ? `${fmt((distanceKm / duration) * 60)} km/h sets the effort` : 'Add it and your pace sets the effort'}
                  className="w-full"
                />
              )}
            </DurationPicker>
          </motion.div>
          <motion.div variants={m.item}>
            <BurnCard kcal={burn.kcal} met={burn.met} weightKg={weightKg} minutes={duration} override={override} onOverride={setOverride} />
          </motion.div>
        </>
      )}
      {planLine.length > 0 && (
        <motion.div variants={m.item} className="text-center text-[13px] text-neutral-700">
          This week: {planLine.join(' · ')}
        </motion.div>
      )}
      <motion.div variants={m.item} className="sticky mt-auto" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <Button size="lg" block className="min-h-14 text-[18px] shadow-lg" disabled={!type} loading={save.isPending} onClick={submit}>
          {log ? 'Save changes' : `Log ${type?.name.toLowerCase() ?? 'activity'}`}
        </Button>
      </motion.div>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={del} title="Delete this activity?" body="It comes off your day and your burn updates straight away." confirmLabel="Delete" danger />
    </motion.div>
  );
}
