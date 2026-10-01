import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { api } from '@clubhouse/client';
import type { Nutrient } from '@clubhouse/contracts';
import { addDays } from '@clubhouse/domain';
import { useOnline } from '@clubhouse/ui';
import { useUi } from '@/app/uiStore';
import { qk } from '@/features/keys';
import { useMeData } from '@/features/me';
import { mergeMoments, useMoments } from '@/features/moments';
import { memberNow, useAiSummary } from '@/features/summary';
import { useToday } from '@/features/today';
import { Button } from '@/ui/atoms/Button';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { CalorieHero, MacroTiles } from '@/ui/organisms/today/CalorieHero';
import { CoachCard } from '@/ui/organisms/today/CoachCard';
import { CrewRow } from '@/ui/organisms/today/CrewRow';
import { LogActionsSheet } from '@/ui/organisms/today/LogActionsSheet';
import { buildEntries, LoggedList, type LogEntry } from '@/ui/organisms/today/LoggedList';
import { useListMotion } from '@/ui/organisms/today/motion';
import { NextUpCard } from '@/ui/organisms/today/NextUpCard';
import { NutrientSheet } from '@/ui/organisms/today/NutrientSheet';
import { TodayHeader } from '@/ui/organisms/today/TodayHeader';
import { TodaySkeleton } from '@/ui/organisms/today/TodaySkeleton';

/**
 * The date Today shows. The tab stays mounted while stack screens are open, so it keeps the last `?date=` it saw on
 * '/' instead of following other routes' search params.
 */
function useViewedDate(today: string): string {
  const loc = useLocation();
  const search = useSearch({ strict: false });
  const onToday = loc.pathname === '/';
  const param = onToday && typeof search.date === 'string' ? search.date : undefined;
  const [date, setDate] = useState(param ?? today);
  // Follow the URL while on '/' (adjust state during render); keep the last value elsewhere.
  const wanted = param && param <= today ? param : today;
  if (onToday && date !== wanted) setDate(wanted);
  return date;
}

export function TodayPage() {
  const me = useMeData();
  const navigate = useNavigate();
  const online = useOnline();
  const openLogSheet = useUi((s) => s.openLogSheet);
  const today = memberNow(me).date;
  const date = useViewedDate(today);
  const isToday = date === today;
  const q = useToday(isToday ? undefined : date);
  const t = q.data;
  const unread = useQuery({ queryKey: qk.unread, queryFn: () => api.chat.unread(), staleTime: 30_000 });
  const ai = useAiSummary(isToday ? undefined : date, me.ai.summaryAvailable && !!t, t ? `${Math.round(t.eaten.kcal)}:${t.burned}:${t.foodLogs.length}:${t.activityLogs.length}` : '');
  const recent = useMoments((s) => s.recent);
  const dismissed = useMoments((s) => s.dismissed);
  const [nutrient, setNutrient] = useState<Nutrient | null>(null);
  const [actions, setActions] = useState<LogEntry | null>(null);
  const m = useListMotion(0.04);

  const goDate = (d: string) => void navigate({ to: '/', search: d === today ? {} : { date: d }, replace: true });
  const entries = useMemo(() => (t ? buildEntries(t.foodLogs, t.activityLogs, t.weight) : []), [t]);
  const moments = useMemo(() => (t ? mergeMoments(t.memeMoments, isToday ? recent : [], dismissed) : []), [t, recent, dismissed, isToday]);

  return (
    <div className="flex flex-col gap-[18px] px-[22px] pb-6 pt-3.5">
      <TodayHeader
        date={date}
        isToday={isToday}
        canGoForward={date < today}
        goalWord={t?.goalWord ?? null}
        streak={t?.streak ?? null}
        inboxUnread={unread.data?.inbox ?? t?.unread.inbox ?? 0}
        person={{ name: me.user.displayName, initials: initialsOf(me.user.displayName), avatarUrl: me.user.avatarUrl }}
        onPrev={() => goDate(addDays(date, -1))}
        onNext={() => date < today && goDate(addDays(date, 1))}
        onToday={() => goDate(today)}
        onStreak={() => void navigate({ to: '/momentum' })}
        onInbox={() => void navigate({ to: '/inbox' })}
        onSettings={() => void navigate({ to: '/settings' })}
      />

      {!t && q.isPending && <TodaySkeleton />}
      {!t && q.isError && (
        <EmptyState
          illustration="rings"
          title={online ? 'Couldn’t load your day' : 'You’re offline'}
          body={online ? 'The server didn’t answer. Give it another go.' : 'This day isn’t saved on your phone yet. It loads when you’re back online.'}
          action={
            <Button variant="dark" onClick={() => void q.refetch()} loading={q.isFetching}>
              Try again
            </Button>
          }
        />
      )}

      {t && (
        <motion.div key={date} variants={m.container} initial="hidden" animate="show" className="flex flex-col gap-[18px]">
          <motion.div variants={m.item}>
            <CalorieHero t={t} onDetails={() => setNutrient('kcal')} />
          </motion.div>
          <motion.div variants={m.item}>
            <MacroTiles t={t} onOpen={setNutrient} />
          </motion.div>
          {isToday && t.nextUp && (
            <motion.div variants={m.item}>
              <NextUpCard next={t.nextUp} date={date} />
            </motion.div>
          )}
          <motion.div variants={m.item}>
            <CoachCard summary={t.summary} ai={ai.data} date={date} isToday={isToday} />
          </motion.div>
          <motion.div variants={m.item}>
            <CrewRow t={t} onOpen={(memberId) => void navigate({ to: '/team/$memberId', params: { memberId }, search: isToday ? {} : { date } })} />
          </motion.div>
          <motion.div variants={m.item}>
            {entries.length || moments.length ? (
              <LoggedList entries={entries} moments={moments} units={me.profile.units} tz={me.profile.timezone || me.team.timezone} onOpen={setActions} />
            ) : (
              <EmptyState
                title={isToday ? `Nothing yet — snap ${t.slots.find((s) => s.slot === t.currentSlot)?.label.toLowerCase() ?? 'breakfast'}?` : 'Nothing logged this day'}
                body={isToday ? 'One photo or a quick search is all it takes.' : 'Add what you remember — it counts all the same.'}
                action={<Button onClick={openLogSheet}>{isToday ? 'Log something' : 'Add to this day'}</Button>}
              />
            )}
          </motion.div>
        </motion.div>
      )}

      {t && <NutrientSheet t={t} nutrient={nutrient} onClose={() => setNutrient(null)} />}
      <LogActionsSheet entry={actions} onClose={() => setActions(null)} />
    </div>
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}
