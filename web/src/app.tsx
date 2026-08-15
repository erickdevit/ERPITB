import { lazy, Suspense, useMemo, useState } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import ManageHistoryOutlinedIcon from '@mui/icons-material/ManageHistoryOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SyncIcon from '@mui/icons-material/Sync';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import {
  AppBar, Alert, Box, Button, CircularProgress, Collapse, CssBaseline, Drawer,
  IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApplicationProvider, useApp, useBoot } from './app-context';
import { Login } from './login';
import {
  AuditPage, AttendancePage, ClassesPage, ConflictsPage, CoursesPage, LaboratoriesPage,
  ReplacementsPage, ReportsPage, StudentsPage, UsersPage,
} from './pages';
import { ClassDetailPage, CourseDetailPage, StudentDetailPage } from './features/entity-detail-pages';
import { DashboardPage } from './features/dashboard-page';
import { canManage, type Role } from './types';

const theme = createTheme({
  palette: { primary: { main: '#1769AA', dark: '#102A43' }, secondary: { main: '#29B6C8' }, success: { main: '#2E9D65' }, error: { main: '#D64550' }, background: { default: '#F4F7FA', paper: '#FFFFFF' } },
  typography: { fontFamily: 'Roboto, Segoe UI, Arial, sans-serif' },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: { styleOverrides: { root: { boxShadow: 'none', border: '1px solid #D9E2EC' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, borderRadius: 9 } } },
    MuiDialog: { defaultProps: { fullScreen: false } },
  },
});

type Parent = 'replacements' | 'bi';
type Destination = { path: string; label: string; shortLabel?: string; icon: React.ReactNode; manager?: boolean; admin?: boolean; parent?: Parent };

const allDestinations: Destination[] = [
  { path: '/', label: 'Visão geral', icon: <DashboardOutlinedIcon /> },
  { path: '/turmas', label: 'Turmas', icon: <GroupsOutlinedIcon /> },
  { path: '/alunos', label: 'Alunos', icon: <SchoolOutlinedIcon /> },
  { path: '/frequencia', label: 'Frequência', icon: <FactCheckOutlinedIcon /> },
  { path: '/relatorios', label: 'Relatórios', icon: <DescriptionOutlinedIcon /> },
  { path: '/reposicoes/abertas', label: 'Em aberto', shortLabel: 'Abertas', icon: <PendingActionsOutlinedIcon />, parent: 'replacements' },
  { path: '/reposicoes/historico', label: 'Histórico', icon: <HistoryOutlinedIcon />, parent: 'replacements' },
  { path: '/cursos', label: 'Cursos', icon: <MenuBookOutlinedIcon />, manager: true },
  { path: '/laboratorios', label: 'Laboratórios', icon: <ScienceOutlinedIcon />, manager: true },
  { path: '/bi/institucional', label: 'Institucional', icon: <ApartmentOutlinedIcon />, parent: 'bi' },
  { path: '/bi/frequencia', label: 'Frequência', icon: <TrendingUpOutlinedIcon />, parent: 'bi' },
  { path: '/bi/risco', label: 'Risco', icon: <WarningAmberOutlinedIcon />, parent: 'bi' },
  { path: '/bi/reposicoes', label: 'Reposições', icon: <AssignmentTurnedInOutlinedIcon />, parent: 'bi' },
  { path: '/bi/cursos-turmas', label: 'Cursos e turmas', icon: <GroupsOutlinedIcon />, parent: 'bi' },
  { path: '/bi/professores', label: 'Professores', icon: <BadgeOutlinedIcon />, parent: 'bi' },
  { path: '/bi/laboratorios', label: 'Laboratórios', icon: <ScienceOutlinedIcon />, parent: 'bi' },
  { path: '/bi/qualidade', label: 'Qualidade dos dados', icon: <DataObjectOutlinedIcon />, parent: 'bi', manager: true },
  { path: '/usuarios', label: 'Usuários', icon: <ManageAccountsOutlinedIcon />, admin: true },
  { path: '/conflitos', label: 'Conflitos', icon: <CompareArrowsOutlinedIcon />, manager: true },
  { path: '/auditoria', label: 'Auditoria', icon: <ManageHistoryOutlinedIcon />, manager: true },
];

