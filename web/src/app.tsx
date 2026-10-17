import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  GraduationCap,
  Users,
  FileText,
  Clock,
  RotateCcw,
  BookOpen,
  FlaskConical,
  Building2,
  TrendingUp,
  AlertTriangle,
  CalendarCheck,
  Layers,
  UserCheck,
  Database,
  UserCog,
  History,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  User,
  ShieldCheck,
  Award,
} from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApplicationProvider, useApp, useBoot } from './app-context';
import { ErrorBoundary } from './components';
import { Login } from './login';
import { canManage, roleLabel, type Role } from './types';

type Parent = 'replacements' | 'bi';
type Destination = {
  path: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: string;
  manager?: boolean;
  admin?: boolean;
  parent?: Parent;
};

const allDestinations: Destination[] = [
  { path: '/', label: 'Visão geral', section: 'PRINCIPAL', icon: LayoutDashboard },
  { path: '/frequencia', label: 'Chamada', shortLabel: 'Frequência', section: 'PRINCIPAL', icon: ClipboardCheck },
  { path: '/notas', label: 'Notas', section: 'PRINCIPAL', icon: Award },
  { path: '/turmas', label: 'Turmas', section: 'ACADÊMICO', icon: Users },
  { path: '/alunos', label: 'Alunos', section: 'ACADÊMICO', icon: GraduationCap },
  { path: '/relatorios', label: 'Relatórios', section: 'ACADÊMICO', icon: FileText },
  { path: '/reposicoes/abertas', label: 'Em aberto', shortLabel: 'Abertas', icon: Clock, parent: 'replacements' },
  { path: '/reposicoes/historico', label: 'Histórico', icon: RotateCcw, parent: 'replacements' },
  { path: '/cursos', label: 'Cursos', section: 'CADASTROS', icon: BookOpen, manager: true },
  { path: '/laboratorios', label: 'Laboratórios', section: 'CADASTROS', icon: FlaskConical, manager: true },
  { path: '/bi/institucional', label: 'Institucional', icon: Building2, parent: 'bi' },
  { path: '/bi/frequencia', label: 'Frequência', icon: TrendingUp, parent: 'bi' },
  { path: '/bi/notas', label: 'Notas e desempenho', icon: Award, parent: 'bi' },
  { path: '/bi/risco', label: 'Risco', icon: AlertTriangle, parent: 'bi' },
  { path: '/bi/reposicoes', label: 'Reposições', icon: CalendarCheck, parent: 'bi' },
  { path: '/bi/cursos-turmas', label: 'Cursos e turmas', icon: Layers, parent: 'bi' },
  { path: '/bi/professores', label: 'Professores', icon: UserCheck, parent: 'bi' },
  { path: '/bi/laboratorios', label: 'Laboratórios', icon: FlaskConical, parent: 'bi' },
  { path: '/bi/qualidade', label: 'Qualidade dos dados', icon: Database, parent: 'bi', manager: true },
  { path: '/usuarios', label: 'Usuários', section: 'SISTEMA', icon: UserCog, admin: true },
  { path: '/auditoria', label: 'Auditoria', section: 'SISTEMA', icon: History, manager: true },
];

function allowed(item: Destination, role: Role) {
  return (!item.manager || canManage(role)) && (!item.admin || role === 'admin');
}

