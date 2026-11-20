import { useState } from 'react';
import { api, type Stay } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Badge, Card, EmptyState, ErrorBanner, Loading, PageHeader, StatCard, useToast } from '../components/ui';
import { ROOM_TONE, STAY_STATUS, SPECIES_LABELS, addDays, formatDate, formatLongDate, nights, plural, useResource } from '../lib';
import { Link } from '../router';

export function DateNav({ date, onChange, today }: { date: string; onChange: (date: string) => void; today: string }) {
  return (
    <div className="date-nav">
      <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        ‹
      </button>
      <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="btn btn-secondary btn-sm" aria-label="Next day" onClick={() => onChange(addDays(date, 1))}>
        ›
      </button>
      {date !== today && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(today)}>
          Today
        </button>
      )}
    </div>
  );
}

export function TodayPage(_props: { params: Record<string, string> }) {
  const { today } = useEmployee();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const dashboard = useResource(() => api.dashboard(date), [date]);
  const arrivals = useResource(() => api.arrivals(date), [date]);
  const departures = useResource(() => api.departures(date), [date]);

  const act = async (action: () => Promise<Stay>, message: (stay: Stay) => string) => {
    try {
      const stay = await action();
      toast(message(stay));
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
    arrivals.reload();
    departures.reload();
    dashboard.reload();
  };

  const summary = dashboard.data;
  return (
    <>
      <PageHeader title="Today" subtitle={formatLongDate(date)} actions={<DateNav date={date} onChange={setDate} today={today} />} />
      {summary && (
        <div className="stats">
          <StatCard label="Arriving today" value={summary.arrivals} icon="arrivals" tone="info" />
          <StatCard label="Leaving today" value={summary.departures} icon="departures" tone="warning" />
          <StatCard label="In the hotel" value={summary.inHouse} hint={`${summary.occupiedRooms} of ${summary.rooms} rooms booked tonight`} icon="rooms" tone="success" />
          <StatCard
            label="Care rounds done"
            value={`${summary.tasks.completed} / ${summary.tasks.total}`}
            hint={summary.tasks.unassigned ? `${summary.tasks.unassigned} unassigned` : 'All assigned'}
            icon="queue"
            tone="accent"
          />
        </div>
      )}
      <div className="stack">
        <StayTable
          title="Arriving today"
          icon="arrivals"
          resource={arrivals}
          empty="No arrivals on this day"
          action={(stay) =>
            isToday && stay.status === 'booked' ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => act(() => api.checkIn(stay.id), (s) => `${s.pet?.name} is checked in`)}>
                Check in
              </button>
            ) : null
          }
        />
        <StayTable
          title="Leaving today"
          icon="departures"
          resource={departures}
          empty="No departures on this day"
          action={(stay) =>
            isToday && stay.status === 'checked_in' ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => act(() => api.checkOut(stay.id), (s) => `${s.pet?.name} is checked out`)}>
                Check out
              </button>
            ) : null
          }
        />
      </div>
    </>
  );
}

function StayTable({
  title,
  icon,
  resource,
  empty,
  action,
}: {
  title: string;
  icon: 'arrivals' | 'departures';
  resource: { data?: Stay[]; error?: string; loading: boolean };
  empty: string;
  action: (stay: Stay) => React.ReactNode;
}) {
  const { data, error, loading } = resource;
  return (
    <Card title={title} actions={data && <span className="count">{data.length} guests</span>}>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Room</th>
                <th>Owner</th>
                <th>Stay</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((stay) => (
                <tr key={stay.id}>
                  <td>
                    <Link to={`/pets/${stay.petId}`} className="cell-title">
                      {stay.pet?.name}
                    </Link>
                    <div className="cell-sub">
                      {stay.pet && `${SPECIES_LABELS[stay.pet.species]} · ${stay.pet.breed}`}
                    </div>
                    {stay.pet?.specialInstructions && (
                      <div className="queue-flag">
                        <Icon name="alert" size={14} />
                        {stay.pet.specialInstructions}
                      </div>
                    )}
                  </td>
                  <td>{stay.room && <Badge tone={ROOM_TONE[stay.room.type]}>{stay.room.name}</Badge>}</td>
                  <td>
                    <div>{stay.owner?.name}</div>
                    <div className="cell-sub">{stay.owner?.phone}</div>
                  </td>
                  <td className="nowrap">
                    {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)}
                    <div className="cell-sub">{plural(nights(stay.checkIn, stay.checkOut), 'night')}</div>
                  </td>
                  <td>
                    <Badge tone={STAY_STATUS[stay.status].tone}>{STAY_STATUS[stay.status].label}</Badge>
                  </td>
                  <td className="cell-actions">{action(stay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={icon} title={empty} />
      )}
    </Card>
  );
}
