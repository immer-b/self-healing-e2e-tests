import { useEffect, useState } from 'react';
import { api, type TaskDetail } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Avatar, Badge, Card, EmptyState, ErrorBanner, Loading, PageHeader, useToast } from '../components/ui';
import { ROOM_TONE, SLOT_LABELS, SLOT_TIMES, formatLongDate, useResource } from '../lib';
import { DateNav } from './TodayPage';

export function SchedulePage(_props: { params: Record<string, string> }) {
  const { today } = useEmployee();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const staff = useResource(() => api.staff(), []);
  const board = useResource(() => api.board(date), [date]);
  const [onShift, setOnShift] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (staff.data) setOnShift(new Set(staff.data.map((s) => s.id)));
  }, [staff.data]);

  const shiftIds = () => (staff.data ?? []).filter((s) => onShift.has(s.id)).map((s) => s.id);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(undefined);
    try {
      toast(await action());
      await board.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    run(async () => {
      const created = await api.generateTasks(date, shiftIds());
      return created.length ? `${created.length} rounds created` : 'Every round for this day is already scheduled';
    });

  const rebalance = () =>
    run(async () => {
      await api.rebalanceTasks(date, shiftIds());
      return 'Open rounds were rebalanced';
    });

  const reassign = async (task: TaskDetail, assigneeId: string) => {
    try {
      await api.reassignTask(task.id, assigneeId || null);
      const who = staff.data?.find((s) => s.id === assigneeId)?.name ?? 'nobody';
      toast(`${SLOT_LABELS[task.slot]} round for ${task.pet?.name} reassigned to ${who}`);
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
    board.reload();
  };

  const tasks = board.data;
  const loadFor = (id: string) => {
    const mine = (tasks ?? []).filter((t) => t.assigneeId === id);
    return { total: mine.length, done: mine.filter((t) => t.status === 'completed').length };
  };
  const maxLoad = Math.max(1, ...(staff.data ?? []).map((s) => loadFor(s.id).total));
  const unassigned = (tasks ?? []).filter((t) => !t.assigneeId).length;

  return (
    <>
      <PageHeader
        title="Care schedule"
        subtitle={`Feeding and room checks for ${formatLongDate(date)}`}
        actions={
          <>
            <DateNav date={date} onChange={setDate} today={today} />
            <button type="button" className="btn btn-secondary" onClick={() => board.reload()}>
              <Icon name="restore" /> Refresh
            </button>
          </>
        }
      />
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
      <div className="grid-sidebar">
        <Card title="Rounds" actions={tasks && <span className="count">{tasks.length} rounds{unassigned ? ` · ${unassigned} unassigned` : ''}</span>}>
          {board.error && <ErrorBanner>{board.error}</ErrorBanner>}
          {!tasks ? (
            <Loading />
          ) : tasks.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Room</th>
                    <th>Pet</th>
                    <th>Assigned to</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="nowrap">
                        <div className="cell-title">{SLOT_LABELS[task.slot]}</div>
                        <div className="cell-sub">{SLOT_TIMES[task.slot]}</div>
                      </td>
                      <td>{task.room && <Badge tone={ROOM_TONE[task.room.type]}>{task.room.name}</Badge>}</td>
                      <td>
                        <div className="cell-title">{task.pet?.name}</div>
                        <div className="cell-sub">{task.pet?.breed}</div>
                        {task.pet?.specialInstructions && (
                          <div className="queue-flag" title={task.pet.specialInstructions}>
                            <Icon name="alert" size={14} /> Special instructions
                          </div>
                        )}
                      </td>
                      <td>
                        <select
                          className="inline-select"
                          aria-label={`Assign ${task.slot} round for ${task.pet?.name}`}
                          value={task.assigneeId ?? ''}
                          disabled={task.status === 'completed'}
                          onChange={(e) => reassign(task, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {(staff.data ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {task.status === 'completed' ? (
                          <Badge tone="success">Done</Badge>
                        ) : task.assigneeId ? (
                          <Badge tone="info">To do</Badge>
                        ) : (
                          <Badge tone="warning">Unassigned</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="schedule" title="No care rounds scheduled for this day">
              Choose who is on shift and generate the rounds.
            </EmptyState>
          )}
        </Card>

        <div className="stack">
          <Card title="On shift">
            <div className="card-body stack">
              {!staff.data ? (
                <Loading />
              ) : (
                <div className="shift-list">
                  {staff.data.map((s) => (
                    <label key={s.id} className="shift-option">
                      <input
                        type="checkbox"
                        checked={onShift.has(s.id)}
                        onChange={(e) =>
                          setOnShift((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || !onShift.size}>
                  <Icon name="sparkle" /> Generate rounds
                </button>
                <button type="button" className="btn btn-secondary" onClick={rebalance} disabled={busy || !onShift.size || !tasks?.length}>
                  <Icon name="shuffle" /> Rebalance open rounds
                </button>
              </div>
              <p className="field-hint">
                Generating adds any missing morning and evening rounds for pets staying that day and shares them evenly among the people on shift. Rebalancing
                spreads the rounds that are not done yet across whoever is on shift now.
              </p>
            </div>
          </Card>
          <Card title="Workload">
            <div className="card-body">
              <div className="workload">
                {(staff.data ?? []).map((s) => {
                  const { total, done } = loadFor(s.id);
                  return (
                    <div key={s.id} className="workload-row" role="group" aria-label={s.name}>
                      <span className="workload-name">
                        <Avatar name={s.name} size={26} />
                        {s.name.split(' ')[0]}
                      </span>
                      <div className="progress" aria-hidden="true">
                        <span style={{ width: `${(total / maxLoad) * 100}%` }} />
                      </div>
                      <span className="workload-count">
                        {total} {total === 1 ? 'round' : 'rounds'}
                        {done > 0 && <div className="cell-sub">{done} of {total} done</div>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