function allowed(item: Destination, role: Role) {
  return (!item.manager || canManage(role)) && (!item.admin || role === 'admin');
}

const BiInstitutionalPage = lazy(() => import('./features/bi/institutional-page').then((module) => ({ default: module.BiInstitutionalPage })));
const BiAttendancePage = lazy(() => import('./features/bi/attendance-page').then((module) => ({ default: module.BiAttendancePage })));
const BiRiskPage = lazy(() => import('./features/bi/risk-page').then((module) => ({ default: module.BiRiskPage })));
const BiReplacementsPage = lazy(() => import('./features/bi/replacements-page').then((module) => ({ default: module.BiReplacementsPage })));
const BiCoursesClassesPage = lazy(() => import('./features/bi/courses-classes-page').then((module) => ({ default: module.BiCoursesClassesPage })));
const BiTeachersPage = lazy(() => import('./features/bi/teachers-page').then((module) => ({ default: module.BiTeachersPage })));
const BiLaboratoriesPage = lazy(() => import('./features/bi/laboratories-page').then((module) => ({ default: module.BiLaboratoriesPage })));
const BiDataQualityPage = lazy(() => import('./features/bi/data-quality-page').then((module) => ({ default: module.BiDataQualityPage })));
const deferred = (page: React.ReactNode) => <Suspense fallback={<LinearProgress aria-label="Carregando módulo" />}>{page}</Suspense>;

