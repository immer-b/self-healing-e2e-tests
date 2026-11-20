import { useId, useState, type ChangeEvent } from 'react';
import { api, photoUrl, type TaskDetail } from '../api';
import { Icon } from '../components/Icon';
import { Badge, Card, ErrorBanner, Loading, PageHeader, useToast } from '../components/ui';
import { ROOM_TYPE_LABELS, SLOT_LABELS, SLOT_TIMES, SPECIES_LABELS, formatDateTime, useResource } from '../lib';
import { Link, navigate } from '../router';
import { NotesCard } from './PetDetailPage';
import { prepareUpload } from '../image';
import { useOffline } from '../offline';
import { useEffect } from 'react';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function TaskPage({ params }: { params: Record<string, string> }) {
  const toast = useToast();
  const { data: task, error, setData, reload } = useResource(() => api.task(params.id), [params.id]);
  const offline = useOffline();
  useEffect(() => {
    if (offline.syncVersion) reload();
  }, [offline.syncVersion, reload]);
  const [problem, setProblem] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const photoInputId = useId();

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!task) return <Loading />;

  const isDone = task.status === 'completed';
  const merge = (changes: Partial<TaskDetail>) => setData((current) => current && { ...current, ...changes });

  const toggle = async (field: 'cleaned' | 'fed', value: boolean) => {
    merge({ [field]: value });
    try {
      const saved = await offline.submit({ method: 'PUT', path: `/api/hotel/tasks/${task.id}`, body: { [field]: value } }, () =>
        api.updateTask(task.id, { [field]: value }),
      );
      if (saved !== 'queued') merge({ cleaned: saved.cleaned, fed: saved.fed });
      setProblem(undefined);
    } catch (e) {
      merge({ [field]: !value });
      setProblem((e as Error).message);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setProblem('Choose an image file (JPEG, PNG, WebP or GIF).');
    setUploading(true);
    try {
      const prepared = await prepareUpload(file);
      if (prepared.size > MAX_PHOTO_BYTES) {
        setProblem('That photo is larger than 5 MB even after shrinking it. Try another one.');
        return;
      }
      const saved = await api.uploadTaskPhoto(task.id, prepared);
      merge({ photoId: saved.photoId });
      setProblem(undefined);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const missing = [!task.cleaned && 'clean the room', !task.fed && 'feed', !task.photoId && 'add a photo'].filter(Boolean) as string[];
  const canComplete = offline.online && offline.pending === 0 && missing.length === 0;

  const complete = async () => {
    setCompleting(true);
    try {
      await api.completeTask(task.id);
      toast(`${task.pet?.name}'s ${task.slot} round is complete`);
      navigate('/queue');
    } catch (e) {
      setProblem((e as Error).message);
      setCompleting(false);
    }
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/queue" className="back-link">
            <Icon name="arrowLeft" size={16} /> My rounds
          </Link>
        }
        title={task.pet?.name ?? 'Care round'}
        subtitle={`${SLOT_LABELS[task.slot]} round · ${SLOT_TIMES[task.slot]} · ${task.room?.name} (${task.room && ROOM_TYPE_LABELS[task.room.type]}) · ${task.pet && `${SPECIES_LABELS[task.pet.species]}, ${task.pet.breed}`}`}
        actions={isDone ? <Badge tone="success">Done</Badge> : <Badge tone="info">In progress</Badge>}
      />
      {isDone && task.completedAt && (
        <div className="banner banner-info" style={{ marginBottom: 18 }}>
          <Icon name="check" /> Completed at {formatDateTime(task.completedAt)}.
        </div>
      )}
      {problem && (
        <div style={{ marginBottom: 18 }}>
          <ErrorBanner>{problem}</ErrorBanner>
        </div>
      )}
      <div className="grid-sidebar">
        <div className="stack">
          <div className="callout" role="note" aria-label="Special instructions">
            <Icon name="alert" />
            <div>
              <div className="callout-title">Special instructions</div>
              <div>{task.pet?.specialInstructions || 'No special instructions. Standard care.'}</div>
            </div>
          </div>
          <Card title="Checklist">
            <div className="card-body checklist">
              <label className="check-row">
                <input type="checkbox" checked={task.cleaned} disabled={isDone} onChange={(e) => toggle('cleaned', e.target.checked)} />
                Room cleaned
              </label>
              <label className="check-row">
                <input type="checkbox" checked={task.fed} disabled={isDone} onChange={(e) => toggle('fed', e.target.checked)} />
                Fed
              </label>
            </div>
          </Card>
          <Card title="Room photo">
            <div className="card-body stack">
              {task.photoId && <img className="photo-preview" src={photoUrl(task.photoId)} alt={`${task.pet?.name} in ${task.room?.name}`} />}
              {!isDone && (
                <div className="photo-drop">
                  <Icon name="camera" size={26} />
                  <label htmlFor={photoInputId} className="btn btn-secondary">
                    {uploading ? 'Uploading…' : task.photoId ? 'Replace photo' : 'Take or choose a photo'}
                  </label>
                  <input id={photoInputId} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photo of the pet in the room" onChange={upload} disabled={uploading} />
                  <span className="field-hint">A clear photo of {task.pet?.name} in the room. JPEG, PNG, WebP or GIF up to 5 MB.</span>
                </div>
              )}
            </div>
          </Card>
          <NotesCard petId={task.petId} petName={task.pet?.name} taskId={task.id} />
        </div>
        <div className="stack">
          <Card title="Emergency contacts">
            <div className="card-body">
              <ul className="contact-list">
                {task.owner?.contacts.map((contact, i) => (
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
            </div>
          </Card>
        </div>
      </div>
      {!isDone && (
        <div className="complete-bar">
          <span className="muted">
            {missing.length
              ? `Still to do: ${missing.join(', ')}`
              : !offline.online || offline.pending
                ? 'Reconnect to complete the round.'
                : 'All set. Mark the round complete to move on.'}
          </span>
          <button type="button" className="btn btn-primary btn-lg" disabled={!canComplete || completing} onClick={complete}>
            <Icon name="check" /> Complete round
          </button>
        </div>
      )}
    </>
  );
}
