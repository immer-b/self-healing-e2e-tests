import { useEffect, useState, type FormEvent } from 'react';
import { api, type Note, type Room, type Stay } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Avatar, Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, Loading, Modal, PageHeader, SelectField, TextAreaField, TextField, useToast } from '../components/ui';
import { ROOM_TONE, ROOM_TYPE_LABELS, SPECIES_LABELS, STAY_STATUS, addDays, fieldErrors, formatDate, formatDateTime, formatMoney, nights, useResource } from '../lib';
import { Link } from '../router';
import { PetDialog } from './PetsPage';

export function PetDetailPage({ params }: { params: Record<string, string> }) {
  const { employee } = useEmployee();
  const toast = useToast();
  const petId = params.id;
  const pet = useResource(() => api.pet(petId), [petId]);
  const owner = useResource(() => (pet.data ? api.owner(pet.data.ownerId) : Promise.resolve(undefined)), [pet.data?.ownerId]);
  const stays = useResource(() => api.petStays(petId), [petId]);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState<Stay>();

  if (pet.error) return <ErrorBanner>{pet.error}</ErrorBanner>;
  if (!pet.data) return <Loading />;
  const p = pet.data;

  return (
    <>
      <PageHeader
        back={
          <Link to="/pets" className="back-link">
            <Icon name="arrowLeft" size={16} /> Pets
          </Link>
        }
        title={p.name}
        subtitle={`${SPECIES_LABELS[p.species]} · ${p.breed}`}
        actions={
          <>
            {employee.role === 'admin' && (
              <Link to={`/audit?entityType=pet&entityId=${p.id}`} className="btn btn-ghost">
                <Icon name="audit" /> Change history
              </Link>
            )}
            {!p.deletedAt && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                  <Icon name="edit" /> Edit pet
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setBooking(true)}>
                  <Icon name="plus" /> Book a stay
                </button>
              </>
            )}
          </>
        }
      />
      {p.deletedAt && (
        <div className="banner banner-warning" style={{ marginBottom: 18 }}>
          <Icon name="archive" /> This pet is archived. Their record is kept for reference.
        </div>
      )}
      <div className="grid-sidebar">
        <div className="stack">
          <div className="callout" role="note" aria-label="Special instructions">
            <Icon name="alert" />
            <div>
              <div className="callout-title">Special instructions</div>
              <div>{p.specialInstructions || 'None on file.'}</div>
            </div>
          </div>
          <StaysCard stays={stays} onCancel={setCancelling} />
          <NotesCard petId={p.id} />
        </div>
        <div className="stack">
          <Card title="Owner">
            <div className="card-body">
              {owner.data ? (
                <dl className="details">
                  <dt>Name</dt>
                  <dd>{owner.data.name}</dd>
                  <dt>Email</dt>
                  <dd>{owner.data.email || '—'}</dd>
                  <dt>Address</dt>
                  <dd>
                    {owner.data.address.line1}
                    {owner.data.address.line2 && `, ${owner.data.address.line2}`}
                    <br />
                    {owner.data.address.city}, {owner.data.address.state} {owner.data.address.postalCode}
                  </dd>
                </dl>
              ) : (
                <Loading />
              )}
            </div>
          </Card>
          <Card title="Contacts">
            <div className="card-body">
              {owner.data && (
                <ul className="contact-list">
                  {owner.data.contacts.map((contact, i) => (
                    <li key={i}>
                      <span className="contact-name">{contact.name}</span>
                      <span className="cell-sub">{contact.relationship}</span>
                      {contact.phones.map((phone, j) => (
                        <span className="phone" key={j}>
                          <Icon name="phone" size={14} />
                          <a href={`tel:${phone.number.replace(/[^\d+]/g, '')}`}>{phone.number}</a>
                          <span className="muted">{phone.label}</span>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
      {editing && (
        <PetDialog
          pet={p}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            toast(`${saved.name} was updated`);
            pet.reload();
          }}
        />
      )}
      {booking && (
        <BookStayDialog
          petId={p.id}
          petName={p.name}
          onClose={() => setBooking(false)}
          onBooked={(stay) => {
            setBooking(false);
            toast(`${p.name} is booked into ${stay.room?.name}`);
            stays.reload();
          }}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel booking?"
          message={`${p.name}'s stay from ${formatDate(cancelling.checkIn)} to ${formatDate(cancelling.checkOut)} will be cancelled and the room released.`}
          confirmLabel="Cancel booking"
          onCancel={() => setCancelling(undefined)}
          onConfirm={async () => {
            await api.cancelStay(cancelling.id);
            toast('Booking cancelled');
            setCancelling(undefined);
            stays.reload();
          }}
        />
      )}
    </>
  );
}

function StaysCard({ stays, onCancel }: { stays: { data?: Stay[]; loading: boolean; error?: string }; onCancel: (stay: Stay) => void }) {
  return (
    <Card title="Stays">
      {stays.error && <ErrorBanner>{stays.error}</ErrorBanner>}
      {!stays.data ? (
        <Loading />
      ) : stays.data.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Dates</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...stays.data].reverse().map((stay) => (
                <tr key={stay.id}>
                  <td>{stay.room && <Badge tone={ROOM_TONE[stay.room.type]}>{stay.room.name}</Badge>}</td>
                  <td className="nowrap">
                    {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)}
                    <div className="cell-sub">{nights(stay.checkIn, stay.checkOut)} nights</div>
                  </td>
                  <td>
                    <Badge tone={STAY_STATUS[stay.status].tone}>{STAY_STATUS[stay.status].label}</Badge>
                  </td>
                  <td className="cell-actions">
                    {stay.status === 'booked' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCancel(stay)}>
                        Cancel booking
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="rooms" title="No stays yet" />
      )}
    </Card>
  );
}

export function NotesCard({ petId, taskId, title = 'Notes' }: { petId: string; taskId?: string; title?: string }) {
  const notes = useResource(() => api.notes(petId), [petId]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError('Write a note first');
      return;
    }
    setBusy(true);
    try {
      const note = await api.addNote(petId, text, taskId);
      notes.setData((list) => [note, ...(list ?? [])]);
      setText('');
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={title}>
      <div className="card-body stack">
        <form className="form" onSubmit={submit}>
          <TextAreaField label="New note" placeholder="What did you notice? Behaviour, health, food, anything the next person should know." value={text} onChange={(e) => setText(e.target.value)} error={error} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span className="legal-hint">
              <Icon name="note" size={14} /> Notes are signed with your name and time. Notes can't be edited or deleted.
            </span>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              Add note
            </button>
          </div>
        </form>
        {notes.error && <ErrorBanner>{notes.error}</ErrorBanner>}
        {!notes.data ? (
          <Loading />
        ) : notes.data.length ? (
          <ol className="timeline" aria-label="Note history">
            {notes.data.map((note: Note) => (
              <li key={note.id}>
                <Avatar name={note.createdBy.name} />
                <div>
                  <div className="timeline-meta">
                    <strong>{note.createdBy.name}</strong> · {formatDateTime(note.createdAt)}
                    {note.taskId && <> · <Badge tone="info">Care round</Badge></>}
                  </div>
                  <div className="timeline-text">{note.text}</div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon="note" title="No notes yet" />
        )}
      </div>
    </Card>
  );
}

function BookStayDialog({ petId, petName, onClose, onBooked }: { petId: string; petName: string; onClose: () => void; onBooked: (stay: Stay) => void }) {
  const { today } = useEmployee();
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [roomId, setRoomId] = useState('');
  const [rooms, setRooms] = useState<Room[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;

  useEffect(() => {
    if (!datesValid) return;
    let active = true;
    setRooms(undefined);
    api.availableRooms(checkIn, checkOut).then(
      (list) => {
        if (!active) return;
        setRooms(list);
        setRoomId((current) => (list.some((r) => r.id === current) ? current : ''));
      },
      (e) => active && setGeneral((e as Error).message),
    );
    return () => {
      active = false;
    };
  }, [checkIn, checkOut, datesValid]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      onBooked(await api.bookStay({ petId, roomId, checkIn, checkOut }));
    } catch (e) {
      const { general: message, fields } = fieldErrors(e);
      setErrors(fields);
      setGeneral(message);
    }
  };

  const roomOptions = [
    { value: '', label: rooms ? (rooms.length ? `Select a room (${rooms.length} free)` : 'No rooms free for these dates') : 'Checking availability…' },
    ...(rooms ?? []).map((r) => ({ value: r.id, label: `${r.name} · ${ROOM_TYPE_LABELS[r.type]} · ${formatMoney(r.nightlyRate)}/night` })),
  ];
  const total = rooms?.find((r) => r.id === roomId) && datesValid ? rooms.find((r) => r.id === roomId)!.nightlyRate * nights(checkIn, checkOut) : undefined;

  return (
    <Modal
      title={`Book a stay for ${petName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="stay-form" className="btn btn-primary" disabled={!roomId || !datesValid}>
            Book stay
          </button>
        </>
      }
    >
      <form id="stay-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        <div className="form-row">
          <TextField label="Check-in" type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} error={errors.checkIn} />
          <TextField label="Check-out" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} error={errors.checkOut ?? (checkIn && checkOut && !datesValid ? 'Check-out must be after check-in' : undefined)} />
        </div>
        <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} options={roomOptions} error={errors.roomId} hint="Only rooms free for every night of the stay are listed." />
        {total !== undefined && (
          <p className="muted">
            {nights(checkIn, checkOut)} nights · estimated {formatMoney(total)}
          </p>
        )}
      </form>
    </Modal>
  );
}
