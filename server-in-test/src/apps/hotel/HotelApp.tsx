import { useEffect, type ComponentType } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Icon, type IconName } from './components/Icon';
import { Avatar, Loading, ToastProvider } from './components/ui';
import { ROLE_LABELS } from './lib';
import { Link, matchPath, navigate, usePath } from './router';
import type { Role } from './api';
import { LoginPage } from './pages/LoginPage';
import { ThemeSelect } from './theme';
import { TodayPage } from './pages/TodayPage';
import { SchedulePage } from './pages/SchedulePage';
import { PetsPage } from './pages/PetsPage';
import { PetDetailPage } from './pages/PetDetailPage';
import { OwnersPage } from './pages/OwnersPage';
import { RoomsPage } from './pages/RoomsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { AuditPage } from './pages/AuditPage';
import { QueuePage } from './pages/QueuePage';
import { TaskPage } from './pages/TaskPage';

const DESK: Role[] = ['admin', 'receiving'];

interface RouteDef {
  pattern: string;
  roles: Role[];
  page: ComponentType<{ params: Record<string, string> }>;
  nav?: { label: string; icon: IconName };
}

/** Order matters: it is the sidebar order. */
const ROUTES: RouteDef[] = [
  { pattern: '/today', roles: DESK, page: TodayPage, nav: { label: 'Today', icon: 'today' } },
  { pattern: '/schedule', roles: DESK, page: SchedulePage, nav: { label: 'Schedule', icon: 'schedule' } },
  { pattern: '/pets', roles: DESK, page: PetsPage, nav: { label: 'Pets', icon: 'pets' } },
  { pattern: '/pets/:id', roles: DESK, page: PetDetailPage },
  { pattern: '/owners', roles: DESK, page: OwnersPage, nav: { label: 'Owners', icon: 'owners' } },
  { pattern: '/rooms', roles: DESK, page: RoomsPage, nav: { label: 'Rooms', icon: 'rooms' } },
  { pattern: '/employees', roles: ['admin'], page: EmployeesPage, nav: { label: 'Employees', icon: 'employees' } },
  { pattern: '/audit', roles: ['admin'], page: AuditPage, nav: { label: 'Change log', icon: 'audit' } },
  { pattern: '/queue', roles: ['staff'], page: QueuePage, nav: { label: 'My rounds', icon: 'queue' } },
  { pattern: '/queue/:id', roles: ['staff'], page: TaskPage },
];

const homeFor = (role: Role) => (role === 'staff' ? '/queue' : '/today');

function resolve(path: string, role: Role) {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params && route.roles.includes(role)) return { route, params };
  }
  return undefined;
}

function Shell() {
  const { employee, signOut } = useAuth();
  const path = usePath();
  const match = employee ? resolve(path, employee.role) : undefined;

  useEffect(() => {
    if (employee && !match) navigate(homeFor(employee.role), { replace: true });
  }, [employee, match]);

  if (!employee || !match) return <Loading />;
  const Page = match.route.page;
  const nav = ROUTES.filter((r) => r.nav && r.roles.includes(employee.role));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="pets" size={20} />
          </span>
          <span>
            <strong>Willow</strong> Pet Hotel
          </span>
        </div>
        <nav aria-label="Main">
          {nav.map((r) => (
            <Link key={r.pattern} to={r.pattern} activePrefix className="nav-link">
              <Icon name={r.nav!.icon} />
              {r.nav!.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <Avatar name={employee.name} />
            <div>
              <div className="user-name">{employee.name}</div>
              <div className="user-role">{ROLE_LABELS[employee.role]}</div>
            </div>
          </div>
          <ThemeSelect />
          <button
            type="button"
            className="btn btn-ghost btn-block sidebar-signout"
            onClick={async () => {
              await signOut();
              navigate('/', { replace: true });
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="content" id="main">
        <Page params={match.params} key={path} />
      </main>
    </div>
  );
}

function Gate() {
  const { employee } = useAuth();
  if (employee === undefined) return <Loading label="Checking your session" />;
  if (employee === null) return <LoginPage />;
  return <Shell />;
}

export function HotelApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}
