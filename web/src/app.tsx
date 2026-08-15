import React, { lazy, Suspense, useMemo, useState } from 'react';
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
  GitCompare,
  History,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronLeft,
} from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApplicationProvider, useApp, useBoot } from './app-context';
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
  { path: '/turmas', label: 'Turmas', section: 'ACADÊMICO', icon: Users },
  { path: '/alunos', label: 'Alunos', section: 'ACADÊMICO', icon: GraduationCap },
  { path: '/relatorios', label: 'Relatórios', section: 'ACADÊMICO', icon: FileText },
  { path: '/reposicoes/abertas', label: 'Em aberto', shortLabel: 'Abertas', icon: Clock, parent: 'replacements' },
  { path: '/reposicoes/historico', label: 'Histórico', icon: RotateCcw, parent: 'replacements' },
  { path: '/cursos', label: 'Cursos', section: 'CADASTROS', icon: BookOpen, manager: true },
  { path: '/laboratorios', label: 'Laboratórios', section: 'CADASTROS', icon: FlaskConical, manager: true },
  { path: '/bi/institucional', label: 'Institucional', icon: Building2, parent: 'bi' },
  { path: '/bi/frequencia', label: 'Frequência', icon: TrendingUp, parent: 'bi' },
  { path: '/bi/risco', label: 'Risco', icon: AlertTriangle, parent: 'bi' },
  { path: '/bi/reposicoes', label: 'Reposições', icon: CalendarCheck, parent: 'bi' },
  { path: '/bi/cursos-turmas', label: 'Cursos e turmas', icon: Layers, parent: 'bi' },
  { path: '/bi/professores', label: 'Professores', icon: UserCheck, parent: 'bi' },
  { path: '/bi/laboratorios', label: 'Laboratórios', icon: FlaskConical, parent: 'bi' },
  { path: '/bi/qualidade', label: 'Qualidade dos dados', icon: Database, parent: 'bi', manager: true },
  { path: '/usuarios', label: 'Usuários', section: 'SISTEMA', icon: UserCog, admin: true },
  { path: '/conflitos', label: 'Conflitos', section: 'SISTEMA', icon: GitCompare, manager: true },
  { path: '/auditoria', label: 'Auditoria', section: 'SISTEMA', icon: History, manager: true },
];

function allowed(item: Destination, role: Role) {
  return (!item.manager || canManage(role)) && (!item.admin || role === 'admin');
}

const BiInstitutionalPage = lazy(() => import('./features/bi/institutional-page').then((m) => ({ default: m.BiInstitutionalPage })));
const BiAttendancePage = lazy(() => import('./features/bi/attendance-page').then((m) => ({ default: m.BiAttendancePage })));
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
const ReplacementsPage = lazy(() => import('./features/replacements-page').then((m) => ({ default: m.ReplacementsPage })));

const LoadingSpinner = () => (
  <div className="w-full py-12 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
  </div>
);

const deferred = (page: React.ReactNode) => <Suspense fallback={<LoadingSpinner />}>{page}</Suspense>;

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
      <Route path="/relatorios" element={deferred(<ReportsCenterPage />)} />
      <Route path="/reposicoes/abertas" element={deferred(<ReplacementsPage />)} />
      <Route path="/reposicoes/historico" element={deferred(<ReplacementsPage history />)} />
      <Route path="/cursos" element={manager ? deferred(<CoursesPage />) : <Navigate to="/" replace />} />
      <Route path="/cursos/:courseId" element={manager ? deferred(<CourseDetailPage />) : <Navigate to="/" replace />} />
      <Route path="/laboratorios" element={manager ? deferred(<LaboratoriesPage />) : <Navigate to="/" replace />} />
      <Route path="/bi/institucional" element={deferred(<BiInstitutionalPage />)} />
      <Route path="/bi/frequencia" element={deferred(<BiAttendancePage />)} />
      <Route path="/bi/risco" element={deferred(<BiRiskPage />)} />
      <Route path="/bi/reposicoes" element={deferred(<BiReplacementsPage />)} />
      <Route path="/bi/cursos-turmas" element={deferred(<BiCoursesClassesPage />)} />
      <Route path="/bi/professores" element={deferred(<BiTeachersPage />)} />
      <Route path="/bi/laboratorios" element={deferred(<BiLaboratoriesPage />)} />
      <Route path="/bi/qualidade" element={manager ? deferred(<BiDataQualityPage />) : <Navigate to="/" replace />} />
      <Route path="/usuarios" element={session.role === 'admin' ? deferred(<UsersPage />) : <Navigate to="/" replace />} />
      <Route path="/conflitos" element={manager ? deferred(<ConflictsPage />) : <Navigate to="/" replace />} />
      <Route path="/auditoria" element={manager ? deferred(<AuditPage />) : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Shell() {
  const { session, sync, syncState, message, logout } = useApp();
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
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
          nested && !collapsed ? 'ml-3 w-[calc(100%-0.75rem)]' : ''
        } ${
          selected
            ? 'bg-white/10 text-white shadow-xs font-bold'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-sky-400' : 'text-slate-400'}`} />
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
      <div key={parent} className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            if (collapsed) go(items[0]?.path ?? '/');
            else setOpen(!open);
          }}
          aria-expanded={!collapsed ? open : undefined}
          title={collapsed ? label : undefined}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selected
              ? 'bg-white/5 text-white'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          } ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-sky-400' : 'text-slate-400'}`} />
            {!collapsed && <span className="truncate">{label}</span>}
          </div>
          {!collapsed && (
            open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
        </button>
        {!collapsed && open && (
          <div className="flex flex-col gap-1 pl-1">
            {items.map((item) => renderNavItem(item, true))}
          </div>
        )}
      </div>
    );
  };

  const topLevel = destinations.filter((item) => !item.parent);
  const navContent = (
    <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
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
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#090D16] text-slate-200 border-r border-white/5 transition-all duration-200 z-20 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-14 px-3.5 border-b border-white/5">
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-extrabold text-xs">
                ITB
              </div>
              <span className="font-extrabold text-sm tracking-tight text-white truncate">
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

        {/* User Footer */}
        <div className="p-3 border-t border-white/5 bg-[#070A10]">
          <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
              {session.name.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {session.name}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {roleLabel[session.role]}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={() => void logout()}
                title="Sair do sistema"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
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
            <div className="p-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-500/10 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair do sistema</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 sm:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
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

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sync State Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                syncState === 'offline'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : syncState === 'syncing'
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {syncState === 'offline' ? (
                <WifiOff className="w-3 h-3 text-amber-600" />
              ) : (
                <Wifi className="w-3 h-3 text-emerald-600" />
              )}
              <span>{syncState === 'offline' ? 'Offline' : syncState === 'syncing' ? 'Sincronizando' : 'Online'}</span>
            </div>

            {/* Sync Button */}
            <button
              type="button"
              disabled={syncState === 'syncing'}
              onClick={() => void sync()}
              title={syncState === 'syncing' ? 'Sincronizando dados...' : 'Sincronizar agora'}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200 shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
            </button>

            {/* Logout Shortcut */}
            <button
              type="button"
              onClick={() => void logout()}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors cursor-pointer"
            >
              <span>Sair</span>
            </button>
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
