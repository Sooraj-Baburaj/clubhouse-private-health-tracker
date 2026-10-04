import { CalendarDays, Camera, Check, Plus, Utensils } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from '@clubhouse/ui';
import { uploadChatPhoto, useChatStore, useMemes, type DraftAttachment } from '@/features/chat';
import { fmt, SLOT_LABEL } from '@/features/format';
import { useToday } from '@/features/today';
import { errorText } from '@/features/settings';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Spinner } from '@/ui/atoms/Spinner';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { cn } from '@/lib/cn';

/** "+" in the composer: tag today's logs, a day card, a photo or a meme (APP-CHAT-03/04). */
export function AttachSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useToday();
  const memes = useMemes(open);
  const { attachments, addAttachment } = useChatStore();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const full = attachments.length >= 4;
  const has = (key: string) => attachments.some((a) => a.key === key);
  const add = (a: DraftAttachment) => {
    if (full) return toast.show('Up to 4 attachments per message');
    addAttachment(a);
    onClose();
  };
  const t = today.data;
  const logs = t ? [...t.foodLogs.map((f) => ({ kind: 'food' as const, f })), ...t.activityLogs.map((a) => ({ kind: 'act' as const, a }))] : [];

  return (
    <MemberSheet open={open} onClose={onClose} title="Add to your message">
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setUploading(true);
          try {
            add(await uploadChatPhoto(f));
          } catch (err) {
            toast.error(errorText(err, 'Couldn’t upload that photo.'));
          } finally {
            setUploading(false);
          }
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={uploading ? <Spinner className="h-5 w-5" /> : <Camera className="h-5 w-5" strokeWidth={2.75} />}
          label={uploading ? 'Uploading…' : 'Photo'}
          sub="Shrunk on your phone first"
          disabled={uploading || full}
          onClick={() => file.current?.click()}
        />
        <Tile
          icon={<CalendarDays className="h-5 w-5" strokeWidth={2.75} />}
          label="Day card"
          sub={t ? `${fmt(t.eaten.kcal)} kcal · ${fmt(t.burned)} burned` : 'Today so far'}
          disabled={!t || full || has(`day:${t?.date}`)}
          onClick={() => t && add({ key: `day:${t.date}`, input: { type: 'day_card', date: t.date }, label: `Day card · ${fmt(t.eaten.kcal)} kcal` })}
        />
      </div>

      <h3 className="mt-1 px-1.5 font-body text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Tag a log from today</h3>
      {!t ? (
        <Skeleton h={60} r={24} />
      ) : !logs.length ? (
        <p className="m-0 rounded-[24px] bg-surface px-4 py-3 text-[13px] text-neutral-700">Nothing logged today yet — log a meal and tag it here.</p>
      ) : (
        <div className="flex flex-col rounded-[28px] bg-surface py-1">
          {logs.map((l) => {
            const key = l.kind === 'food' ? `food:${l.f.id}` : `act:${l.a.id}`;
            const label = l.kind === 'food' ? `${l.f.items[0]?.name ?? SLOT_LABEL[l.f.mealSlot]}${l.f.items.length > 1 ? ` +${l.f.items.length - 1}` : ''} · ${fmt(l.f.totals.kcal)} kcal` : `${l.a.typeName} · ${l.a.durationMin} min · ${fmt(l.a.kcalBurned)} kcal`;
            const on = has(key);
            return (
              <button
                key={key}
                type="button"
                disabled={on || full}
                onClick={() => add(l.kind === 'food' ? { key, input: { type: 'food_log', id: l.f.id }, label, thumbUrl: l.f.thumbUrl } : { key, input: { type: 'activity_log', id: l.a.id }, label })}
                className="flex min-h-14 items-center gap-3 border-0 bg-transparent px-4 py-2 text-left disabled:opacity-60"
              >
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full', l.kind === 'food' ? 'bg-accent-200 text-accent-800' : 'bg-accent-2-200 text-accent-2-800')}>
                  {l.kind === 'food' ? l.f.thumbUrl ? <img src={l.f.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Utensils aria-hidden className="h-4 w-4" strokeWidth={2.75} /> : <ActivityIcon icon={l.a.icon} className="h-4 w-4" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-bold">{label}</span>
                  <span className="text-[12px] text-neutral-700">{l.kind === 'food' ? SLOT_LABEL[l.f.mealSlot] : 'Activity'}</span>
                </span>
                {on ? <Check aria-label="Added" className="h-5 w-5 text-accent-2-700" strokeWidth={3} /> : <Plus aria-hidden className="h-5 w-5 text-neutral-700" strokeWidth={2.75} />}
              </button>
            );
          })}
        </div>
      )}

      <h3 className="mt-1 px-1.5 font-body text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Memes</h3>
      {!memes.data ? (
        memes.isError ? (
          <p className="m-0 text-[13px] text-neutral-700">Memes aren’t loading right now.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={96} r={18} />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {memes.data
            .filter((m) => m.enabled && m.status === 'approved')
            .map((m) => (
              <motion.button
                key={m.id}
                type="button"
                whileTap={{ scale: 0.94 }}
                disabled={full}
                onClick={() => add({ key: `meme:${m.id}`, input: { type: 'meme', memeId: m.id }, label: `Meme · ${m.caption}`, thumbUrl: m.thumbUrl })}
                className="flex flex-col overflow-hidden rounded-[18px] border-0 bg-surface p-0 text-left"
                aria-label={`Meme: ${m.caption}`}
              >
                {m.thumbUrl ?? m.url ? <img src={m.thumbUrl ?? m.url ?? ''} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" /> : <span className="aspect-square w-full bg-neutral-200" />}
                <span className="truncate px-2 py-1 text-[11px] font-bold">{m.caption}</span>
              </motion.button>
            ))}
        </div>
      )}
    </MemberSheet>
  );
}

function Tile({ icon, label, sub, onClick, disabled }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onClick} disabled={disabled} className="flex min-h-[88px] flex-col items-start gap-1 rounded-[24px] border-0 bg-surface p-3.5 text-left disabled:opacity-50">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent-fill">{icon}</span>
      <span className="text-[14px] font-bold">{label}</span>
      <span className="text-[11px] text-neutral-700">{sub}</span>
    </motion.button>
  );
}
