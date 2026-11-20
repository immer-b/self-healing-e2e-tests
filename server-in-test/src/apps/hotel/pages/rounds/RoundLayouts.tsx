import type { ChangeEvent, ComponentType, ReactNode } from 'react';
import { photoUrl, type TaskDetail } from '../../api';
import { Icon } from '../../components/Icon';
import { Card } from '../../components/ui';

export interface RoundLayoutProps {
  task: TaskDetail;
  isDone: boolean;
  missing: string[];
  canComplete: boolean;
  completing: boolean;
  uploading: boolean;
  /** Shown next to the complete action when something blocks it. */
  hint: string;
  photoInputId: string;
  toggle: (field: 'cleaned' | 'fed', value: boolean) => void;
  upload: (event: ChangeEvent<HTMLInputElement>) => void;
  complete: () => void;
  notes: ReactNode;
  contacts: ReactNode;
}

const instructions = (task: TaskDetail) => task.pet?.specialInstructions || 'No special instructions. Standard care.';
const photoAlt = (task: TaskDetail) => `${task.pet?.name} in ${task.room?.name}`;

/** v1: checklist, photo and notes cards with a sticky complete bar (what the page objects target). */
function RoundCards(p: RoundLayoutProps) {
  const { task, isDone } = p;
  return (
    <div data-ui-version="1">
      <div className="grid-sidebar">
        <div className="stack">
          <div className="callout">
            <Icon name="alert" />
            <div>
              <div className="callout-title">Special instructions</div>
              <div id="special-instructions" role="note" aria-label="Special instructions">
                {instructions(task)}
              </div>
            </div>
          </div>
          <Card title="Checklist">
            <div className="card-body checklist">
              <label className="check-row">
                <input id="round-cleaned" type="checkbox" checked={task.cleaned} disabled={isDone} onChange={(e) => p.toggle('cleaned', e.target.checked)} />
                Room cleaned
              </label>
              <label className="check-row">
                <input id="round-fed" type="checkbox" checked={task.fed} disabled={isDone} onChange={(e) => p.toggle('fed', e.target.checked)} />
                Fed
              </label>
            </div>
          </Card>
          <Card title="Room photo">
            <div className="card-body stack">
              {task.photoId && <img className="photo-preview" src={photoUrl(task.photoId)} alt={photoAlt(task)} />}
              {!isDone && (
                <div className="photo-drop">
                  <Icon name="camera" size={26} />
                  <label htmlFor={p.photoInputId} className="btn btn-secondary">
                    {p.uploading ? 'Uploading…' : task.photoId ? 'Replace photo' : 'Take or choose a photo'}
                  </label>
                  <input
                    id={p.photoInputId}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only round-photo-input"
                    aria-label="Photo of the pet in the room"
                    onChange={p.upload}
                    disabled={p.uploading}
                  />
                  <span className="field-hint">A clear photo of {task.pet?.name} in the room. JPEG, PNG, WebP or GIF up to 5 MB.</span>
                </div>
              )}
            </div>
          </Card>
          {p.notes}
        </div>
        <div className="stack">{p.contacts}</div>
      </div>
      {!isDone && (
        <div className="complete-bar">
          <span className="muted">{p.hint}</span>
          <button id="complete-round" type="button" className="btn btn-primary btn-lg" disabled={!p.canComplete || p.completing} onClick={p.complete}>
            <Icon name="check" /> Complete round
          </button>
        </div>
      )}
    </div>
  );
}

/** v2: one column, switch-style checks, the photo first and an inline finish button. */
function RoundChecklist(p: RoundLayoutProps) {
  const { task, isDone } = p;
  return (
    <div data-ui-version="2" className="round-v2">
      <aside className="round-v2-brief" aria-label="Before you start">
        <h2>Before you start</h2>
        <p role="note" aria-label="Special instructions">
          {instructions(task)}
        </p>
      </aside>
      <section className="card" aria-label="Room photo">
        <div className="card-body stack">
          <h2 className="round-v2-heading">Room photo</h2>
          {task.photoId && <img className="photo-preview" src={photoUrl(task.photoId)} alt={photoAlt(task)} />}
          {!isDone && (
            <label className="btn btn-secondary round-v2-upload">
              <Icon name="camera" /> {p.uploading ? 'Uploading…' : 'Upload a room photo'}
              <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Room photo upload" onChange={p.upload} disabled={p.uploading} />
            </label>
          )}
        </div>
      </section>
      <section className="card" aria-label="Care checks">
        <div className="card-body">
          <h2 className="round-v2-heading">Care checks</h2>
          <div className="switch-list">
            <label className="switch-row">
              <span>Room is clean</span>
              <input type="checkbox" className="switch" checked={task.cleaned} disabled={isDone} onChange={(e) => p.toggle('cleaned', e.target.checked)} />
            </label>
            <label className="switch-row">
              <span>Pet was fed</span>
              <input type="checkbox" className="switch" checked={task.fed} disabled={isDone} onChange={(e) => p.toggle('fed', e.target.checked)} />
            </label>
          </div>
          {!isDone && (
            <div className="round-v2-finish">
              <button type="button" className="btn btn-primary" disabled={!p.canComplete || p.completing} onClick={p.complete}>
                Mark round complete
              </button>
              <span className="muted">{p.hint}</span>
            </div>
          )}
        </div>
      </section>
      {p.notes}
      {p.contacts}
    </div>
  );
}

/** v3: numbered steps in the order a carer works through them. */
function RoundSteps(p: RoundLayoutProps) {
  const { task, isDone } = p;
  return (
    <div data-ui-version="3" className="round-v3">
      <ol className="round-steps">
        <li className="round-step is-done">
          <h3>Read the notes for {task.pet?.name}</h3>
          <blockquote className="round-step-quote" role="note" aria-label="Special instructions">
            {instructions(task)}
          </blockquote>
        </li>
        <li className={`round-step ${task.cleaned ? 'is-done' : ''}`}>
          <label className="round-step-check">
            <input type="checkbox" checked={task.cleaned} disabled={isDone} onChange={(e) => p.toggle('cleaned', e.target.checked)} />
            Clean the room
          </label>
        </li>
        <li className={`round-step ${task.fed ? 'is-done' : ''}`}>
          <label className="round-step-check">
            <input type="checkbox" checked={task.fed} disabled={isDone} onChange={(e) => p.toggle('fed', e.target.checked)} />
            Feed {task.pet?.name}
          </label>
        </li>
        <li className={`round-step ${task.photoId ? 'is-done' : ''}`}>
          <h3>Take a photo</h3>
          {task.photoId && <img className="photo-preview" src={photoUrl(task.photoId)} alt={photoAlt(task)} />}
          {!isDone && <input type="file" accept="image/*" capture="environment" aria-label="Photo for this round" onChange={p.upload} disabled={p.uploading} />}
        </li>
        <li className="round-step">
          {isDone ? (
            <p className="muted">This round is finished.</p>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-lg" disabled={!p.canComplete || p.completing} onClick={p.complete}>
                Finish round
              </button>
              <p className="muted">{p.hint}</p>
            </>
          )}
        </li>
      </ol>
      <div className="grid-2">
        {p.notes}
        {p.contacts}
      </div>
    </div>
  );
}

export const ROUND_LAYOUTS: Record<1 | 2 | 3, ComponentType<RoundLayoutProps>> = { 1: RoundCards, 2: RoundChecklist, 3: RoundSteps };
