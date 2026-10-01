import { Copy, CornerUpLeft, Flag, Plus, Share2, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { REACTION_QUICK_SET, type ChatMessageDto } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { Button } from '@/ui/atoms/Button';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ListRow } from '@/ui/molecules/ListGroup';
import { cn } from '@/lib/cn';

export interface MessageActions {
  react: (m: ChatMessageDto, emoji: string, on: boolean) => void;
  reply: (m: ChatMessageDto) => void;
  remove: (m: ChatMessageDto) => void;
  report: (m: ChatMessageDto, reason: string) => void;
}

const row = (Icon: typeof Copy, text: string) => (
  <span className="flex items-center gap-2.5">
    <Icon aria-hidden className="h-5 w-5 text-neutral-700" strokeWidth={2.75} />
    {text}
  </span>
);

/** Long-press menu: react (quick set + any emoji), reply, copy, share, delete own, report (APP-CHAT-06/07). */
export function MessageActionsSheet({ m, onClose, actions }: { m: ChatMessageDto | null; onClose: () => void; actions: MessageActions }) {
  const [custom, setCustom] = useState(false);
  const [emoji, setEmoji] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ChatMessageDto | null>(null);
  // Fresh sheet for each message (adjust state during render when the message changes).
  const [forId, setForId] = useState(m?.id);
  if (m?.id !== forId) {
    setForId(m?.id);
    setCustom(false);
    setEmoji('');
    setReporting(false);
    setReason('');
  }

  const mine = (e: string) => !!m?.reactions.find((r) => r.emoji === e && r.mine);
  const react = (e: string) => {
    if (!m) return;
    actions.react(m, e, !mine(e));
    onClose();
  };
  const copy = async () => {
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.body);
      toast.show('Copied');
    } catch {
      toast.error('Couldn’t copy on this device');
    }
    onClose();
  };
  const share = async () => {
    if (!m) return;
    const url = `${window.location.origin}/chat?seq=${m.seq}`;
    try {
      if (navigator.share) await navigator.share({ text: m.body || 'From the Clubhouse chat', url });
      else {
        await navigator.clipboard.writeText(url);
        toast.show('Link copied');
      }
    } catch {
      /* share sheet dismissed */
    }
    onClose();
  };
  const canReport = !!m && !m.mine && m.kind === 'user';

  return (
    <>
      <MemberSheet open={!!m} onClose={onClose} label="Message actions">
        {m && (
          <>
            <div role="group" aria-label="React" className="flex items-center justify-between gap-1 rounded-full bg-surface p-1.5">
              {REACTION_QUICK_SET.map((e) => (
                <motion.button
                  key={e}
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  aria-label={`${mine(e) ? 'Remove' : 'React with'} ${e}`}
                  aria-pressed={mine(e)}
                  onClick={() => react(e)}
                  className={cn('grid h-11 w-11 place-items-center rounded-full border-0 text-[22px]', mine(e) ? 'bg-accent-200' : 'bg-transparent')}
                >
                  {e}
                </motion.button>
              ))}
              <motion.button type="button" whileTap={{ scale: 0.85 }} aria-label="Any emoji" aria-expanded={custom} onClick={() => setCustom((c) => !c)} className="grid h-11 w-11 place-items-center rounded-full border-0 bg-bg">
                <Plus className="h-5 w-5" strokeWidth={2.75} />
              </motion.button>
            </div>
            <AnimatePresence initial={false}>
              {custom && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex gap-2 overflow-hidden"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = emoji.trim();
                    if (v) react(v);
                  }}
                >
                  <input
                    autoFocus
                    value={emoji}
                    maxLength={16}
                    onChange={(e) => setEmoji(e.target.value)}
                    aria-label="Type or pick any emoji"
                    placeholder="Any emoji 🙌"
                    className="min-h-12 min-w-0 flex-1 rounded-full border border-divider bg-surface px-4 text-[18px] outline-none focus:border-accent"
                  />
                  <Button type="submit" disabled={!emoji.trim()}>
                    React
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
            {reporting ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reason.trim().length >= 3) {
                    actions.report(m, reason.trim());
                    onClose();
                  }
                }}
              >
                <label className="flex flex-col gap-1.5 text-[13px] text-neutral-700">
                  What’s wrong with this message?
                  <textarea
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    rows={3}
                    className="resize-none rounded-[22px] border border-divider bg-surface px-4 py-3 text-[15px] text-text outline-none focus:border-accent"
                    placeholder="A few words for the admins"
                  />
                </label>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setReporting(false)}>
                    Back
                  </Button>
                  <Button type="submit" variant="danger" className="flex-1" disabled={reason.trim().length < 3}>
                    Send report
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col rounded-[28px] bg-surface py-1">
                {m.kind === 'user' && (
                  <ListRow
                    onClick={() => {
                      actions.reply(m);
                      onClose();
                    }}
                    title={row(CornerUpLeft, 'Reply')}
                  />
                )}
                {m.body && <ListRow onClick={() => void copy()} title={row(Copy, 'Copy text')} />}
                <ListRow onClick={() => void share()} title={row(Share2, 'Share')} />
                {m.mine && m.kind === 'user' && (
                  <ListRow
                    onClick={() => {
                      setConfirmDelete(m);
                      onClose();
                    }}
                    title={row(Trash2, 'Delete')}
                  />
                )}
                {canReport && <ListRow onClick={() => setReporting(true)} title={row(Flag, 'Report')} sub="Only admins see reports" />}
              </div>
            )}
          </>
        )}
      </MemberSheet>
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this message?"
        body="It disappears for everyone in the chat."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDelete) actions.remove(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </>
  );
}
