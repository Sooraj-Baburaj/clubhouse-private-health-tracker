import { useMutation } from '@tanstack/react-query';
import { Check, Download, HardDriveDownload, MoreVertical, PlusSquare, Share, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { api } from '@clubhouse/client';
import type { Palette, Theme } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useMeData } from '@/features/me';
import { clearLocalCache, errorText, useUpdatePreferences } from '@/features/settings';
import { promptInstall, useInstall } from '@/infrastructure/install';
import { OfflineData } from './OfflineData';
import { Button } from '@/ui/atoms/Button';
import { Segmented } from '@/ui/atoms/Segmented';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { cn } from '@/lib/cn';

const PALETTES: { value: Exclude<Palette, 'night'>; label: string; sub: string }[] = [
  { value: 'day', label: 'Day run', sub: 'Lime and coral' },
  { value: 'organic', label: 'Organic', sub: 'Terracotta and sage' },
  { value: 'chili', label: 'Chili', sub: 'Red and teal' },
  { value: 'mango', label: 'Mango', sub: 'Saffron and indigo' },
  { value: 'plum', label: 'Plum', sub: 'Berry and leaf' },
];

export function AppSection() {
  const me = useMeData();
  const prefs = me.profile.appPrefs;
  const update = useUpdatePreferences({ quiet: true });
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useMutation({
    mutationFn: () => api.profile.requestDeletion(note.trim() || null),
    onSuccess: () => {
      toast.success('Request sent — your admin will be in touch');
      setDeleting(false);
      setConfirmDelete(false);
      setNote('');
    },
    onError: (e) => toast.error(errorText(e, 'Couldn’t send that request.')),
  });
  const install = useInstall();

  return (
    <div className="flex flex-col gap-3.5">
      <ListGroup title="Theme" footer="Dark always uses the Night palette.">
        <div className="px-3 py-3">
          <Segmented<Theme>
            label="Theme"
            value={prefs.theme}
            onChange={(theme) => update.mutate({ appPrefs: { theme } })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </ListGroup>

      <div className="flex flex-col gap-1.5">
        <h2 className="px-1.5 font-body text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Palette</h2>
        <div role="radiogroup" aria-label="Palette" className="grid grid-cols-1 gap-2">
          {PALETTES.map((p) => {
            const on = (prefs.palette === 'night' ? 'day' : prefs.palette) === p.value;
            return (
              <motion.button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={on}
                whileTap={{ scale: 0.98 }}
                onClick={() => update.mutate({ appPrefs: { palette: p.value } })}
                className={cn('flex min-h-14 items-center gap-3 rounded-[22px] border-2 bg-surface px-3.5 py-2.5 text-left', on ? 'border-accent' : 'border-transparent')}
              >
                <span data-palette={p.value} className="flex shrink-0 bg-transparent" aria-hidden>
                  <span className="h-[26px] w-[26px] rounded-full border-2 border-neutral-100 bg-bg" />
                  <span className="-ml-2 h-[26px] w-[26px] rounded-full border-2 border-neutral-100 bg-accent" />
                  <span className="-ml-2 h-[26px] w-[26px] rounded-full border-2 border-neutral-100 bg-accent-2" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-bold">{p.label}</span>
                  <span className="text-[12px] text-neutral-700">{p.sub}</span>
                </span>
                {on && <Check aria-hidden className="h-5 w-5 text-accent-700" strokeWidth={3} />}
              </motion.button>
            );
          })}
        </div>
      </div>

      <ListGroup title="Install">
        {install.installed ? (
          <ListRow title="Installed" sub="You’re using Clubhouse as an app on this device" right={<Check aria-hidden className="h-5 w-5 text-accent-2-700" strokeWidth={3} />} />
        ) : (
          <div className="flex flex-col gap-2.5 px-4 py-3.5 text-[13px]">
            <span className="text-neutral-700">Install Clubhouse for full-screen, faster opens and reminders{install.platform === 'ios' ? ' (needed on iPhone)' : ''}.</span>
            {install.canPrompt ? (
              <Button variant="dark" block icon={<HardDriveDownload aria-hidden className="h-5 w-5" strokeWidth={2.75} />} onClick={() => void promptInstall()}>
                Install Clubhouse
              </Button>
            ) : install.platform === 'ios' ? (
              <>
                <InstallStep icon={<Share className="h-4 w-4" strokeWidth={2.75} />}>In Safari, tap <b>Share</b></InstallStep>
                <InstallStep icon={<PlusSquare className="h-4 w-4" strokeWidth={2.75} />}>Choose <b>Add to Home Screen</b>, then <b>Add</b></InstallStep>
              </>
            ) : install.platform === 'mac-safari' ? (
              <InstallStep icon={<PlusSquare className="h-4 w-4" strokeWidth={2.75} />}>In Safari’s menu bar choose <b>File › Add to Dock</b></InstallStep>
            ) : install.platform === 'android' ? (
              <>
                <InstallStep icon={<MoreVertical className="h-4 w-4" strokeWidth={2.75} />}>Open the browser menu (<b>⋮</b>)</InstallStep>
                <InstallStep icon={<HardDriveDownload className="h-4 w-4" strokeWidth={2.75} />}>Tap <b>Install app</b> or <b>Add to Home screen</b></InstallStep>
              </>
            ) : (
              <>
                <InstallStep icon={<HardDriveDownload className="h-4 w-4" strokeWidth={2.75} />}>Click the <b>install icon</b> at the right of the address bar</InstallStep>
                <InstallStep icon={<MoreVertical className="h-4 w-4" strokeWidth={2.75} />}>
                  Or open the menu (<b>⋮</b>) › <b>Cast, save and share</b> › <b>Install Clubhouse</b>
                </InstallStep>
                <span className="text-neutral-700">Use Chrome or Edge; Firefox can’t install web apps on desktop.</span>
              </>
            )}
          </div>
        )}
      </ListGroup>

      <OfflineData />

      <ListGroup title="Your data">
        <div className="flex gap-2 px-4 py-3">
          {(['csv', 'json'] as const).map((f) => (
            <a key={f} href={api.profile.exportUrl(f)} download className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-divider text-[14px] font-bold text-text no-underline">
              <Download aria-hidden className="h-4 w-4" strokeWidth={2.75} />
              Export {f.toUpperCase()}
            </a>
          ))}
        </div>
        <ListRow onClick={() => setConfirmClear(true)} title="Clear local cache" sub="Frees space on this phone. Unsynced logs are kept." chevron />
        <ListRow title="Version" right={<span className="text-[13px] font-bold text-neutral-700 tabular">{me.version}</span>} />
      </ListGroup>

      <div className="flex flex-col gap-2 rounded-[28px] bg-surface p-4">
        <span className="text-[15px] font-bold">Delete my account</span>
        {deleting ? (
          <>
            <span className="text-[13px] text-neutral-700">Your admin reviews deletion requests. Everything you logged is removed once they approve it.</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} aria-label="Anything you want your admin to know (optional)" placeholder="Anything you want your admin to know (optional)" className="resize-none rounded-[22px] border border-divider bg-bg px-4 py-3 text-[15px] outline-none focus:border-accent" />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleting(false)}>
                Keep my account
              </Button>
              <Button variant="danger" className="flex-1" icon={<Trash2 className="h-4 w-4" strokeWidth={2.75} />} onClick={() => setConfirmDelete(true)}>
                Send request
              </Button>
            </div>
          </>
        ) : (
          <Button variant="danger" size="sm" className="self-start" onClick={() => setDeleting(true)}>
            Request account deletion
          </Button>
        )}
      </div>

      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear local cache?" body="Clubhouse reloads and fetches fresh data. Anything still waiting to sync stays safe." confirmLabel="Clear and reload" onConfirm={() => void clearLocalCache()} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Ask to delete your account?" body="Your admin gets the request. You can keep using Clubhouse until it’s done." confirmLabel="Send request" danger loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}

function InstallStep({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-bg text-accent-700" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
}
