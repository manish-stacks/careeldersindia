'use client';
import { ListPager, SearchBar, useClientList } from '@/components/ui/list-controls';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { dateTime } from '@/lib/utils';
import { Avatar, Empty, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui/misc';
import { Badge } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';

type Module = { key: string; label: string; actions: ('view' | 'manage')[] };
type Role = { _id: string; name: string; description?: string; permissions: string[]; memberCount: number };
type Staff = { _id: string; name: string; email: string; mobile?: string; status: 'ACTIVE' | 'SUSPENDED'; lastLoginAt?: string; roleId: string | null; roleName: string; isSuper: boolean };

export default function TeamPage() {
  const { can, user } = useAuth();
  const manage = can('staff.manage');
  const [tab, setTab] = useState<'staff' | 'roles'>('staff');
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => get<Staff[]>('/admin/staff') });
  const staffList = useClientList(staff.data, (m) => `${m.name} ${m.email} ${m.mobile || ''}`, 15);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/admin/roles') });
  const catalogue = useQuery({ queryKey: ['permissions'], queryFn: () => get<{ modules: Module[] }>('/admin/permissions') });
  const [editStaff, setEditStaff] = useState<Staff | 'new' | null>(null);
  const [editRole, setEditRole] = useState<Role | 'new' | null>(null);

  const removeRole = useAction((id: string) => del(`/admin/roles/${id}`), { success: 'Role deleted', invalidate: [['roles']] });
  const toggle = useAction((s: Staff) => patch(`/admin/staff/${s._id}`, { status: s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }), { success: 'Updated', invalidate: [['staff']] });

  return (
    <>
      <PageHeader
        title="Team & roles"
        subtitle="Create admin users and decide exactly what each role can see and do."
        actions={
          manage &&
          (tab === 'staff' ? (
            <Button onClick={() => setEditStaff('new')}><UserPlus className="h-4 w-4" />Add team member</Button>
          ) : (
            <Button onClick={() => setEditRole('new')}><Plus className="h-4 w-4" />New role</Button>
          ))
        }
      />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'staff', label: 'Team members', count: staff.data?.length }, { value: 'roles', label: 'Roles & permissions', count: roles.data?.length }]} />

      <div className="mt-5">
        {(staff.isError || roles.isError) && <ErrorState error={staff.error || roles.error} />}

        {tab === 'staff' && (
          <div className="panel overflow-hidden">
            <div className="border-b border-line p-4"><SearchBar value={staffList.q} onChange={staffList.setQ} placeholder="Search team by name, email or mobile" /></div>
            {staff.isLoading ? <Skeleton className="m-5 h-40" /> : !staff.data?.length ? <Empty title="No team members yet" /> : (
              <ul>
                {staffList.rows.map((s) => (
                  <li key={s._id} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
                    <Avatar name={s.name} tone={s.isSuper ? 'brand' : 'neutral'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name} {s._id === user?._id && <span className="text-sm font-normal text-ink-muted">(you)</span>}</p>
                      <p className="truncate text-sm text-ink-muted">{s.email}{s.mobile ? ` · ${s.mobile}` : ''}</p>
                    </div>
                    <Badge tone={s.isSuper ? 'brand' : 'info'}>{s.roleName}</Badge>
                    <Badge tone={s.status === 'ACTIVE' ? 'ok' : 'danger'} dot>{s.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>
                    <span className="hidden w-40 text-sm text-ink-muted xl:block">{s.lastLoginAt ? `Last seen ${dateTime(s.lastLoginAt)}` : 'Never signed in'}</span>
                    {manage && s._id !== user?._id && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditStaff(s)}><Pencil className="h-4 w-4" />Edit</Button>
                        <Button variant={s.status === 'ACTIVE' ? 'danger' : 'secondary'} size="sm" loading={toggle.isPending} onClick={() => toggle.mutate(s)}>{s.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ListPager meta={staffList.meta} onPage={staffList.setPage} />
          </div>
        )}

        {tab === 'roles' && (
          <div className="grid gap-4 lg:grid-cols-2">
            {roles.isLoading && <Skeleton className="h-40" />}
            {roles.data && !roles.data.length && <div className="panel lg:col-span-2"><Empty icon={<ShieldCheck className="h-6 w-6" />} title="No roles yet" body="Create a role such as “Support” or “Finance”, tick what it may do, then assign it to team members." /></div>}
            {roles.data?.map((r) => (
              <article key={r._id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{r.name}</h2>
                    {r.description && <p className="text-sm text-ink-muted">{r.description}</p>}
                  </div>
                  <Badge>{r.memberCount} member{r.memberCount === 1 ? '' : 's'}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {catalogue.data?.modules.filter((m) => r.permissions.some((p) => p.startsWith(`${m.key}.`))).map((m) => (
                    <Badge key={m.key} tone={r.permissions.includes(`${m.key}.manage`) ? 'brand' : 'neutral'}>{m.label}{r.permissions.includes(`${m.key}.manage`) ? '' : ' (view)'}</Badge>
                  ))}
                  {!r.permissions.length && <span className="text-sm text-ink-muted">No access</span>}
                </div>
                {manage && (
                  <div className="mt-4 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditRole(r)}><Pencil className="h-4 w-4" />Edit</Button>
                    <Button variant="danger" size="sm" loading={removeRole.isPending} onClick={() => confirm(`Delete role “${r.name}”?`) && removeRole.mutate(r._id)}><Trash2 className="h-4 w-4" />Delete</Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {editStaff && <StaffDialog target={editStaff} roles={roles.data || []} canSuper={!!user?.isSuper} onClose={() => setEditStaff(null)} />}
      {editRole && catalogue.data && <RoleDialog target={editRole} modules={catalogue.data.modules} mine={user?.isSuper ? null : user?.permissions || []} onClose={() => setEditRole(null)} />}
    </>
  );
}

function StaffDialog({ target, roles, canSuper, onClose }: { target: Staff | 'new'; roles: Role[]; canSuper: boolean; onClose: () => void }) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name);
  const [email, setEmail] = useState(isNew ? '' : target.email);
  const [mobile, setMobile] = useState(isNew ? '' : target.mobile || '');
  const [roleId, setRoleId] = useState<string>(isNew ? roles[0]?._id || '' : target.roleId || '');
  const [password, setPassword] = useState('');
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { name, roleId: roleId || null };
      if (mobile) body.mobile = mobile.startsWith('+') ? mobile : `+91${mobile}`;
      if (password) body.password = password;
      return isNew ? post('/admin/staff', { ...body, email }) : patch(`/admin/staff/${target._id}`, body);
    },
    { success: isNew ? 'Team member added' : 'Saved', invalidate: [['staff'], ['roles']], onDone: onClose }
  );
  const pwOk = !password || (password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password));
  const valid = name.trim().length >= 2 && (!isNew || (email.includes('@') && password)) && pwOk && (canSuper || roleId);
  return (
    <Dialog open onClose={onClose} title={isNew ? 'Add team member' : `Edit ${target.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>{isNew ? 'Create' : 'Save'}</Button></>}>
      <div className="space-y-4">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" hint={isNew ? 'Used to sign in.' : 'Email cannot be changed.'}><Input type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mobile (optional)"><Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+919812345678" /></Field>
        <Field label="Role" hint="Decides which pages and actions this person gets.">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {canSuper && <option value="">Super admin — full access</option>}
            {roles.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label={isNew ? 'Password' : 'New password (leave blank to keep)'} error={password && !pwOk ? '8+ characters with a letter and a number' : undefined} hint={isNew ? '8+ characters, a letter and a number. Share it securely.' : 'Setting one signs them out everywhere.'}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {!isNew && <p className="flex items-center gap-2 text-sm text-ink-muted"><KeyRound className="h-4 w-4" />Role changes apply on their next request.</p>}
      </div>
    </Dialog>
  );
}

function RoleDialog({ target, modules, mine, onClose }: { target: Role | 'new'; modules: Module[]; mine: string[] | null; onClose: () => void }) {
  const isNew = target === 'new';
  const [name, setName] = useState(isNew ? '' : target.name);
  const [description, setDescription] = useState(isNew ? '' : target.description || '');
  const [perms, setPerms] = useState<Set<string>>(new Set(isNew ? [] : target.permissions));
  const allowed = (p: string) => mine === null || mine.includes(p); // can only grant what you hold
  const flip = (p: string, on: boolean) =>
    setPerms((prev) => {
      const n = new Set(prev);
      const [mod, act] = p.split('.');
      if (on) { n.add(p); if (act === 'manage') n.add(`${mod}.view`); } else { n.delete(p); if (act === 'view') n.delete(`${mod}.manage`); }
      return n;
    });
  const all = useMemo(() => modules.flatMap((m) => m.actions.map((a) => `${m.key}.${a}`)).filter(allowed), [modules]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(
    () => {
      const body = { name, description, permissions: [...perms] };
      return isNew ? post('/admin/roles', body) : patch(`/admin/roles/${target._id}`, body);
    },
    { success: 'Role saved', invalidate: [['roles'], ['staff']], onDone: onClose }
  );
  return (
    <Dialog wide open onClose={onClose} title={isNew ? 'New role' : `Edit role — ${target.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate(undefined)}>Save role</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support desk" /></Field>
        <Field label="Description (optional)"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-sm font-semibold">Permissions</p>
        <div className="flex gap-3 text-sm">
          <button className="link" onClick={() => setPerms(new Set(all))}>Select all</button>
          <button className="link" onClick={() => setPerms(new Set())}>Clear</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[1fr_88px_88px] bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><span>Area</span><span>View</span><span>Manage</span></div>
        {modules.map((m) => (
          <div key={m.key} className="grid grid-cols-[1fr_88px_88px] items-center border-t border-line px-4 py-2">
            <span className="text-[15px]">{m.label}</span>
            {(['view', 'manage'] as const).map((a) => {
              const p = `${m.key}.${a}`;
              return m.actions.includes(a) ? (
                <input key={a} type="checkbox" aria-label={`${m.label} ${a}`} className="h-4 w-4 accent-[#C8352E]" disabled={!allowed(p)} checked={perms.has(p)} onChange={(e) => flip(p, e.target.checked)} />
              ) : <span key={a} className="text-ink-faint">–</span>;
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-muted">“Manage” lets them change data (assign, refund, edit…) and always includes “View”.</p>
    </Dialog>
  );
}
