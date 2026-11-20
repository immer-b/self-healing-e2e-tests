import { api } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Badge, Card, EmptyState, ErrorBanner, Loading, PageHeader } from '../components/ui';
import { ROOM_TYPE_LABELS, SLOT_LABELS, SLOT_TIMES, formatLongDate, useResource } from '../lib';
import { Link } from '../router';
import { useLiveUpdates } from '../liveUpdates';

export function QueuePage(_props: { params: Record<string, string> }) {
  const { employee, today } = useEmployee();
  const { data: tasks, error, reload } = useResource(() => api.myTasks(), []);
  useLiveUpdates(['task'], reload);
  const done = tasks?.filter((t) => t.status === 'completed').length ?? 0;
  const next = tasks?.find((t) => t.status === 'pending');

  return (
    <>
      <PageHeader
        title="My rounds"
        subtitle={`${formatLongDate(today)} · Hi ${employee.name.split(' ')[0]}, here is what is on your list.`}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => reload()}>
            <Icon name="restore" /> Refresh
          </button>
        }
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!tasks ? (
        <Loading />
      ) : !tasks.length ? (
        <Card>
          <EmptyState icon="queue" title="No rounds assigned to you today">
            Check with the front desk if you expected some.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="queue-summary">
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>
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
          <ul className="queue" aria-label="My rounds" style={{ marginTop: 18 }}>
            {tasks.map((task) => {
              const isDone = task.status === 'completed';
              return (
                <li key={task.id}>
                  <Link to={`/queue/${task.id}`} className={`queue-item ${isDone ? 'is-done' : ''}`}>
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
                    {isDone ? (
                      <Badge tone="success">Done</Badge>
                    ) : task.overdue ? (
                      <Badge tone="danger">Overdue</Badge>
                    ) : (
                      <span className="btn btn-secondary btn-sm" aria-hidden="true">
                        Start
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
