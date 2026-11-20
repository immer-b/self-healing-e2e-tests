import { useState, type FormEvent } from 'react';
import { api, type Employee, type EmployeeInput } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHeader,
  SearchBox,
  SelectField,
  TextField,
  Toggle,
  useToast,
} from '../components/ui';
import { EMPLOYEE_TYPE_LABELS, ROLE_LABELS, fieldErrors, toOptions, useResource } from '../lib';
import { Link } from '../router';

const ROLE_TONE = { admin: 'accent', receiving: 'info', staff: 'neutral' } as const;
const EMPTY: EmployeeInput = { name: '', username: '', email: '', phone: '', role: 'staff', type: 'maintenance' };

export function EmployeesPage(_props: { params: Record<string, string> }) {
  const { employee: me } = useEmployee();
  const toast = useToast();
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Employee | 'new'>();
  const [archiving, setArchiving] = useState<Employee>();
  const { data: employees, error, loading, reload } = useResource(
    () => api.employees({ text, includeDeleted: showArchived }),
    [text, showArchived],
  );

  const restore = async (employee: Employee) => {
    await api.restoreEmployee(employee.id);
    toast(`${employee.name} was restored`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Accounts, roles and job types for everyone on the team."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> New employee
          </button>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox label="Search employees" placeholder="Search by name, username or email" value={text} onChange={setText} />
          <Toggle label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <span className="spacer" />
          {employees && <span className="count">{employees.length} {employees.length === 1 ? 'person' : 'people'}</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {loading && !employees ? (
          <Loading />
        ) : employees?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Job type</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className={e.deletedAt ? 'is-archived' : undefined}>
                    <td>
                      <div className="person">
                        <Avatar name={e.name} />
                        <div>
                          <div className="cell-title">{e.name}</div>
                          <div className="cell-sub">{e.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{e.username}</td>
                    <td>
                      <Badge tone={ROLE_TONE[e.role]}>{ROLE_LABELS[e.role]}</Badge>
                    </td>
                    <td>{EMPLOYEE_TYPE_LABELS[e.type]}</td>
                    <td>{e.deletedAt ? <Badge tone="danger">Archived</Badge> : <Badge tone="success">Active</Badge>}</td>
                    <td className="cell-actions">
                      <Link className="btn btn-ghost btn-sm" to={`/audit?entityType=employee&entityId=${e.id}`}>
                        History
                      </Link>
                      {e.deletedAt ? (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => restore(e)}>
                          <Icon name="restore" size={14} /> Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(e)}>
                            <Icon name="edit" size={14} /> Edit
                          </button>
                          {e.id !== me.id && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArchiving(e)}>
                              <Icon name="archive" size={14} /> Archive
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="employees" title="No employees match">
            Try a different search.
          </EmptyState>
        )}
      </Card>

      {editing && (
        <EmployeeDialog
          employee={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={(saved, created) => {
            setEditing(undefined);
            toast(created ? `${saved.name} was added` : `${saved.name} was updated`);
            reload();
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive employee?"
          message={`${archiving.name} will no longer be able to sign in, and their open care rounds will be unassigned. Their history is kept and you can restore them later.`}
          confirmLabel="Archive employee"
          onCancel={() => setArchiving(undefined)}
          onConfirm={async () => {
            await api.archiveEmployee(archiving.id);
            toast(`${archiving.name} was archived`);
            setArchiving(undefined);
            reload();
          }}
        />
      )}
    </>
  );
}

function EmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee?: Employee;
  onClose: () => void;
  onSaved: (employee: Employee, created: boolean) => void;
}) {
  const [values, setValues] = useState<EmployeeInput>(employee ? pick(employee) : EMPTY);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (field: keyof EmployeeInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = employee
        ? await api.updateEmployee(employee.id, { ...values, ...(password ? { password } : {}) })
        : await api.createEmployee({ ...values, password });
      onSaved(saved, !employee);
    } catch (e) {
      const { general: message, fields } = fieldErrors(e);
      setErrors(fields);
      setGeneral(message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={employee ? `Edit ${employee.name}` : 'New employee'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="employee-form" className="btn btn-primary" disabled={busy}>
            {employee ? 'Save changes' : 'Add employee'}
          </button>
        </>
      }
    >
      <form id="employee-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        <TextField label="Full name" value={values.name} onChange={set('name')} error={errors.name} />
        <div className="form-row">
          <TextField label="Username" value={values.username} onChange={set('username')} error={errors.username} autoComplete="off" hint="Lowercase, used to sign in" />
          <TextField
            label={employee ? 'New password' : 'Temporary password'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
            hint={employee ? 'Leave blank to keep the current password' : 'At least 8 characters'}
          />
        </div>
        <div className="form-row">
          <TextField label="Email" type="email" value={values.email} onChange={set('email')} error={errors.email} />
          <TextField label="Phone" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        </div>
        <div className="form-row">
          <SelectField label="Role" value={values.role} onChange={set('role')} error={errors.role} options={toOptions(ROLE_LABELS)} hint="Controls what they can see and do" />
          <SelectField label="Job type" value={values.type} onChange={set('type')} error={errors.type} options={toOptions(EMPLOYEE_TYPE_LABELS)} />
        </div>
      </form>
    </Modal>
  );
}

const pick = ({ name, username, email, phone, role, type }: Employee): EmployeeInput => ({ name, username, email, phone, role, type });
