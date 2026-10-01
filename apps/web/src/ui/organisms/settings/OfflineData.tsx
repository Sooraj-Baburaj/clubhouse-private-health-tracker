import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { collections, storageEstimate, useCollectionStatus } from '@/infrastructure/cache';
import type { SyncStatus } from '@/infrastructure/cache/engine';
import { fmt } from '@/features/format';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';

function ago(ts: number | null): string {
  if (!ts) return 'not yet';
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function line(s: SyncStatus, noun: string): string {
  if (s.state === 'syncing') return `Syncing… ${fmt(s.count)} ${noun}`;
  if (s.state === 'error') return `${fmt(s.count)} ${noun} · last sync failed, retrying`;
  return `${fmt(s.count)} ${noun} · synced ${ago(s.syncedAt)}`;
}

const mb = (b: number) => (b / 1_048_576 < 10 ? (b / 1_048_576).toFixed(1) : Math.round(b / 1_048_576)).toString();

/** Settings › App: what lives on this device for offline use, when it last synced, and a manual refresh. */
export function OfflineData() {
  const foods = useCollectionStatus(collections.foods);
  const chat = useCollectionStatus(collections.chat);
  const [spinning, setSpinning] = useState(false);
  const est = useQuery({ queryKey: ['storage-estimate', foods.version, chat.version], queryFn: storageEstimate, staleTime: 30_000 });
  const refresh = async () => {
    setSpinning(true);
    await Promise.all([collections.foods.revalidate('manual'), collections.chat.revalidate('manual')]).finally(() => setSpinning(false));
  };
  const icon = (s: SyncStatus) =>
    s.state === 'error' ? <AlertCircle aria-label="Sync problem" className="h-5 w-5 text-band-red-fg" strokeWidth={2.75} /> : <CheckCircle2 aria-hidden className="h-5 w-5 text-accent-700" strokeWidth={2.75} />;
  return (
    <ListGroup
      title="Offline data"
      footer={
        est.data
          ? `Using ${mb(est.data.usage)} MB on this device${est.data.persisted ? ' · kept even when storage runs low' : ''}. Food search and chat work without a connection.`
          : 'Food search and chat work without a connection.'
      }
    >
      <ListRow title="Food database" sub={line(foods, 'foods')} right={icon(foods)} />
      <ListRow title="Chat history" sub={line(chat, 'messages')} right={icon(chat)} />
      <ListRow
        onClick={() => void refresh()}
        title="Refresh now"
        sub="Checks the server for anything new"
        right={
          <motion.span animate={spinning ? { rotate: 360 } : { rotate: 0 }} transition={spinning ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }} className="grid">
            <RefreshCw aria-hidden className="h-5 w-5 text-neutral-700" strokeWidth={2.75} />
          </motion.span>
        }
      />
    </ListGroup>
  );
}
