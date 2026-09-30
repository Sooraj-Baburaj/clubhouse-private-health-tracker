import { useNavigate, useSearch } from '@tanstack/react-router';
import { Eraser } from 'lucide-react';
import { useState } from 'react';
import type { PersonRef } from '@clubhouse/contracts';
import { useMutes, useReports } from '@/features/chat';
import { Button, PageHeader, TabPanel, Tabs } from '@/ui';
import { AnnouncementsPanel } from './AnnouncementsPanel';
import { ClearChatModal } from './ClearChatModal';
import { MessagesPanel } from './MessagesPanel';
import { KeywordsPanel, MutesPanel, ReportsPanel } from './ModerationPanels';
import { MuteModal } from './MuteModal';

type Tab = 'messages' | 'announcements' | 'reports' | 'keywords' | 'mutes';
const TABS: Tab[] = ['messages', 'announcements', 'reports', 'keywords', 'mutes'];

/** Chat moderation: search + pin/delete/mute, announcements, clear by period, reports queue, keywords and mutes. */
export function ChatModerationPage() {
  const search = useSearch({ from: '/shell/chat' });
  const navigate = useNavigate({ from: '/chat' });
  const tab: Tab = TABS.includes(search.tab as Tab) ? (search.tab as Tab) : 'messages';
  const reports = useReports();
  const mutes = useMutes();
  const [clearOpen, setClearOpen] = useState(false);
  const [mute, setMute] = useState<{ open: boolean; person: PersonRef | null }>({
    open: false,
    person: null,
  });

  const openReports =
    reports.data?.filter((r) => r.status === 'open' || r.status === 'pending').length ?? 0;
  const setTab = (t: Tab) =>
    void navigate({
      search: (s) => ({ ...s, tab: t === 'messages' ? undefined : t }),
      replace: true,
    });
  const openMute = (person: PersonRef | null) => setMute({ open: true, person });

  return (
    <>
      <PageHeader
        eyebrow={`Team chat${openReports ? ` · ${openReports} open ${openReports === 1 ? 'report' : 'reports'}` : ''}`}
        title="Chat moderation"
        actions={
          <Button
            variant="danger"
            icon={<Eraser className="h-4 w-4" />}
            onClick={() => setClearOpen(true)}
          >
            Clear by time period
          </Button>
        }
      />
      <Tabs
        label="Chat moderation sections"
        value={tab}
        onChange={setTab}
        className="self-start"
        tabs={[
          { value: 'messages', label: 'Messages' },
          { value: 'announcements', label: 'Announcements' },
          { value: 'reports', label: 'Reports', count: openReports },
          { value: 'keywords', label: 'Keywords' },
          { value: 'mutes', label: 'Mutes', count: mutes.data?.length ?? null },
        ]}
      />
      {tab === 'messages' && (
        <TabPanel k="messages">
          <MessagesPanel onMute={openMute} />
        </TabPanel>
      )}
      {tab === 'announcements' && (
        <TabPanel k="announcements">
          <AnnouncementsPanel />
        </TabPanel>
      )}
      {tab === 'reports' && (
        <TabPanel k="reports">
          <ReportsPanel />
        </TabPanel>
      )}
      {tab === 'keywords' && (
        <TabPanel k="keywords">
          <KeywordsPanel />
        </TabPanel>
      )}
      {tab === 'mutes' && (
        <TabPanel k="mutes">
          <MutesPanel onMute={() => openMute(null)} />
        </TabPanel>
      )}
      <ClearChatModal open={clearOpen} onClose={() => setClearOpen(false)} />
      <MuteModal
        open={mute.open}
        person={mute.person}
        onClose={() => setMute((m) => ({ ...m, open: false }))}
      />
    </>
  );
}
