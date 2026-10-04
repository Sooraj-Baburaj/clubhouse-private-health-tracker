import { Bot, Camera, MessageSquareText, Plane } from 'lucide-react';
import { useState } from 'react';
import type { DietPrefs, StreakKind } from '@clubhouse/contracts';
import { addDays } from '@clubhouse/domain';
import { dateLabel } from '@/features/format';
import { useMeData, useRefreshMe } from '@/features/me';
import { useMomentumSummary } from '@/features/progress';
import { errorText, useUpdatePreferences } from '@/features/settings';
import { api } from '@clubhouse/client';
import { toast } from '@clubhouse/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/features/keys';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ListGroup } from '@/ui/molecules/ListGroup';
import { StatTile } from '@/ui/molecules/StatTile';
import { ChipInput, dateInputCls, Divider, FieldRow, RadioList, ToggleRow } from './Kit';

/* ---------------- Diet preferences ---------------- */

const DIETS: { value: DietPrefs['diet']; label: string; sub: string }[] = [
  { value: 'none', label: 'No preference', sub: 'Everything’s on the table' },
  { value: 'vegetarian', label: 'Vegetarian', sub: 'No meat, fish or eggs' },
  { value: 'eggetarian', label: 'Eggetarian', sub: 'Vegetarian plus eggs' },
  { value: 'vegan', label: 'Vegan', sub: 'Nothing from animals' },
  { value: 'pescatarian', label: 'Pescatarian', sub: 'Vegetarian plus fish' },
];

export function DietPrefsSection() {
  const me = useMeData();
  const prefs = me.profile.dietPrefs;
  const update = useUpdatePreferences({ quiet: true });
  const save = (patch: Partial<DietPrefs>) => update.mutate({ dietPrefs: { ...prefs, ...patch } });
  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 px-1 text-[13px] text-neutral-700">Your admin sees these when writing your diet plan, and suggestions skip what you can’t or won’t eat.</p>
      <ListGroup title="Diet">
        <RadioList label="Diet type" value={prefs.diet} onChange={(diet) => save({ diet })} options={DIETS} />
      </ListGroup>
      <ListGroup title="Food notes">
        <ChipInput label="Allergies" values={prefs.allergies} onChange={(allergies) => save({ allergies })} placeholder="Type and press Enter" suggestions={['Peanuts', 'Tree nuts', 'Dairy', 'Gluten', 'Eggs', 'Soy', 'Shellfish', 'Sesame']} max={30} />
        <Divider />
        <ChipInput label="Dislikes" values={prefs.dislikes} onChange={(dislikes) => save({ dislikes })} placeholder="e.g. karela, mushrooms" max={50} />
        <Divider />
        <ChipInput label="Cuisines you love" values={prefs.cuisines} onChange={(cuisines) => save({ cuisines })} placeholder="Type and press Enter" suggestions={['North Indian', 'South Indian', 'Bengali', 'Gujarati', 'Maharashtrian', 'Punjabi', 'Indo-Chinese', 'Continental', 'Mediterranean']} max={20} />
      </ListGroup>
    </div>
  );
}

/* ---------------- AI ---------------- */