const BiInstitutionalPage = lazy(() => import('./features/bi/institutional-page').then((m) => ({ default: m.BiInstitutionalPage })));
const BiAttendancePage = lazy(() => import('./features/bi/attendance-page').then((m) => ({ default: m.BiAttendancePage })));
const BiGradesPage = lazy(() => import('./features/bi/grades-page').then((m) => ({ default: m.BiGradesPage })));
const BiRiskPage = lazy(() => import('./features/bi/risk-page').then((m) => ({ default: m.BiRiskPage })));
const BiReplacementsPage = lazy(() => import('./features/bi/replacements-page').then((m) => ({ default: m.BiReplacementsPage })));
const BiCoursesClassesPage = lazy(() => import('./features/bi/courses-classes-page').then((m) => ({ default: m.BiCoursesClassesPage })));
const BiTeachersPage = lazy(() => import('./features/bi/teachers-page').then((m) => ({ default: m.BiTeachersPage })));
const BiLaboratoriesPage = lazy(() => import('./features/bi/laboratories-page').then((m) => ({ default: m.BiLaboratoriesPage })));
const BiDataQualityPage = lazy(() => import('./features/bi/data-quality-page').then((m) => ({ default: m.BiDataQualityPage })));
const DashboardPage = lazy(() => import('./features/dashboard-page').then((m) => ({ default: m.DashboardPage })));
const ClassesPage = lazy(() => import('./features/classes-page').then((m) => ({ default: m.ClassesPage })));
const CourseDetailPage = lazy(() => import('./features/entity-detail-pages').then((m) => ({ default: m.CourseDetailPage })));
const ClassDetailPage = lazy(() => import('./features/entity-detail-pages').then((m) => ({ default: m.ClassDetailPage })));
const StudentDetailPage = lazy(() => import('./features/entity-detail-pages').then((m) => ({ default: m.StudentDetailPage })));
const ReportsCenterPage = lazy(() => import('./features/reports').then((m) => ({ default: m.ReportsCenterPage })));
const ConflictsPage = lazy(() => import('./features/conflicts-page').then((m) => ({ default: m.ConflictsPage })));
const AuditPage = lazy(() => import('./features/audit-page').then((m) => ({ default: m.AuditPage })));
const StudentsPage = lazy(() => import('./features/students-page').then((m) => ({ default: m.StudentsPage })));
const CoursesPage = lazy(() => import('./features/catalog-page').then((m) => ({ default: m.CoursesPage })));
const LaboratoriesPage = lazy(() => import('./features/catalog-page').then((m) => ({ default: m.LaboratoriesPage })));
const UsersPage = lazy(() => import('./features/users-page').then((m) => ({ default: m.UsersPage })));
const AttendancePage = lazy(() => import('./features/attendance-page').then((m) => ({ default: m.AttendancePage })));
const GradesPage = lazy(() => import('./features/grades-page').then((m) => ({ default: m.GradesPage })));
const ReplacementsPage = lazy(() => import('./features/replacements-page').then((m) => ({ default: m.ReplacementsPage })));
const PublicStudentPortal = lazy(() => import('./features/public-student-portal').then((m) => ({ default: m.PublicStudentPortal })));

const LoadingSpinner = () => (
  <div className="w-full py-16 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
  </div>
);

const deferred = (page: React.ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingSpinner />}>{page}</Suspense>
  </ErrorBoundary>
);

