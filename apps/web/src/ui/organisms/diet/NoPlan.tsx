import { useNavigate } from '@tanstack/react-router';
import { MessageCircle, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { DietResponse, Nutrients } from '@clubhouse/contracts';
import { fadeUp, stagger, toast } from '@clubhouse/ui';
import { prefillChat, useChatMembers } from '@/features/chat';
import { deleteUpsert } from '@/features/diet';
import { fmt, fmtG } from '@/features/format';
import { useSaveFoodLog } from '@/features/logs';
import { nowIso, uuid } from '@/lib/ids';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StatTile } from '@/ui/molecules/StatTile';
import type { FoodLogUpsert } from '@clubhouse/contracts';

/** No plan yet: targets + 3 generic ideas per slot + "ask your admin" (APP-DIET-08). */
export function NoPlan({ d, targets }: { d: DietResponse; targets: Nutrients | null }) {
  const save = useSaveFoodLog();
  const navigate = useNavigate();
  const members = useChatMembers();
  const admin = members.data?.find((m) => m.role === 'admin' || m.role === 'super_admin');
  const ask = () => {
    prefillChat(`${admin ? `@${admin.username} ` : ''}could you set up a diet plan for me? 🙏`);
    void navigate({ to: '/chat', search: {} });
  };
  const log = (slot: DietResponse['slots'][number]['slot'], label: string, f: NonNullable<DietResponse['suggestions']>[number]['foods'][number]) => {
    const id = uuid();
    const at = nowIso();
    const data: FoodLogUpsert = { date: d.date, mealSlot: slot, loggedAt: at, clientUpdatedAt: at, items: [{ foodId: f.id, name: f.name, grams: f.servingGrams, servings: 1, servingLabel: f.servingLabel, source: 'search' }] };
    save.mutate(
      { id, data },
      {
        onSuccess: (r) => {
          if (!r.queued) toast.success(`${label} logged · ${fmt(f.kcal)} kcal`, { action: { label: 'Undo', onClick: () => save.mutate({ id, data: deleteUpsert(data) }) } });
        },
      },
    );
  };
  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-3.5">
      <motion.div variants={fadeUp} className="flex flex-col gap-0.5">
        <span className="eyebrow">No plan yet</span>
        <h1 className="font-heading text-[30px] leading-[1.1]">Your plates, your call</h1>
        <span className="text-[14px] text-neutral-700">Until your admin sets a plan, aim for these and borrow an idea or two.</span>
      </motion.div>
      {targets && (
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 rounded-[28px] bg-accent p-4 text-on-accent">
            <span className="font-heading text-[40px] leading-none tabular">{fmt(targets.kcal)}</span>
            <span className="text-[14px] font-bold text-on-accent-sub">kcal a day</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <StatTile label="Protein" value={fmtG(targets.protein)} />
            <StatTile label="Carbs" value={fmtG(targets.carbs)} />
            <StatTile label="Fat" value={fmtG(targets.fat)} />
            <StatTile label="Fibre" value={fmtG(targets.fibre)} />
          </div>
        </motion.div>
      )}
      {d.suggestions?.length ? (
        d.suggestions.map((s) => (
          <motion.section variants={fadeUp} key={s.slot} aria-label={s.label} className="flex flex-col gap-1.5 rounded-[30px] bg-surface p-4">
            <h2 className="font-heading text-[19px]">{s.label}</h2>
            {s.foods.slice(0, 3).map((f) => (
              <div key={f.id} className="flex min-h-12 items-center gap-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-semibold">{f.name}</span>
                  <span className="text-[12px] text-neutral-700">
                    {f.servingLabel} · {fmt(f.kcal)} kcal · P {fmtG(f.protein)}
                  </span>
                </span>
                <IconButton label={`Log ${f.name} for ${s.label}`} tone="accent" onClick={() => log(s.slot, s.label, f)}>
                  <Plus className="h-5 w-5" strokeWidth={3} />
                </IconButton>
              </div>
            ))}
          </motion.section>
        ))
      ) : (
        <EmptyState title="Ideas are on their way" body="Search any food from the + button — your targets above still guide the day." />
      )}
      <motion.div variants={fadeUp}>
        <Button variant="dark" size="lg" block icon={<MessageCircle className="h-5 w-5" strokeWidth={2.75} />} onClick={ask}>
          Ask your admin for a plan
        </Button>
      </motion.div>
    </motion.div>
  );
}
