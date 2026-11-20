import type { ComponentType } from 'react';
import type { TaskDetail } from '../../api';
import { Icon } from '../../components/Icon';
import { Badge, Card } from '../../components/ui';
import { ROOM_TYPE_LABELS, SLOT_LABELS, SLOT_TIMES } from '../../lib';
import { Link } from '../../router';

export interface QueueLayoutProps {
  tasks: TaskDetail[];
  done: number;
  next?: TaskDetail;
}

/** Accessible names that stay the same in every layout, as they usually do in real redesigns. */
const PROGRESS_LABEL = 'Rounds done today';
const roundName = (task: TaskDetail) =>
  `${task.pet?.name} · ${SLOT_LABELS[task.slot]} round${task.status === 'completed' ? ' · Done' : task.overdue ? ' · Overdue' : ''}`;

const status = (task: TaskDetail) =>
  task.status === 'completed' ? <Badge tone="success">Done</Badge> : task.overdue ? <Badge tone="danger">Overdue</Badge> : null;

/** v1: summary card plus a list of round links (the layout the page objects were written for). */
function QueueList({ tasks, done, next }: QueueLayoutProps) {
  return (
    <div data-ui-version="1">
      <Card className="queue-summary">
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <strong id="round-progress" aria-label={PROGRESS_LABEL} style={{ fontSize: 16 }}>
              {done} of {tasks.length} done
            </strong>
            {next ? (
              <span className="muted">
                Next up: {next.pet?.name} in {next.room?.name}
              </span>
            ) : (
              <Badge tone="success">All rounds complete</Badge>
            )}
          </div>
          <div className="progress" role="progressbar" aria-label="Rounds completed" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={done}>
            <span style={{ width: `${(done / tasks.length) * 100}%` }} />
          </div>
        </div>
      </Card>
      <ul id="round-queue" className="queue" aria-label="My rounds" style={{ marginTop: 18 }}>
        {tasks.map((task) => {
          const isDone = task.status === 'completed';
          return (
            <li key={task.id} aria-label={roundName(task)}>
              <Link to={`/queue/${task.id}`} className={`queue-item ${isDone ? 'is-done' : ''}`} aria-label={roundName(task)}>
                <span className={`queue-slot ${task.slot === 'evening' ? 'is-evening' : ''}`} aria-hidden="true">
                  {SLOT_TIMES[task.slot].replace(':00', '')}
                </span>
                <span>
                  <span className="queue-title">{task.pet?.name}</span>
                  <span className="queue-meta">
                    {' '}
                    · {SLOT_LABELS[task.slot]} round · {task.room?.name} ({task.room && ROOM_TYPE_LABELS[task.room.type]})
                  </span>
                  {task.pet?.specialInstructions && !isDone && (
                    <span className="queue-flag" style={{ display: 'flex' }}>
                      <Icon name="alert" size={14} />
                      {task.pet.specialInstructions}
                    </span>
                  )}
                </span>
                {status(task) ?? (
                  <span className="btn btn-secondary btn-sm" aria-hidden="true">
                    Start
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** v2: a compact table with the progress in the card header. */
function QueueTable({ tasks, done }: QueueLayoutProps) {
  return (
    <section className="card rounds-table-card" data-ui-version="2" aria-label="Today's rounds">
      <div className="card-header">
        <h2>Today&apos;s rounds</h2>
        <strong className="pill-progress" aria-label={PROGRESS_LABEL}>
          Completed {done}/{tasks.length}
        </strong>
      </div>
      <div className="table-wrap">
        <table className="table rounds-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Guest</th>
              <th>Room</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="round-row" aria-label={roundName(task)}>
                <td className="nowrap">{SLOT_LABELS[task.slot]}</td>
                <td>
                  <Link to={`/queue/${task.id}`} className="round-open" aria-label={roundName(task)}>
                    {task.pet?.name}
                  </Link>
                  {task.pet?.specialInstructions && task.status !== 'completed' && <div className="cell-sub">{task.pet.specialInstructions}</div>}
                </td>
                <td>{task.room?.name}</td>
                <td>{status(task) ?? <Badge tone="info">To do</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** v3: a grid of cards with a ring-style counter. */
function QueueCards({ tasks, done }: QueueLayoutProps) {
  return (
    <div data-ui-version="3" className="round-cards-page">
      <p className="round-counter">
        <strong className="round-counter-value" aria-label={PROGRESS_LABEL}>
          {done} / {tasks.length}
        </strong>{' '}
        rounds done today
      </p>
      <div className="round-cards">
        {tasks.map((task) => (
          <article key={task.id} className={`round-card ${task.status === 'completed' ? 'is-done' : ''}`} aria-label={roundName(task)}>
            <header>
              <span className="round-card-slot">{SLOT_TIMES[task.slot]}</span>
              {status(task)}
            </header>
            <h3>{task.pet?.name}</h3>
            <p className="muted">
              {task.room?.name} · {task.pet?.breed}
            </p>
            <Link to={`/queue/${task.id}`} className="round-card-link" aria-label={roundName(task)}>
              {task.pet?.name}: begin round →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export const QUEUE_LAYOUTS: Record<1 | 2 | 3, ComponentType<QueueLayoutProps>> = { 1: QueueList, 2: QueueTable, 3: QueueCards };
