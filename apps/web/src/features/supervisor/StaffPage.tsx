// Staff (Figma 39:27640): desk officers and supervisors who can use the desk. Add someone by their
// university email (they get the role on their first single sign-on), or remove their access.
import type { AddStaff, StaffMember } from '@lf/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Modal,
  Notice,
  SelectField,
  TextField,
  useToast,
} from '@lf/ui';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAddStaff, useRemoveStaff, useStaff } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

const ROLE_LABEL: Record<StaffMember['role'], string> = {
  desk_officer: 'Desk officer',
  supervisor: 'Supervisor',
};

export function StaffPage() {
  const staff = useStaff();
  const add = useAddStaff();
  const remove = useRemoveStaff();
  const toast = useToast();
  const [form, setForm] = useState<AddStaff>({ name: '', email: '', role: 'desk_officer' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function addStaff() {
    setErrors({});
    try {
      await add.mutateAsync(form);
      toast({ title: `${form.name} can use the desk once they sign in with single sign-on.` });
      setForm({ name: '', email: '', role: 'desk_officer' });
    } catch (e) {
      setErrors(e instanceof ApiError ? e.fields : {});
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError(null);
    try {
      await remove.mutateAsync(removing.email);
      toast({ title: `${removing.name} no longer has desk access.` });
      setRemoving(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Saving failed; try again.');
    }
  }

  return (
    <div className="max-w-[820px]">
      <PageHeader title="Staff" />
      <p className="mt-2 text-body text-muted">
        Desk officers and supervisors who can use the desk. Staff sign in with university single
        sign-on.
      </p>
      <Card className="mt-6 !p-5">
        <h2 className="flex items-center gap-2 pb-3 text-heading-s font-bold text-ink">
          <UserPlus size={22} aria-hidden="true" className="text-primary" /> Add staff
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors['name']}
          />
          <TextField
            label="University email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors['email']}
          />
          <SelectField
            label="Role"
            value={form.role}
            onChange={(e) =>
              setForm({
                ...form,
                role: e.target.value === 'supervisor' ? 'supervisor' : 'desk_officer',
              })
            }
            options={[
              { value: 'desk_officer', label: 'Desk officer' },
              { value: 'supervisor', label: 'Supervisor' },
            ]}
          />
          <div className="flex items-end">
            <Button icon={UserPlus} loading={add.isPending} onClick={() => void addStaff()}>
              Add staff
            </Button>
          </div>
        </div>
      </Card>
      {staff.isError ? (
        <Notice tone="danger" className="mt-4">
          {staff.error.message}
        </Notice>
      ) : null}
      <ul className="mt-6 flex flex-col gap-3">
        {staff.data?.staff.map((s) => (
          <li
            key={s.email}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <Avatar name={s.name} size="m" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">
                {s.name}
                {s.you ? <span className="font-normal text-muted"> (you)</span> : null}
              </p>
              <p className="truncate text-body text-muted">
                {ROLE_LABEL[s.role]} · {s.email}
              </p>
            </div>
            <Badge tone={s.status === 'active' ? 'success' : 'info'}>
              {s.status === 'active' ? 'Active' : 'Invited'}
            </Badge>
            {s.you ? null : (
              <Button variant="secondary" onClick={() => setRemoving(s)}>
                {s.status === 'active' ? 'Deactivate' : 'Cancel invite'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `Remove ${removing.name}'s desk access?` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep access
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => void confirmRemove()}
            >
              Remove access
            </Button>
          </>
        }
      >
        <p className="text-body text-muted">
          They can still sign in as a university member, but they can't use the desk any more.
        </p>
        {removeError ? (
          <Notice tone="danger" className="mt-3">
            {removeError}
          </Notice>
        ) : null}
      </Modal>
    </div>
  );
}
