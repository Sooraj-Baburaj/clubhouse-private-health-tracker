import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMemes, useTriggers } from '@/features/memes';
import { Button, PageHeader, TabPanel, Tabs } from '@/ui';
import { DryRunPanel } from './DryRunPanel';
import { MemeLibrary } from './MemeLibrary';
import { UploadMemeModal } from './MemeModals';
import { tagOptions } from './shared';
import { TriggerBuilder } from './TriggerBuilder';
import { TriggersTab } from './TriggersTab';

const TAB_KEYS = ['library', 'triggers', 'dry-run'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** Memes & triggers (ADM-MEME): library, trigger table + builder drawer, dry run. URL: ?tab=…&trigger=<id|new>. */
export function MemesPage() {
  const search = useSearch({ from: '/shell/memes' });
  const navigate = useNavigate({ from: '/memes' });
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(search.tab ?? '') ? (search.tab as TabKey) : 'library';

  const memesQ = useMemes();
  const triggersQ = useTriggers();
  const [uploadOpen, setUploadOpen] = useState(false);

  // Keep the last trigger id while the drawer animates closed.
  const [lastTrigger, setLastTrigger] = useState(search.trigger);
  useEffect(() => {
    if (search.trigger) setLastTrigger(search.trigger);
  }, [search.trigger]);

  const setTab = (v: TabKey) => void navigate({ search: (s) => ({ ...s, tab: v === 'library' ? undefined : v }) });
  const openTrigger = (id: string, replace = false) => void navigate({ search: (s) => ({ ...s, trigger: id }), replace });
  const closeTrigger = () => void navigate({ search: (s) => ({ ...s, trigger: undefined }) });
  const newTrigger = () => void navigate({ search: (s) => ({ ...s, tab: s.tab === 'dry-run' ? s.tab : 'triggers', trigger: 'new' }) });

  const tagSuggestions = useMemo(() => tagOptions((memesQ.data ?? []).flatMap((m) => m.tags)), [memesQ.data]);
  const pendingCount = (memesQ.data ?? []).filter((m) => m.status === 'pending').length;

  return (
    <>
      <PageHeader
        eyebrow="Roasts go only to members who opted in"
        title="Memes & triggers"
        actions={
          <>
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
              Upload meme
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={newTrigger}>
              New trigger
            </Button>
          </>
        }
      />

      <Tabs<TabKey>
        label="Memes and triggers sections"
        value={tab}
        onChange={setTab}
        className="self-start"
        tabs={[
          { value: 'library', label: pendingCount ? `Library · ${pendingCount} to review` : 'Library', count: memesQ.data?.length ?? null },
          { value: 'triggers', label: 'Triggers', count: triggersQ.data?.length ?? null },
          { value: 'dry-run', label: 'Dry run' },
        ]}
      />

      <TabPanel k={tab}>
        {tab === 'library' && <MemeLibrary triggers={triggersQ.data} onUpload={() => setUploadOpen(true)} />}
        {tab === 'triggers' && <TriggersTab onOpen={(id) => openTrigger(id)} onNew={newTrigger} />}
        {tab === 'dry-run' && <DryRunPanel onOpenTrigger={(id) => openTrigger(id)} />}
      </TabPanel>

      <TriggerBuilder id={search.trigger ?? lastTrigger} open={!!search.trigger} onClose={closeTrigger} onOpenId={(id) => openTrigger(id, true)} />
      <UploadMemeModal open={uploadOpen} onClose={() => setUploadOpen(false)} tagSuggestions={tagSuggestions} />
    </>
  );
}
