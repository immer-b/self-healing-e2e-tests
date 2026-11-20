import { useState, type FormEvent } from 'react';
import { api, type Room, type RoomInput, type RoomOccupancy, type RoomType } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Badge, Card, ConfirmDialog, ErrorBanner, Loading, Modal, PageHeader, SelectField, TextField, Toggle, useToast } from '../components/ui';
import { ROOM_TONE, ROOM_TYPE_LABELS, fieldErrors, formatMoney, toOptions, useResource } from '../lib';
import { Link } from '../router';
import { DateNav } from './TodayPage';

const SECTIONS: { type: RoomType; title: string }[] = [
  { type: 'exclusive', title: 'Exclusive suites' },
  { type: 'midline', title: 'Midline rooms' },
  { type: 'basic', title: 'Basic kennels' },
];

export function RoomsPage(_props: { params: Record<string, string> }) {
  const { employee, today } = useEmployee();
  const isAdmin = employee.role === 'admin';
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Room | 'new'>();
  const [archiving, setArchiving] = useState<Room>();
  const occupancy = useResource(() => api.occupancy(date), [date]);
  const archived = useResource(
    () => (showArchived ? api.rooms({ includeDeleted: true }).then((rooms) => rooms.filter((r) => r.deletedAt)) : Promise.resolve([])),
    [showArchived],
  );

  const reload = () => {
    occupancy.reload();
    archived.reload();
  };
  const rooms = occupancy.data;
  const occupied = rooms?.filter((r) => r.occupied).length ?? 0;

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle={rooms ? `${occupied} of ${rooms.length} occupied on the night of the selected date` : undefined}
        actions={
          <>
            <DateNav date={date} onChange={setDate} today={today} />
            {isAdmin && (
              <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                <Icon name="plus" /> New room
              </button>
            )}
          </>
        }
      />
      {occupancy.error && <ErrorBanner>{occupancy.error}</ErrorBanner>}
      {!rooms ? (
        <Loading />
      ) : (
        <Card>
          <div className="card-body">
            {isAdmin && (
              <div style={{ marginBottom: 16 }}>
                <Toggle label="Show archived rooms" checked={showArchived} onChange={setShowArchived} />
              </div>
            )}
            {SECTIONS.map(({ type, title }) => {
              const inSection = rooms.filter((r) => r.type === type);
              const archivedInSection = (archived.data ?? []).filter((r) => r.type === type);
              return (
                <section key={type} className="room-section" aria-label={title}>
                  <h3>
                    {title} <Badge tone={ROOM_TONE[type]}>{inSection.filter((r) => !r.occupied).length} vacant</Badge>
                  </h3>
                  <div className="room-grid">
                    {inSection.map((room) => (
                      <RoomTile key={room.id} room={room} isAdmin={isAdmin} onEdit={() => setEditing(room)} onArchive={() => setArchiving(room)} />
                    ))}
                    {archivedInSection.map((room) => (
                      <article key={room.id} className="room-tile is-archived" aria-label={room.name}>
                        <div className="room-name">
                          {room.name} <Badge tone="danger">Archived</Badge>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={async () => {
                            await api.restoreRoom(room.id);
                            toast(`${room.name} was restored`);
                            reload();
                          }}
                        >
                          <Icon name="restore" size={14} /> Restore
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </Card>
      )}
      {editing && (
        <RoomDialog
          room={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={(room, created) => {
            setEditing(undefined);
            toast(created ? `${room.name} was added` : `${room.name} was updated`);
            reload();
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title="Archive room?"
          message={`${archiving.name} will no longer be offered for bookings. Past stays keep their history.`}
          confirmLabel="Archive room"
          onCancel={() => setArchiving(undefined)}
          onConfirm={async () => {
            await api.archiveRoom(archiving.id);
            toast(`${archiving.name} was archived`);
            setArchiving(undefined);
            reload();
          }}
        />
      )}
    </>
  );
}

function RoomTile({ room, isAdmin, onEdit, onArchive }: { room: RoomOccupancy; isAdmin: boolean; onEdit: () => void; onArchive: () => void }) {
  return (
    <article className={`room-tile ${room.occupied ? 'is-occupied' : ''}`} aria-label={room.name}>
      <div className="room-name">
        {room.name}
        <span className="cell-sub">{formatMoney(room.nightlyRate)}/night</span>
      </div>
      {room.occupied && room.pet ? (
        <Link to={`/pets/${room.pet.id}`} className="room-guest">
          {room.pet.name}
        </Link>
      ) : (
        <span className="muted">Vacant</span>
      )}
      {isAdmin && (
        <div className="room-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`Edit ${room.name}`}>
            <Icon name="edit" size={14} /> Edit
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive} aria-label={`Archive ${room.name}`}>
            <Icon name="archive" size={14} /> Archive
          </button>
        </div>
      )}
    </article>
  );
}

function RoomDialog({ room, onClose, onSaved }: { room?: Room; onClose: () => void; onSaved: (room: Room, created: boolean) => void }) {
  const [values, setValues] = useState<RoomInput>(room ? { name: room.name, type: room.type, nightlyRate: room.nightlyRate } : { name: '', type: 'basic', nightlyRate: 45 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const saved = room ? await api.updateRoom(room.id, values) : await api.createRoom(values);
      onSaved(saved, !room);
    } catch (e) {
      const { general: message, fields } = fieldErrors(e);
      setErrors(fields);
      setGeneral(message);
    }
  };

  return (
    <Modal
      title={room ? `Edit ${room.name}` : 'New room'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="room-form" className="btn btn-primary">
            {room ? 'Save changes' : 'Add room'}
          </button>
        </>
      }
    >
      <form id="room-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        <TextField label="Room name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} hint="For example E-103" />
        <SelectField label="Type" value={values.type} onChange={(e) => setValues((v) => ({ ...v, type: e.target.value as RoomType }))} options={toOptions(ROOM_TYPE_LABELS)} error={errors.type} />
        <TextField
          label="Nightly rate"
          type="number"
          min={0}
          step="0.01"
          value={String(values.nightlyRate)}
          onChange={(e) => setValues((v) => ({ ...v, nightlyRate: e.target.value === '' ? ('' as unknown as number) : Number(e.target.value) }))}
          error={errors.nightlyRate}
        />
      </form>
    </Modal>
  );
}