function AppRoutes() {
  const { session } = useApp();
  const manager = canManage(session.role);
  return (
    <Routes>
      <Route path="/" element={deferred(<DashboardPage />)} />
      <Route path="/turmas" element={deferred(<ClassesPage />)} />
      <Route path="/turmas/:classId" element={deferred(<ClassDetailPage />)} />
      <Route path="/alunos" element={deferred(<StudentsPage />)} />
      <Route path="/alunos/:studentId" element={deferred(<StudentDetailPage />)} />
      <Route path="/frequencia" element={deferred(<AttendancePage />)} />
      <Route path="/notas" element={deferred(<GradesPage />)} />
      <Route path="/relatorios" element={deferred(<ReportsCenterPage />)} />
      <Route path="/reposicoes" element={<Navigate to="/reposicoes/abertas" replace />} />
      <Route path="/reposicoes/abertas" element={deferred(<ReplacementsPage />)} />
      <Route path="/reposicoes/historico" element={deferred(<ReplacementsPage history />)} />
      <Route path="/cursos" element={manager ? deferred(<CoursesPage />) : <Navigate to="/" replace />} />
      <Route path="/cursos/:courseId" element={manager ? deferred(<CourseDetailPage />) : <Navigate to="/" replace />} />
      <Route path="/laboratorios" element={manager ? deferred(<LaboratoriesPage />) : <Navigate to="/" replace />} />
      <Route path="/bi" element={<Navigate to="/bi/institucional" replace />} />
      <Route path="/bi/institucional" element={deferred(<BiInstitutionalPage />)} />
      <Route path="/bi/frequencia" element={deferred(<BiAttendancePage />)} />
      <Route path="/bi/notas" element={deferred(<BiGradesPage />)} />
      <Route path="/bi/risco" element={deferred(<BiRiskPage />)} />
      <Route path="/bi/reposicoes" element={deferred(<BiReplacementsPage />)} />
      <Route path="/bi/cursos-turmas" element={deferred(<BiCoursesClassesPage />)} />
      <Route path="/bi/professores" element={deferred(<BiTeachersPage />)} />
      <Route path="/bi/laboratorios" element={deferred(<BiLaboratoriesPage />)} />
      <Route path="/bi/qualidade" element={manager ? deferred(<BiDataQualityPage />) : <Navigate to="/" replace />} />
      <Route path="/usuarios" element={session.role === 'admin' ? deferred(<UsersPage />) : <Navigate to="/" replace />} />
      <Route path="/conflitos" element={manager ? deferred(<ConflictsPage />) : <Navigate to="/" replace />} />
      <Route path="/auditoria" element={manager ? deferred(<AuditPage />) : <Navigate to="/" replace />} />
      <Route path="/matricula/:code" element={deferred(<PublicStudentPortal />)} />
      <Route path="/portal/:code" element={deferred(<PublicStudentPortal />)} />
      <Route path="/aluno/:code" element={deferred(<PublicStudentPortal />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function UserDropdown({
  session,
  onLogout,
}: {
  session: { name: string; email: string; role: Role };
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={session.name}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs border border-slate-200 shadow-2xs hover:ring-2 hover:ring-slate-300 transition-all cursor-pointer select-none"
      >
        <span>{session.name.slice(0, 1).toUpperCase()}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-150"
        >
          {/* User Profile Header */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-900 truncate">{session.name}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{session.email}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                <ShieldCheck className="w-3 h-3 text-slate-500" />
                <span>{roleLabel[session.role]}</span>
              </span>
            </div>
          </div>

          {/* Logout Action */}
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Sair do sistema</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { session, message, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('frequencia-itb-menu-collapsed') === 'true');
  const [replacementsOpen, setReplacementsOpen] = useState(location.pathname.startsWith('/reposicoes'));
  const [biOpen, setBiOpen] = useState(location.pathname.startsWith('/bi'));

  const destinations = useMemo(() => allDestinations.filter((item) => allowed(item, session.role)), [session.role]);
  const exact = destinations.find((item) => location.pathname === item.path);
  const section = destinations.find((item) => item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
  const currentLabel = location.pathname.match(/^\/cursos\//)
    ? 'Detalhes do curso'
    : location.pathname.match(/^\/turmas\//)
    ? 'Detalhes da turma'
    : location.pathname.match(/^\/alunos\//)
    ? 'Detalhes do aluno'
    : exact?.label ?? section?.label ?? 'Frequência ITB';

  const isSelected = (item: Destination) =>
    location.pathname === item.path ||
    (item.path !== '/' && !item.parent && location.pathname.startsWith(`${item.path}/`));

  const go = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      localStorage.setItem('frequencia-itb-menu-collapsed', String(!value));
      return !value;
    });

  const renderNavItem = (item: Destination, nested = false) => {
    const selected = isSelected(item);
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => go(item.path)}
        aria-current={selected ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
          nested && !collapsed ? 'ml-2.5 w-[calc(100%-0.625rem)]' : ''
        } ${
          selected
            ? 'bg-white/[0.08] text-white font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] font-medium'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <Icon className={`w-4 h-4 shrink-0 transition-colors ${selected ? 'text-sky-400' : 'text-slate-400'}`} />
        {!collapsed && <span className="truncate">{item.shortLabel ?? item.label}</span>}
      </button>
    );
  };

  const renderTree = (
    parent: Parent,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    open: boolean,
    setOpen: (value: boolean) => void,
  ) => {
    const items = destinations.filter((item) => item.parent === parent);
    const selected = location.pathname.startsWith(`/${parent === 'bi' ? 'bi' : 'reposicoes'}`);

    return (
      <div key={parent} className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            if (collapsed) go(items[0]?.path ?? '/');
            else setOpen(!open);
          }}
          aria-expanded={!collapsed ? open : undefined}
          title={collapsed ? label : undefined}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            selected
              ? 'text-white font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] font-medium'
          } ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-sky-400' : 'text-slate-400'}`} />
            {!collapsed && <span className="truncate">{label}</span>}
          </div>
          {!collapsed && (
            open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>
        {!collapsed && open && (
          <div className="flex flex-col gap-0.5 pl-1.5 border-l border-white/5 ml-3 my-0.5">
            {items.map((item) => renderNavItem(item, true))}
          </div>
        )}
      </div>
    );
  };

  const topLevel = destinations.filter((item) => !item.parent);
  const navContent = (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {topLevel.map((item) =>
        item.path === '/relatorios' ? (
          <React.Fragment key="reports-and-replacements">
            {renderNavItem(item)}
            {renderTree('replacements', 'Reposições', Clock, replacementsOpen, setReplacementsOpen)}
          </React.Fragment>
        ) : item.path === '/usuarios' ? (
          <React.Fragment key="bi-and-users">
            {renderTree('bi', 'Analytics B.I', TrendingUp, biOpen, setBiOpen)}
            {renderNavItem(item)}
          </React.Fragment>
        ) : (
          renderNavItem(item)
        ),
      )}
      {!topLevel.some((item) => item.path === '/usuarios') &&
        renderTree('bi', 'Analytics B.I', TrendingUp, biOpen, setBiOpen)}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 bg-[#090D16] text-slate-200 border-r border-white/5 transition-all duration-200 z-20 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-14 px-3.5 border-b border-white/5">
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-xs">
                ITB
              </div>
              <span className="font-bold text-sm tracking-tight text-white truncate">
                Frequência ITB
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer mx-auto md:mx-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          {navContent}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-[#090D16] text-white flex flex-col h-full z-10 shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-sm tracking-tight text-white">
                  Frequência ITB
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {session.name} • {roleLabel[session.role]}
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {navContent}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-20 shrink-0 flex items-center justify-between h-14 px-4 sm:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 md:hidden transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
              {currentLabel}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Profile Avatar with Dropdown */}
            <UserDropdown
              session={session}
              onLogout={logout}
            />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <AppRoutes />
        </main>
      </div>

      {/* Global Toast / Snackbar */}
      {message && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md p-4 rounded-xl bg-slate-900 text-white shadow-xl text-xs font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

export function App() {
  const location = useLocation();
  const isPublicPortalRoute = /^\/(?:matricula|portal|aluno|public\/student|public\/matricula)\/([^/]+)/i.test(location.pathname);

  if (isPublicPortalRoute) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/matricula/:code" element={<PublicStudentPortal />} />
            <Route path="/portal/:code" element={<PublicStudentPortal />} />
            <Route path="/aluno/:code" element={<PublicStudentPortal />} />
            <Route path="/public/student/:code" element={<PublicStudentPortal />} />
            <Route path="/public/matricula/:code" element={<PublicStudentPortal />} />
            <Route path="*" element={<PublicStudentPortal />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  const boot = useBoot();
  const [override, setOverride] = useState<typeof boot>();
  const state = override ?? boot;

  if (state.loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!state.session || !state.store) {
    return (
      <Login
        notice={state.error}
        onLogin={(session, store) => setOverride({ loading: false, session, store })}
      />
    );
  }

  return (
    <ApplicationProvider
      initialSession={state.session}
      initialStore={state.store}
      onSignedOut={(notice) => setOverride({ loading: false, error: notice })}
    >
      <Shell />
    </ApplicationProvider>
  );
}

export function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
