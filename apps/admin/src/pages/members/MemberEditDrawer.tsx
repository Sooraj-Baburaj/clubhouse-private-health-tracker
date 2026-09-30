import { Link } from '@tanstack/react-router';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { RoleChangeRequest, UpdateMemberRequest, type AdminMemberRow, type Role } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useTeamSettings } from '@/features/directory';
import { useRole } from '@/features/me';
import { useChangeRole, useMember, useUpdateMember } from '@/features/members';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { fmtDateTime } from '@/lib/format';
import { Button, DrawerPanel, Field, Input, Inset, Select, SecretBox, StatusPill, Textarea } from '@/ui';
import { useMemberActions } from './useMemberActions';
import { ROLE_LABEL, roleOptions, tempPasswordText, TimezoneSelect, zodErrors } from './shared';

/**
 * Quick-edit drawer (design "Edit member"). Only changed fields are sent.
 * Keep `member` set while `open` goes false so the drawer can animate out.
 */
export function MemberEditDrawer({ member, open, onClose, hideProfileLink }: { member: AdminMemberRow | null; open: boolean; onClose: () => void; hideProfileLink?: boolean }) {
  if (!member) return null;
  return <EditBody key={member.id} member={member} open={open} onClose={onClose} hideProfileLink={hideProfileLink} />;
}

function EditBody({ member, open, onClose, hideProfileLink }: { member: AdminMemberRow; open: boolean; onClose: () => void; hideProfileLink?: boolean }) {
  const formId = useId();
  const { isSuper, userId } = useRole();
  const team = useTeamSettings();
  const detail = useMember(member.id);
  const update = useUpdateMember();
  const changeRole = useChangeRole();
  const actions = useMemberActions();

  const [displayName, setDisplayName] = useState(member.person.name);
  const [username, setUsername] = useState(member.username);
  const [email, setEmail] = useState(member.email ?? '');
  const [role, setRole] = useState<Role>(member.role);
  const [roleReason, setRoleReason] = useState('');
  const [tz, setTz] = useState<string | null>(null); // null = untouched
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  // Reflect the loaded member timezone once (the row DTO doesn't carry it).
  const loadedTz = detail.data?.timezone ?? null;
  const teamTz = team.data?.timezone ?? null;
  const tzValue = tz ?? (loadedTz && loadedTz !== teamTz ? loadedTz : '');

  const isSelf = member.id === userId;
  const canChangeRole = isSuper && !isSelf;
  const roleChanged = role !== member.role;
  const busy = update.isPending || changeRole.isPending;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const body: Record<string, string | null> = {};
    if (displayName.trim() !== member.person.name) body.displayName = displayName;
    if (username.trim().toLowerCase() !== member.username) body.username = username;
    if ((email.trim() || null) !== member.email) body.email = email.trim() || null;
    if (tz !== null) body.timezone = tz || null;
    const parsed = UpdateMemberRequest.safeParse(body);
    const errs: Record<string, string> = parsed.success ? {} : zodErrors(parsed.error.issues, { displayName: 'Enter a display name (up to 60 characters).', email: 'Enter a valid email or leave it blank.' });
    if (roleChanged) {
      const r = RoleChangeRequest.safeParse({ role, reason: roleReason });
      if (!r.success) errs.roleReason = 'Say why the role is changing (at least 3 characters).';
    }
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    if (!Object.keys(parsed.data).length && !roleChanged) {
      toast.success('Nothing to save');
      return;
    }
    try {
      if (Object.keys(parsed.data).length) await update.mutateAsync({ id: member.id, body: parsed.data });
      if (roleChanged) await changeRole.mutateAsync({ id: member.id, body: { role, reason: roleReason.trim() } });
      toast.success(`${displayName.trim() || member.person.name} saved`);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    }
  };

  const tempInfo = tempPasswordText(member.tempPasswordExpiresAt);

  const footer = (
    <>
      {member.status === 'deactivated' ? (
        <Button variant="secondary" onClick={() => void actions.reactivate(member)}>
          Reactivate
        </Button>
      ) : (
        <Button variant="danger" disabled={isSelf} title={isSelf ? 'You can’t deactivate yourself' : undefined} onClick={() => void actions.deactivate(member).then((ok) => ok && onClose())}>
          Deactivate
        </Button>
      )}
      <Button type="submit" form={formId} loading={busy}>
        Save
      </Button>
    </>
  );

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      eyebrow="Edit member"
      title={member.person.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px]">@{member.username}</span> <StatusPill status={member.status} />
        </span>
      }
      label={`Edit ${member.person.name}`}
      footer={footer}
    >
      <form id={formId} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Display name" error={errors.displayName}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} autoComplete="off" invalid={!!errors.displayName} />
        </Field>
        <Field label="Username" error={errors.username} hint="3–30 characters: letters, numbers, dot, dash, underscore.">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} autoComplete="off" spellCheck={false} className="font-mono text-[13px]" invalid={!!errors.username} />
        </Field>
        <Field label="Email" error={errors.email} hint="Optional. Only used for account recovery.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" invalid={!!errors.email} />
        </Field>
        <Field label="Role" hint={isSelf ? 'You can’t change your own role.' : !isSuper ? 'Only a Super Admin can change roles.' : 'Only a Super Admin can change roles. Nobody can change their own.'}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!canChangeRole}>
            {roleOptions(isSuper, member.role).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {roleChanged && (
          <Field label={`Reason for making them ${ROLE_LABEL[role]}`} required error={errors.roleReason} hint="Recorded in the audit log.">
            <Textarea rows={2} maxLength={300} value={roleReason} onChange={(e) => setRoleReason(e.target.value)} placeholder="Why is the role changing?" />
          </Field>
        )}
        <Field label="Timezone" error={errors.timezone} hint={detail.isPending ? 'Loading current timezone…' : 'Reminders and day boundaries follow this.'}>
          <TimezoneSelect value={tzValue} onChange={(v) => setTz(v)} teamTimezone={teamTz} disabled={detail.isPending} />
        </Field>
        {formError && (
          <div role="alert" className="rounded-[12px] bg-accent-tint/60 px-3 py-2 text-[13px] font-semibold text-accent-dark">
            {formError}
          </div>
        )}
      </form>

      {temp ? (
        <SecretBox secret={temp} title="New temporary password" note="Shown once. Share it privately. They must change it on first sign-in; it expires in 7 days if unused." />
      ) : (
        <Inset>
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            <KeyRound aria-hidden className="h-4 w-4 text-muted" /> Password
          </span>
          {tempInfo ? (
            <span className={tempInfo.expired ? 'text-[12px] font-semibold text-accent-dark' : 'text-[12px] text-muted'} title={member.tempPasswordExpiresAt ? fmtDateTime(member.tempPasswordExpiresAt) : undefined}>
              {tempInfo.text}. They haven’t set their own password yet.
            </span>
          ) : (
            <span className="text-[12px] text-muted">They use their own password. Resetting gives them a temporary one.</span>
          )}
          <Button variant="outline" size="sm" className="self-start" onClick={() => void actions.resetPassword(member).then((p) => p && setTemp(p))}>
            Reset password
          </Button>
        </Inset>
      )}

      {!hideProfileLink && (
        <Link to="/members/$id" params={{ id: member.id }} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold">
          Open full profile <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </DrawerPanel>
  );
}
