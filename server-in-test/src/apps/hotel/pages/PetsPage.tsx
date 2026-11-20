import { useState, type FormEvent } from 'react';
import { api, type Pet, type PetInput, type Species } from '../api';
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
  TextAreaField,
  TextField,
  Toggle,
  useToast,
} from '../components/ui';
import { SPECIES_LABELS, fieldErrors, toOptions, useResource } from '../lib';
import { Link, navigate } from '../router';

export function PetsPage(_props: { params: Record<string, string> }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<Pet>();
  const { data: pets, error, loading, reload } = useResource(() => api.pets({ text, includeDeleted: showArchived }), [text, showArchived]);

  return (
    <>
      <PageHeader
        title="Pets"
        subtitle="Every pet we have looked after, with their owner and care notes."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New pet
          </button>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox label="Search pets" placeholder="Search by pet, breed or owner" value={text} onChange={setText} />
          <Toggle label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <span className="spacer" />
          {pets && <span className="count">{pets.length} pets</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {loading && !pets ? (
          <Loading />
        ) : pets?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Owner</th>
                  <th>Special instructions</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pets.map((pet) => (
                  <tr key={pet.id} className={pet.deletedAt ? 'is-archived' : undefined}>
                    <td>
                      <Link to={`/pets/${pet.id}`} className="cell-title">
                        {pet.name}
                      </Link>
                      <div className="cell-sub">
                        {SPECIES_LABELS[pet.species]} · {pet.breed}
                      </div>
                    </td>
                    <td>
                      <div>{pet.owner?.name}</div>
                      <div className="cell-sub">{pet.owner?.phone}</div>
                    </td>
                    <td className="cell-sub" style={{ maxWidth: 360 }}>
                      {pet.specialInstructions || '—'}
                    </td>
                    <td className="cell-actions">
                      {pet.deletedAt ? (
                        <>
                          <Badge tone="danger">Archived</Badge>{' '}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={async () => {
                              try {
                                await api.restorePet(pet.id);
                                toast(`${pet.name} was restored`);
                              } catch (e) {
                                toast((e as Error).message, 'danger');
                              }
                              reload();
                            }}
                          >
                            <Icon name="restore" size={14} /> Restore
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArchiving(pet)}>
                          <Icon name="archive" size={14} /> Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="pets" title="No pets match" />
        )}
      </Card>
      {creating && (
        <PetDialog
          onClose={() => setCreating(false)}
          onSaved={(pet) => {
            toast(`${pet.name} was added`);
            navigate(`/pets/${pet.id}`);
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive pet?"
          message={`${archiving.name} will be hidden from lists. Their stays and notes are kept for our records.`}
          confirmLabel="Archive pet"
          onCancel={() => setArchiving(undefined)}
          onConfirm={async () => {
            await api.archivePet(archiving.id);
            toast(`${archiving.name} was archived`);
            setArchiving(undefined);
            reload();
          }}
        />
      )}
    </>
  );
}

const EMPTY_PET: PetInput = { name: '', species: 'dog', breed: '', ownerId: '', specialInstructions: '' };

export function PetDialog({ pet, onClose, onSaved }: { pet?: Pet; onClose: () => void; onSaved: (pet: Pet) => void }) {
  const [values, setValues] = useState<PetInput>(
    pet ? { name: pet.name, species: pet.species, breed: pet.breed, ownerId: pet.ownerId, specialInstructions: pet.specialInstructions } : EMPTY_PET,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const owners = useResource(() => api.owners(), []);
  const set = (field: keyof PetInput) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      onSaved(pet ? await api.updatePet(pet.id, values) : await api.createPet(values));
    } catch (e) {
      const { general: message, fields } = fieldErrors(e);
      setErrors(fields);
      setGeneral(message);
    }
  };

  const ownerOptions = [{ value: '', label: owners.data ? 'Select an owner' : 'Loading owners…' }, ...(owners.data ?? []).map((o) => ({ value: o.id, label: o.name }))];

  return (
    <Modal
      title={pet ? `Edit ${pet.name}` : 'New pet'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="pet-form" className="btn btn-primary">
            {pet ? 'Save changes' : 'Add pet'}
          </button>
        </>
      }
    >
      <form id="pet-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        <div className="form-row">
          <TextField label="Name" value={values.name} onChange={set('name')} error={errors.name} />
          <SelectField label="Species" value={values.species} onChange={(e) => setValues((v) => ({ ...v, species: e.target.value as Species }))} options={toOptions(SPECIES_LABELS)} error={errors.species} />
        </div>
        <div className="form-row">
          <TextField label="Breed" value={values.breed} onChange={set('breed')} error={errors.breed} />
          {owners.data ? (
            <SelectField label="Owner" value={values.ownerId} onChange={set('ownerId')} options={ownerOptions} error={errors.ownerId} />
          ) : (
            <Loading label="Loading owners" />
          )}
        </div>
        <TextAreaField
          label="Special instructions"
          value={values.specialInstructions}
          onChange={set('specialInstructions')}
          hint="Diet, medication, temperament. Shown to staff on every care round."
        />
      </form>
    </Modal>
  );
}
