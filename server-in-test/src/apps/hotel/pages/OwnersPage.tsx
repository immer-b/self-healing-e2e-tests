import { useState, type FormEvent } from 'react';
import { api, type Contact, type Owner, type OwnerInput } from '../api';
import { Icon } from '../components/Icon';
import {
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
import { fieldErrors, useResource } from '../lib';

const PHONE_TYPES = ['Mobile', 'Home', 'Work', 'Clinic', 'Other'].map((v) => ({ value: v, label: v }));
const emptyContact = (): Contact => ({ name: '', relationship: '', phones: [{ label: 'Mobile', number: '' }] });
const EMPTY_OWNER: OwnerInput = {
  name: '',
  email: '',
  address: { line1: '', line2: '', city: '', state: '', postalCode: '' },
  contacts: [emptyContact()],
};

export function OwnersPage(_props: { params: Record<string, string> }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Owner | 'new'>();
  const [archiving, setArchiving] = useState<Owner>();
  const { data: owners, error, loading, reload } = useResource(() => api.owners({ text, includeDeleted: showArchived }), [text, showArchived]);

  return (
    <>
      <PageHeader
        title="Owners"
        subtitle="Pet owners and the people we can call about their pets."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> New owner
          </button>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox label="Search owners" placeholder="Search by name, email, contact or phone" value={text} onChange={setText} />
          <Toggle label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <span className="spacer" />
          {owners && <span className="count">{owners.length} owners</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {loading && !owners ? (
          <Loading />
        ) : owners?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Address</th>
                  <th>Main contact</th>
                  <th>Pets</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => {
                  const main = owner.contacts[0];
                  return (
                    <tr key={owner.id} className={owner.deletedAt ? 'is-archived' : undefined}>
                      <td>
                        <div className="cell-title">{owner.name}</div>
                        <div className="cell-sub">{owner.email || 'No email'}</div>
                      </td>
                      <td>
                        <div>{owner.address.line1}</div>
                        <div className="cell-sub">
                          {owner.address.city}, {owner.address.state}
                        </div>
                      </td>
                      <td>
                        <div>
                          {main?.name} <span className="cell-sub">· {main?.relationship}</span>
                        </div>
                        <div className="cell-sub">{main?.phones[0]?.number}</div>
                        {owner.contacts.length > 1 && <div className="cell-sub">+{owner.contacts.length - 1} more contacts</div>}
                      </td>
                      <td className="nowrap">
                        {owner.petCount ?? 0} {owner.petCount === 1 ? 'pet' : 'pets'}
                      </td>
                      <td className="cell-actions">
                        {owner.deletedAt ? (
                          <>
                            <Badge tone="danger">Archived</Badge>{' '}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={async () => {
                                await api.restoreOwner(owner.id);
                                toast(`${owner.name} was restored`);
                                reload();
                              }}
                            >
                              <Icon name="restore" size={14} /> Restore
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(owner)}>
                              <Icon name="edit" size={14} /> Edit
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArchiving(owner)}>
                              <Icon name="archive" size={14} /> Archive
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="owners" title="No owners match" />
        )}
      </Card>
      {editing && (
        <OwnerDialog
          owner={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={(owner, created) => {
            setEditing(undefined);
            toast(created ? `${owner.name} was added` : `${owner.name} was updated`);
            reload();
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive owner?"
          message={`${archiving.name} will be hidden from lists. Their history is kept and they can be restored.`}
          confirmLabel="Archive owner"
          onCancel={() => setArchiving(undefined)}
          onConfirm={async () => {
            await api.archiveOwner(archiving.id);
            toast(`${archiving.name} was archived`);
            setArchiving(undefined);
            reload();
          }}
        />
      )}
    </>
  );
}

export function OwnerDialog({ owner, onClose, onSaved }: { owner?: Owner; onClose: () => void; onSaved: (owner: Owner, created: boolean) => void }) {
  const [values, setValues] = useState<OwnerInput>(
    owner ? structuredClone({ name: owner.name, email: owner.email, address: owner.address, contacts: owner.contacts }) : structuredClone(EMPTY_OWNER),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<Owner[]>();

  const setAddress = (field: keyof OwnerInput['address']) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, address: { ...v.address, [field]: e.target.value } }));
  const updateContact = (index: number, change: (contact: Contact) => Contact) =>
    setValues((v) => ({ ...v, contacts: v.contacts.map((c, i) => (i === index ? change(c) : c)) }));

  const submit = async (event: FormEvent, { confirmed = false } = {}) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!owner && !confirmed) {
        const matches = await api.duplicateOwners({
          name: values.name,
          email: values.email,
          phones: values.contacts.flatMap((c) => c.phones.map((p) => p.number)),
        });
        if (matches.length) {
          setDuplicates(matches);
          setBusy(false);
          return;
        }
      }
      const saved = owner ? await api.updateOwner(owner.id, values) : await api.createOwner(values);
      onSaved(saved, !owner);
    } catch (e) {
      const { general: message, fields } = fieldErrors(e);
      setErrors(fields);
      setGeneral(message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={owner ? `Edit ${owner.name}` : 'New owner'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="owner-form" className="btn btn-primary" disabled={busy}>
            Save owner
          </button>
        </>
      }
    >
      <form id="owner-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        {errors.contacts && <ErrorBanner>{errors.contacts}</ErrorBanner>}
        {duplicates && (
          <div className="banner banner-warning" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Possible duplicate.</strong> We already have{' '}
              {duplicates.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  {d.name} ({d.contacts[0]?.phones[0]?.number ?? d.email})
                </span>
              ))}
              . If this is a returning customer, cancel and edit their record instead.
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => submit(e, { confirmed: true })} disabled={busy}>
                  Save anyway
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="form-row">
          <TextField label="Owner name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} />
          <TextField label="Email" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} error={errors.email} />
        </div>

        <p className="form-section-title">Address</p>
        <div className="form-row">
          <TextField label="Street address" value={values.address.line1} onChange={setAddress('line1')} error={errors['address.line1']} />
          <TextField label="Apt, suite (optional)" value={values.address.line2} onChange={setAddress('line2')} />
        </div>
        <div className="form-row-3">
          <TextField label="City" value={values.address.city} onChange={setAddress('city')} error={errors['address.city']} />
          <TextField label="State" value={values.address.state} onChange={setAddress('state')} error={errors['address.state']} />
          <TextField label="ZIP code" value={values.address.postalCode} onChange={setAddress('postalCode')} error={errors['address.postalCode']} />
        </div>

        <p className="form-section-title">Contacts</p>
        {values.contacts.map((contact, ci) => (
          <fieldset key={ci} className="contact-editor" aria-label={`Contact ${ci + 1}`} style={{ margin: 0 }}>
            <div className="contact-editor-head">
              <span aria-hidden="true">Contact {ci + 1}</span>
              {values.contacts.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setValues((v) => ({ ...v, contacts: v.contacts.filter((_, i) => i !== ci) }))}
                >
                  <Icon name="close" size={14} /> Remove contact
                </button>
              )}
            </div>
            <div className="form-row">
              <TextField label="Contact name" value={contact.name} onChange={(e) => updateContact(ci, (c) => ({ ...c, name: e.target.value }))} error={errors[`contacts.${ci}.name`]} />
              <TextField
                label="Relationship to pet"
                placeholder="Owner, spouse, vet, neighbor…"
                value={contact.relationship}
                onChange={(e) => updateContact(ci, (c) => ({ ...c, relationship: e.target.value }))}
                error={errors[`contacts.${ci}.relationship`]}
              />
            </div>
            {errors[`contacts.${ci}.phones`] && <p className="field-error">{errors[`contacts.${ci}.phones`]}</p>}
            {contact.phones.map((phone, pi) => (
              <div className="phone-row" key={pi}>
                <SelectField
                  label="Phone type"
                  value={phone.label}
                  options={PHONE_TYPES}
                  onChange={(e) => updateContact(ci, (c) => ({ ...c, phones: c.phones.map((p, i) => (i === pi ? { ...p, label: e.target.value } : p)) }))}
                />
                <TextField
                  label="Phone number"
                  type="tel"
                  value={phone.number}
                  onChange={(e) => updateContact(ci, (c) => ({ ...c, phones: c.phones.map((p, i) => (i === pi ? { ...p, number: e.target.value } : p)) }))}
                  error={errors[`contacts.${ci}.phones.${pi}.number`]}
                />
                {contact.phones.length > 1 ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove phone"
                    onClick={() => updateContact(ci, (c) => ({ ...c, phones: c.phones.filter((_, i) => i !== pi) }))}
                  >
                    <Icon name="close" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => updateContact(ci, (c) => ({ ...c, phones: [...c.phones, { label: 'Mobile', number: '' }] }))}
              >
                <Icon name="plus" size={14} /> Add phone
              </button>
            </div>
          </fieldset>
        ))}
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setValues((v) => ({ ...v, contacts: [...v.contacts, emptyContact()] }))}>
            <Icon name="plus" size={14} /> Add contact
          </button>
        </div>
      </form>
    </Modal>
  );
}