function AppRoutes() {
  const { session } = useApp();
  const manager = canManage(session.role);
  return <Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/turmas" element={<ClassesPage />} />
    <Route path="/turmas/:classId" element={<ClassDetailPage />} />
    <Route path="/alunos" element={<StudentsPage />} />
    <Route path="/alunos/:studentId" element={<StudentDetailPage />} />
    <Route path="/frequencia" element={<AttendancePage />} />
    <Route path="/relatorios" element={<ReportsPage />} />
    <Route path="/reposicoes/abertas" element={<ReplacementsPage />} />
    <Route path="/reposicoes/historico" element={<ReplacementsPage history />} />
    <Route path="/cursos" element={manager ? <CoursesPage /> : <Navigate to="/" replace />} />
    <Route path="/cursos/:courseId" element={manager ? <CourseDetailPage /> : <Navigate to="/" replace />} />
    <Route path="/laboratorios" element={manager ? <LaboratoriesPage /> : <Navigate to="/" replace />} />
    <Route path="/bi/institucional" element={deferred(<BiInstitutionalPage />)} />
    <Route path="/bi/frequencia" element={deferred(<BiAttendancePage />)} />
    <Route path="/bi/risco" element={deferred(<BiRiskPage />)} />
    <Route path="/bi/reposicoes" element={deferred(<BiReplacementsPage />)} />
    <Route path="/bi/cursos-turmas" element={deferred(<BiCoursesClassesPage />)} />
    <Route path="/bi/professores" element={deferred(<BiTeachersPage />)} />
    <Route path="/bi/laboratorios" element={deferred(<BiLaboratoriesPage />)} />
    <Route path="/bi/qualidade" element={manager ? deferred(<BiDataQualityPage />) : <Navigate to="/" replace />} />
    <Route path="/usuarios" element={session.role === 'admin' ? <UsersPage /> : <Navigate to="/" replace />} />
    <Route path="/conflitos" element={manager ? <ConflictsPage /> : <Navigate to="/" replace />} />
    <Route path="/auditoria" element={manager ? <AuditPage /> : <Navigate to="/" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

function Shell() {
  const { session, sync, syncState, message, logout } = useApp();
  const location = useLocation(); const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('frequencia-itb-menu-collapsed') === 'true');
  const [replacementsOpen, setReplacementsOpen] = useState(location.pathname.startsWith('/reposicoes'));
  const [biOpen, setBiOpen] = useState(location.pathname.startsWith('/bi'));
  const destinations = useMemo(() => allDestinations.filter((item) => allowed(item, session.role)), [session.role]);
  const exact = destinations.find((item) => location.pathname === item.path);
  const section = destinations.find((item) => item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
  const currentLabel = location.pathname.match(/^\/cursos\//) ? 'Detalhes do curso' : location.pathname.match(/^\/turmas\//) ? 'Detalhes da turma' : location.pathname.match(/^\/alunos\//) ? 'Detalhes do aluno' : exact?.label ?? section?.label ?? 'Frequência ITB';
  const isSelected = (item: Destination) => location.pathname === item.path || (item.path !== '/' && !item.parent && location.pathname.startsWith(`${item.path}/`));
  const go = (path: string) => { navigate(path); setDrawer(false); };
  const toggleCollapsed = () => setCollapsed((value) => { localStorage.setItem('frequencia-itb-menu-collapsed', String(!value)); return !value; });
  const navItem = (item: Destination, nested = false) => <ListItemButton key={item.path} selected={isSelected(item)} onClick={() => go(item.path)} aria-current={isSelected(item) ? 'page' : undefined} sx={{ my: .25, ml: nested && !collapsed ? 2 : 0, minHeight: 44, justifyContent: collapsed ? 'center' : 'initial', borderRadius: 2, '&.Mui-selected': { bgcolor: '#DCF3F7', color: '#102A43' } }}><ListItemIcon sx={{ minWidth: collapsed ? 0 : 42, justifyContent: 'center', color: 'inherit' }}>{item.icon}</ListItemIcon>{!collapsed && <ListItemText primary={item.shortLabel ?? item.label} primaryTypographyProps={{ fontWeight: isSelected(item) ? 800 : 500, fontSize: 14 }} />}</ListItemButton>;
  const tree = (parent: Parent, label: string, icon: React.ReactNode, open: boolean, setOpen: (value: boolean) => void) => {
    const items = destinations.filter((item) => item.parent === parent); const selected = location.pathname.startsWith(`/${parent === 'bi' ? 'bi' : 'reposicoes'}`);
    return <Box key={parent}><Tooltip title={collapsed ? label : ''} placement="right"><ListItemButton selected={selected} onClick={() => { if (collapsed) go(items[0]?.path ?? '/'); else setOpen(!open); }} aria-expanded={!collapsed ? open : undefined} sx={{ my: .25, minHeight: 44, justifyContent: collapsed ? 'center' : 'initial', borderRadius: 2, '&.Mui-selected': { bgcolor: '#DCF3F7', color: '#102A43' } }}><ListItemIcon sx={{ minWidth: collapsed ? 0 : 42, justifyContent: 'center', color: 'inherit' }}>{icon}</ListItemIcon>{!collapsed && <><ListItemText primary={label} primaryTypographyProps={{ fontWeight: selected ? 800 : 500, fontSize: 14 }} />{open ? <ExpandLessIcon /> : <ExpandMoreIcon />}</>}</ListItemButton></Tooltip>{!collapsed && <Collapse in={open} timeout="auto" unmountOnExit>{items.map((item) => navItem(item, true))}</Collapse>}</Box>;
  };
  const topLevel = destinations.filter((item) => !item.parent);
  const nav = <List sx={{ p: 1 }}>{topLevel.map((item) => item.path === '/relatorios' ? <Box key="reports-and-replacements">{navItem(item)}{tree('replacements', 'Reposição', <EventRepeatOutlinedIcon />, replacementsOpen, setReplacementsOpen)}</Box> : item.path === '/usuarios' ? <Box key="bi-and-users">{tree('bi', 'B.I.', <InsightsOutlinedIcon />, biOpen, setBiOpen)}{navItem(item)}</Box> : navItem(item))}{!topLevel.some((item) => item.path === '/usuarios') && tree('bi', 'B.I.', <InsightsOutlinedIcon />, biOpen, setBiOpen)}</List>;
  const desktopWidth = collapsed ? 84 : 264;
  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <Box component="nav" aria-label="Navegação principal" sx={{ width: desktopWidth, flexShrink: 0, display: { xs: 'none', md: 'block' }, bgcolor: '#102A43', color: '#D9E2EC', transition: 'width 180ms ease' }}>
      <Stack direction="row" alignItems="center" justifyContent={collapsed ? 'center' : 'space-between'} sx={{ p: collapsed ? 1.5 : 2.5, minHeight: 82 }}><Box sx={{ display: collapsed ? 'none' : 'block', minWidth: 0 }}><Typography color="white" fontWeight={900} fontSize={20} noWrap>Frequência ITB</Typography><Typography fontSize={12} color="#BCCCDC" noWrap>{session.name}</Typography></Box><Tooltip title={collapsed ? 'Expandir menu' : 'Recolher menu'}><IconButton onClick={toggleCollapsed} sx={{ color: '#D9E2EC' }}>{collapsed ? <MenuIcon /> : <MenuOpenIcon />}</IconButton></Tooltip></Stack>
      <Box sx={{ px: .5, pb: 2, maxHeight: 'calc(100vh - 82px)', overflowY: 'auto' }}>{nav}</Box>
    </Box>
    <Drawer open={drawer} onClose={() => setDrawer(false)} sx={{ display: { md: 'none' } }}><Box sx={{ width: 300, bgcolor: '#102A43', color: '#D9E2EC', minHeight: '100%' }}><Box sx={{ p: 2.5 }}><Typography color="white" fontWeight={900}>Frequência ITB</Typography><Typography fontSize={12}>{session.name}</Typography></Box><Box sx={{ px: .5 }}>{nav}</Box></Box></Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid #D9E2EC' }}><Toolbar><IconButton aria-label="Abrir menu" sx={{ display: { md: 'none' }, mr: 1 }} onClick={() => setDrawer(true)}><MenuIcon /></IconButton><Typography sx={{ flex: 1, color: 'primary.dark', fontWeight: 800 }} noWrap>{currentLabel}</Typography><Tooltip title={syncState === 'syncing' ? 'Sincronizando' : 'Sincronizar agora'}><span><IconButton color={syncState === 'offline' || syncState === 'warning' ? 'warning' : 'primary'} disabled={syncState === 'syncing'} onClick={() => void sync()}>{syncState === 'syncing' ? <CircularProgress size={22} /> : <SyncIcon />}</IconButton></span></Tooltip><Button color="inherit" startIcon={<LogoutIcon />} onClick={() => void logout()} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Sair</Button><Tooltip title="Sair"><IconButton onClick={() => void logout()} sx={{ display: { xs: 'inline-flex', sm: 'none' } }}><LogoutIcon /></IconButton></Tooltip></Toolbar>{syncState === 'syncing' && <LinearProgress />}</AppBar>
      <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }}><AppRoutes /></Box>
    </Box>
    <Snackbar open={Boolean(message)} autoHideDuration={6000} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} sx={{ maxWidth: { xs: 'calc(100vw - 24px)', sm: 520 } }}><Alert severity={syncState === 'error' ? 'error' : syncState === 'offline' || syncState === 'warning' ? 'warning' : 'info'}>{message}</Alert></Snackbar>
  </Box>;
}

export function App() {
  const boot = useBoot(); const [override, setOverride] = useState<typeof boot>(); const state = override ?? boot;
  if (state.loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!state.session || !state.store) return <Login notice={state.error} onLogin={(session, store) => setOverride({ loading: false, session, store })} />;
  return <ApplicationProvider initialSession={state.session} initialStore={state.store} onSignedOut={(notice) => setOverride({ loading: false, error: notice })}><Shell /></ApplicationProvider>;
}

export function Root() { return <ThemeProvider theme={theme}><CssBaseline /><BrowserRouter><App /></BrowserRouter></ThemeProvider>; }
