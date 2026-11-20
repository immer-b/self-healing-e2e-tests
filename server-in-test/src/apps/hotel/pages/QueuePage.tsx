import { api } from '../api';
import { useEmployee } from '../auth';
import { Icon } from '../components/Icon';
import { Card, EmptyState, ErrorBanner, Loading, PageHeader } from '../components/ui';
import { formatLongDate, useResource } from '../lib';
import { useLiveUpdates } from '../liveUpdates';
import { useHotelUiVersion } from '../uiVersion';
import { QUEUE_LAYOUTS } from './rounds/QueueLayouts';

export function QueuePage(_props: { params: Record<string, string> }) {
  const { employee, today } = useEmployee();
  const version = useHotelUiVersion();
  const { data: tasks, error, reload } = useResource(() => api.myTasks(), []);
  useLiveUpdates(['task'], reload);
  const done = tasks?.filter((t) => t.status === 'completed').length ?? 0;
  const next = tasks?.find((t) => t.status === 'pending');
  const Layout = QUEUE_LAYOUTS[version];

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
        <Layout tasks={tasks} done={done} next={next} />
      )}
    </>
  );
}
