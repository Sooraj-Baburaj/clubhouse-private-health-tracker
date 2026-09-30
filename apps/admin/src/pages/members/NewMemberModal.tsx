import { useEffect, useState } from 'react';
import { CreateMemberRequest, type AdminMemberRow, type Role } from '@clubhouse/contracts';
import { useTeamSettings } from '@/features/directory';
import { useRole } from '@/features/me';
import { useCreateMember } from '@/features/members';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { Button, Field, FormGrid, Input, Modal, PersonCell, SecretBox, Select } from '@/ui';
import { roleOptions, TimezoneSelect, zodErrors } from './shared';

/** "New member" modal (design: glass, eyebrow "Invite-only"). Shows the temp password once after creation. */
export function NewMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isSuper } = useRole();
  const team = useTeamSettings();
  const create = useCreateMember();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [tz, setTz] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ member: AdminMemberRow; tempPassword: string } | null>(null);

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setDisplayName('');
    setUsername('');
    setUsernameTouched(false);
    setEmail('');
    setRole('member');
    setTz('');
    setErrors({});
    setFormError(null);
    setCreated(null);
  }, [open]);

  const suggestUsername = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9._-]/g, '')
      .slice(0, 30) ?? '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = CreateMemberRequest.safeParse({ displayName, username, email: email.trim() || null, role, timezone: tz || null });
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error.issues, { displayName: 'Enter a display name (up to 60 characters).', email: 'Enter a valid email or leave it blank.' }));
      return;
    }
    setErrors({});
    try {
      setCreated(await create.mutateAsync(parsed.data));
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    }
  };

  if (created) {
    return (
      <Modal open={open} onClose={onClose} dismissible={false} eyebrow="Invite-only" title="Member created" label="Member created" footer={<Button onClick={onClose}>Done</Button>}>
        <PersonCell person={created.member.person} sub={`@${created.member.username}`} />
        <SecretBox secret={created.tempPassword} note="Shown once. Share it privately with them. They must change it on first login, and it expires in 7 days if unused." />
        <p className="m-0 text-[12px] text-muted">Tip: send the username and password separately. You can always reset it later from their profile.</p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Invite-only"
      title="New member"
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="new-member-form" loading={create.isPending}>
            Create member
          </Button>
        </>
      }
    >
      <form id="new-member-form" onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <Field label="Display name" required error={errors.displayName}>
          <Input
            data-autofocus
            value={displayName}
            maxLength={60}
            placeholder="Nikhil Menon"
            autoComplete="off"
            invalid={!!errors.displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!usernameTouched) setUsername(suggestUsername(e.target.value));
            }}
          />
        </Field>
        <Field label="Username" required error={errors.username} hint="3–30 characters: letters, numbers, dot, dash, underscore. Used to sign in.">
          <Input
            value={username}
            maxLength={30}
            placeholder="nikhil"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
            invalid={!!errors.username}
            onChange={(e) => {
              setUsernameTouched(true);
              setUsername(e.target.value);
            }}
          />
        </Field>
        <Field label="Email" error={errors.email} hint="Optional.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="nikhil@example.com" invalid={!!errors.email} />
        </Field>
        <FormGrid min={180}>
          <Field label="Role" error={errors.role}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roleOptions(isSuper).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Timezone" error={errors.timezone}>
            <TimezoneSelect value={tz} onChange={setTz} teamTimezone={team.data?.timezone} />
          </Field>
        </FormGrid>
        <p className="m-0 rounded-[12px] bg-bg px-3.5 py-3 text-[13px] leading-normal text-muted">A temporary password is generated for you to share. It’s shown once, must be changed on first login, and expires in 7 days.</p>
        {formError && (
          <div role="alert" className="text-[13px] font-semibold text-accent-dark">
            {formError}
          </div>
        )}
      </form>
    </Modal>
  );
}