export function AiSection() {
  const me = useMeData();
  const o = me.profile.aiOptOuts;
  const update = useUpdatePreferences();
  const on = me.ai.teamOn;
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex items-center gap-3 rounded-[28px] p-4 ${on ? 'bg-accent-2-200 text-accent-2-900' : 'bg-surface'}`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg">
          <Bot aria-hidden className="h-5 w-5" strokeWidth={2.75} />
        </span>
        <span className="flex flex-col">
          <span className="font-heading text-[19px] leading-tight">{on ? 'AI is on for the team' : 'AI is off for the team'}</span>
          <span className="text-[13px] opacity-80">{on ? 'Photo logging, the daily coach and a few tips use AI. Every number still comes from the logic engine.' : 'Everything runs on the logic engine — search, targets, forecasts and summaries all still work.'}</span>
        </span>
      </div>
      <ListGroup title="Your choices" footer={!on ? 'These apply again when your admin turns AI back on.' : undefined}>
        <ToggleRow
          title="Photo logging with AI"
          sub={o.photo ? 'Off — photo logging stays hidden for you' : 'Snap a meal and AI reads the plate'}
          checked={!o.photo}
          disabled={!on || !me.ai.features['food.photo']}
          onChange={(v) => update.mutate({ aiOptOuts: { photo: !v } })}
        />
        <Divider />
        <ToggleRow
          title="Daily coach summary"
          sub={o.summary ? 'Off — you get the logic status strip instead' : 'A short AI note on your day'}
          checked={!o.summary}
          disabled={!on || !me.ai.features['home.summary']}
          onChange={(v) => update.mutate({ aiOptOuts: { summary: !v } })}
        />
      </ListGroup>
      <StatTile label="AI calls for you this month" value={me.ai.callsThisMonth.toLocaleString('en-IN')} sub="Counts towards the team’s AI budget" />
      <ListGroup title="What gets sent">
        <div className="flex flex-col gap-3 px-4 py-3.5 text-[14px]">
          <span className="flex gap-2.5">
            <Camera aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" strokeWidth={2.75} />
            <span>
              <b>Meal photos</b> — the shrunk photo and your meal slot. Never your name, weight or location.
            </span>
          </span>
          <span className="flex gap-2.5">
            <MessageSquareText aria-hidden className="h-4 w-4 shrink-0 text-accent-700" strokeWidth={2.75} />
            <span>
              <b>Daily summary and forecast notes</b> — today’s totals, targets and a week of averages, without your name.
            </span>
          </span>
          <span className="text-[12px] text-neutral-700">Requests go through one Clubhouse gateway to Claude. Nothing is used to train models.</span>
        </div>
      </ListGroup>
    </div>
  );
}

/* ---------------- Privacy ---------------- */

export function PrivacySection() {
  const me = useMeData();
  const pr = me.profile.privacy;
  const update = useUpdatePreferences();
  const flags = me.team.featureFlags;
  return (
    <div className="flex flex-col gap-3.5">
      <ListGroup title="Teammates see" footer="Your weight is never shown to teammates.">
        <RadioList
          label="What teammates see"
          value={pr.teammatesSee}
          onChange={(teammatesSee) => update.mutate({ privacy: { teammatesSee } })}
          options={[
            { value: 'summary', label: 'Daily summaries only', sub: 'Calories vs target, meals logged, streak' },
            { value: 'full', label: 'My full logs', sub: 'Also what you ate and each activity' },
          ]}
        />
      </ListGroup>
      <ListGroup title="Team">
        {flags.leaderboard && (
          <>
            <ToggleRow
              title="Show me on the leaderboard"
              sub={pr.showOnBoard ? 'Your points and rank show to the crew' : 'Off: you still see the board, but you’re left out of the ranks and awards'}
              checked={pr.showOnBoard}
              onChange={(v) => update.mutate({ privacy: { showOnBoard: v } })}
            />
            <Divider />
          </>
        )}
        {/* The leaderboard replaces the pulse comparison while it's on. */}
        {flags.teamPulse && !flags.leaderboard && (
          <>
            <ToggleRow title="Team pulse" sub="Compare consistency and sessions with others who join" checked={pr.teamPulseOptIn} onChange={(v) => update.mutate({ privacy: { teamPulseOptIn: v } })} />
            <Divider />
          </>
        )}
        {flags.roastMemes ? (
          <ToggleRow title="Roast memes" sub="Memes can poke fun at you when you go over" checked={pr.roastMemes} onChange={(v) => update.mutate({ privacy: { roastMemes: v } })} />
        ) : (
          <ToggleRow title="Roast memes" sub="Your admin has switched roasts off for the team" checked={false} disabled onChange={() => undefined} />
        )}
        <Divider />
        <ToggleRow
          title="Share my habits with the team"
          sub={me.profile.habitPrefs?.share ? 'Teammates see which habits you ticked' : 'Off: teammates only see how many you kept'}
          checked={!!me.profile.habitPrefs?.share}
          onChange={(v) => update.mutate({ habitPrefs: { share: v } })}
        />
      </ListGroup>
    </div>
  );
}

/* ---------------- Momentum ---------------- */

const STREAKS: { key: StreakKind; label: string; sub: string }[] = [
  { key: 'logging', label: 'Logging streak', sub: 'Days with at least one meal logged' },
  { key: 'activity', label: 'Activity streak', sub: 'Weeks you hit your activity plan' },
  { key: 'in_range', label: 'In-range streak', sub: 'Days inside your calorie band' },
];

export function MomentumSection() {
  const me = useMeData();
  const p = me.profile;
  const q = useMomentumSummary();
  const update = useUpdatePreferences({ quiet: true });
  const refreshMe = useRefreshMe();
  const qc = useQueryClient();
  const [from, setFrom] = useState(addDays(me.today, 1));
  const [to, setTo] = useState(addDays(me.today, 7));
  const onVacation = useMutation({
    mutationFn: () => api.profile.setVacation({ from, to }),
    onSuccess: () => {
      toast.success('Vacation saved — your streaks are safe');
      void refreshMe();
      void qc.invalidateQueries({ queryKey: qk.momentum });
    },
    onError: (e) => toast.error(errorText(e, 'Couldn’t save those dates.')),
  });
  const endVacation = useMutation({
    mutationFn: () => api.profile.endVacation(),
    onSuccess: () => {
      toast.show('Welcome back!');
      void refreshMe();
      void qc.invalidateQueries({ queryKey: qk.momentum });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const show = p.momentumPrefs.showOnToday;
  const v = q.data?.vacation;
  const upcoming = p.vacationRanges.filter((r) => r.to >= me.today);
  return (
    <div className="flex flex-col gap-3.5">
      {!q.data ? (
        <Skeleton h={80} r={24} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatTile tone="accent" label="Grace days left" value={`${q.data.streaks.logging.graceLeft} of ${q.data.graceBankMax}`} sub="A missed day pauses, never breaks" />
          <StatTile label="Vacation days left" value={`${v?.daysLeftThisQuarter ?? p.vacationDaysLeftThisQuarter}`} sub={`this quarter${v ? ` of ${v.quota}` : ''}`} />
        </div>
      )}
      <ListGroup title="Vacation" footer="Streaks freeze while you’re away and pick up where you left off.">
        {v?.active ? (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <span className="flex items-center gap-2 text-[15px] font-bold">
              <Plane aria-hidden className="h-4 w-4" strokeWidth={2.75} />
              On vacation{v.until ? ` until ${dateLabel(v.until, { day: 'numeric', month: 'short' })}` : ''}
            </span>
            <Button variant="secondary" size="sm" className="self-start" loading={endVacation.isPending} onClick={() => endVacation.mutate()}>
              I’m back — end vacation
            </Button>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="px-4 pt-3 text-[13px] text-neutral-700">
                Planned: {upcoming.map((r) => `${dateLabel(r.from, { day: 'numeric', month: 'short' })} – ${dateLabel(r.to, { day: 'numeric', month: 'short' })}`).join(', ')}
              </div>
            )}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2">
              <FieldRow label="From">
                <input type="date" className={dateInputCls} value={from} min={me.today} onChange={(e) => setFrom(e.target.value)} />
              </FieldRow>
              <FieldRow label="To">
                <input type="date" className={dateInputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </FieldRow>
            </div>
            <div className="px-4 pb-3.5">
              <Button size="sm" loading={onVacation.isPending} disabled={!from || !to || to < from} onClick={() => onVacation.mutate()} icon={<Plane className="h-4 w-4" strokeWidth={2.75} />}>
                Save vacation
              </Button>
            </div>
          </>
        )}
      </ListGroup>
      <ListGroup title="Show on Today">
        {STREAKS.map((s, i) => (
          <div key={s.key}>
            {i > 0 && <Divider />}
            <ToggleRow title={s.label} sub={s.sub} checked={show.includes(s.key)} onChange={(on) => update.mutate({ momentumPrefs: { showOnToday: on ? [...show, s.key] : show.filter((k) => k !== s.key) } })} />
          </div>
        ))}
      </ListGroup>
    </div>
  );
}
