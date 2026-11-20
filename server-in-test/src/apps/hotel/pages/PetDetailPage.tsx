import { useEffect, useState, type FormEvent } from 'react';
import { api, type Note, type Room, type Stay } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Avatar, Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, Loading, Modal, PageHeader, SelectField, TextAreaField, TextField, useToast } from '../components/ui';
import { ROOM_TONE, ROOM_TYPE_LABELS, SPECIES_LABELS, STAY_STATUS, addDays, fieldErrors, formatDate, formatDateTime, formatMoney, nights, plural, useResource } from '../lib';
import { Link } from '../router';
import { PetDialog } from './PetsPage';
import { downloadCsv, slug, toCsv } from '../csv';

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
  const [changing, setChanging] = useState<Stay>();

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
          <StaysCard stays={stays} onCancel={setCancelling} onChange={setChanging} />
          <NotesCard petId={p.id} petName={p.name} />
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
      {changing && (
        <BookStayDialog
          petId={p.id}
          petName={p.name}
          stay={changing}
          onClose={() => setChanging(undefined)}
          onBooked={() => {
            setChanging(undefined);
            toast(`${p.name}'s stay was changed`);
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

function StaysCard({
  stays,
  onCancel,
  onChange,
}: {
  stays: { data?: Stay[]; loading: boolean; error?: string };
  onCancel: (stay: Stay) => void;
  onChange: (stay: Stay) => void;
}) {
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
                    <div className="cell-sub">{plural(nights(stay.checkIn, stay.checkOut), 'night')}</div>
                  </td>
                  <td>
                    <Badge tone={STAY_STATUS[stay.status].tone}>{STAY_STATUS[stay.status].label}</Badge>
                  </td>
                  <td className="cell-actions">
                    {(stay.status === 'booked' || stay.status === 'checked_in') && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(stay)}>
                        Change
                      </button>
                    )}
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

export function NotesCard({ petId, petName, taskId, title = 'Notes' }: { petId: string; petName?: string; taskId?: string; title?: string }) {
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

  const exportCsv = () =>
    downloadCsv(
      `notes-${slug(petName ?? 'pet')}-${petId}.csv`,
      toCsv(
        ['Written at', 'Author', 'Note', 'Care round'],
        (notes.data ?? []).map((n) => [n.createdAt, n.createdBy.name, n.text, n.taskId ?? '']),
      ),
    );

  return (
    <Card
      title={title}
      actions={
        notes.data?.length ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
        ) : undefined
      }
    >
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
            {notes.data
              .filter((note) => !note.amends)
              .map((note: Note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  addenda={notes.data!.filter((a) => a.amends === note.id).reverse()}
                  onAddendum={async (text) => {
                    const added = await api.addNote(petId, text, undefined, note.id);
                    notes.setData((list) => [added, ...(list ?? [])]);
                  }}
                />
              ))}
          </ol>
        ) : (
          <EmptyState icon="note" title="No notes yet" />
        )}
      </div>
    </Card>
  );
}

function NoteItem({ note, addenda, onAddendum }: { note: Note; addenda: Note[]; onAddendum: (text: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return setError('Write the addendum first');
    try {
      await onAddendum(text);
      setText('');
      setOpen(false);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <li>
      <Avatar name={note.createdBy.name} />
      <div>
        <div className="timeline-meta">
          <strong>{note.createdBy.name}</strong> · {formatDateTime(note.createdAt)}
          {note.taskId && <> · <Badge tone="info">Care round</Badge></>}
        </div>
        <div className="timeline-text">{note.text}</div>
        {addenda.map((a) => (
          <article key={a.id} className="addendum" aria-label={`Addendum by ${a.createdBy.name}`}>
            <div className="timeline-meta">
              <Badge tone="warning">Addendum</Badge> <strong>{a.createdBy.name}</strong> · {formatDateTime(a.createdAt)}
            </div>
            <div className="timeline-text">{a.text}</div>
          </article>
        ))}
        {open ? (
          <form className="form addendum-form" onSubmit={save}>
            <TextAreaField label="Addendum" placeholder="Add a correction or detail. The original note stays as written." value={text} onChange={(e) => setText(e.target.value)} error={error} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm">
                Save addendum
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="link-button addendum-toggle" onClick={() => setOpen(true)}>
            Add addendum
          </button>
        )}
      </div>
    </li>
  );
}

/** Books a new stay, or changes `stay` (dates and room) when given. */
function BookStayDialog({
  petId,
  petName,
  stay,
  onClose,
  onBooked,
}: {
  petId: string;
  petName: string;
  stay?: Stay;
  onClose: () => void;
  onBooked: (stay: Stay) => void;
}) {
  const { today } = useEmployee();
  const [checkIn, setCheckIn] = useState(stay?.checkIn ?? today);
  const [checkOut, setCheckOut] = useState(stay?.checkOut ?? addDays(today, 1));
  const [roomId, setRoomId] = useState(stay?.roomId ?? '');
  const checkedIn = stay?.status === 'checked_in';
  const [rooms, setRooms] = useState<Room[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;

  useEffect(() => {
    if (!datesValid) return;
    let active = true;
    setRooms(undefined);
    api.availableRooms(checkIn, checkOut, stay?.id).then(
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
  }, [checkIn, checkOut, datesValid, stay?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      onBooked(stay ? await api.changeStay(stay.id, { roomId, checkIn, checkOut }) : await api.bookStay({ petId, roomId, checkIn, checkOut }));
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
      title={stay ? `Change ${petName}'s stay` : `Book a stay for ${petName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="stay-form" className="btn btn-primary" disabled={!roomId || !datesValid}>
            {stay ? 'Save changes' : 'Book stay'}
          </button>
        </>
      }
    >
      <form id="stay-form" className="form" onSubmit={submit} noValidate>
        {general && <ErrorBanner>{general}</ErrorBanner>}
        <div className="form-row">
          <TextField label="Check-in" type="date" min={checkedIn ? undefined : today} disabled={checkedIn} hint={checkedIn ? 'Already checked in' : undefined} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} error={errors.checkIn} />
          <TextField label="Check-out" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} error={errors.checkOut ?? (checkIn && checkOut && !datesValid ? 'Check-out must be after check-in' : undefined)} />
        </div>
        <SelectField label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} options={roomOptions} error={errors.roomId} hint="Only rooms free for every night of the stay are listed." />
        {total !== undefined && (
          <p className="muted">
            {plural(nights(checkIn, checkOut), 'night')} · estimated {formatMoney(total)}
          </p>
        )}
      </form>
    </Modal>
  );
}
