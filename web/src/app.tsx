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
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import WifiOffOutlinedIcon from '@mui/icons-material/WifiOffOutlined';
import {
  AppBar, Alert, Avatar, Box, Button, Chip, CircularProgress, Collapse, CssBaseline, Drawer,
  IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApplicationProvider, useApp, useBoot } from './app-context';
import { Login } from './login';
import { canManage, roleLabel, type Role } from './types';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0F172A', dark: '#020617', light: '#334155' },
    secondary: { main: '#2563EB', light: '#EFF6FF' },
    success: { main: '#10B981', light: '#ECFDF5', dark: '#047857' },
    error: { main: '#F43F5E', light: '#FFF1F2', dark: '#BE123C' },
    warning: { main: '#F59E0B', light: '#FFFBEB', dark: '#B45309' },
    info: { main: '#0284C7', light: '#F0F9FF', dark: '#0369A1' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text: { primary: '#0F172A', secondary: '#64748B' },
    divider: '#E2E8F0',
  },
  typography: {
    fontFamily: '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em' },
    h5: { fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' },
    h6: { fontWeight: 750, color: '#0F172A', letterSpacing: '-0.015em' },
    subtitle1: { fontWeight: 650, color: '#0F172A', letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600, color: '#0F172A', letterSpacing: '-0.01em' },
    body1: { color: '#334155', fontSize: '0.9375rem', lineHeight: 1.5 },
    body2: { color: '#64748B', fontSize: '0.875rem', lineHeight: 1.45 },
    caption: { color: '#64748B', fontSize: '0.75rem', letterSpacing: '-0.005em' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '-0.01em' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F8FAFC',
          color: '#0F172A',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#FFFFFF',
          boxShadow: 'none',
          border: '1px solid #E2E8F0',
          borderRadius: 10,
          transition: 'border-color 0.15s ease',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 7,
          fontSize: '0.875rem',
          boxShadow: 'none',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          '&:hover': {
            backgroundColor: '#1E293B',
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: '#E2E8F0',
          color: '#334155',
          backgroundColor: '#FFFFFF',
          '&:hover': {
            borderColor: '#CBD5E1',
            backgroundColor: '#F8FAFC',
            color: '#0F172A',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.75rem',
          height: 24,
        },
      },
    },
    MuiDialog: {
      defaultProps: { fullScreen: false },
      styleOverrides: {
        paper: {
          borderRadius: 14,
          boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
          border: '1px solid #E2E8F0',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          backgroundColor: '#FFFFFF',
          fontSize: '0.875rem',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E2E8F0',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#CBD5E1',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#0F172A',
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          color: '#64748B',
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '10px 14px',
        },
        body: {
          color: '#334155',
          borderBottom: '1px solid #F1F5F9',
          fontSize: 13,
          padding: '11px 14px',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontSize: '0.875rem',
          border: '1px solid transparent',
        },
        standardSuccess: {
          backgroundColor: '#ECFDF5',
          color: '#065F46',
          borderColor: '#A7F3D0',
        },
        standardWarning: {
          backgroundColor: '#FFFBEB',
          color: '#92400E',
          borderColor: '#FDE68A',
        },
        standardError: {
          backgroundColor: '#FFF1F2',
          color: '#9F1239',
          borderColor: '#FECDD3',
        },
        standardInfo: {
          backgroundColor: '#F0F9FF',
          color: '#075985',
          borderColor: '#BAE6FD',
        },
      },
    },
  },
});

type Parent = 'replacements' | 'bi';
type Destination = { path: string; label: string; shortLabel?: string; icon: React.ReactNode; section?: string; manager?: boolean; admin?: boolean; parent?: Parent };

const allDestinations: Destination[] = [
  { path: '/', label: 'Visão geral', section: 'PRINCIPAL', icon: <DashboardOutlinedIcon /> },
  { path: '/frequencia', label: 'Chamada', shortLabel: 'Frequência', section: 'PRINCIPAL', icon: <FactCheckOutlinedIcon /> },
  { path: '/turmas', label: 'Turmas', section: 'ACADÊMICO', icon: <GroupsOutlinedIcon /> },
  { path: '/alunos', label: 'Alunos', section: 'ACADÊMICO', icon: <SchoolOutlinedIcon /> },
  { path: '/relatorios', label: 'Relatórios', section: 'ACADÊMICO', icon: <DescriptionOutlinedIcon /> },
  { path: '/reposicoes/abertas', label: 'Em aberto', shortLabel: 'Abertas', icon: <PendingActionsOutlinedIcon />, parent: 'replacements' },
  { path: '/reposicoes/historico', label: 'Histórico', icon: <HistoryOutlinedIcon />, parent: 'replacements' },
  { path: '/cursos', label: 'Cursos', section: 'CADASTROS', icon: <MenuBookOutlinedIcon />, manager: true },
  { path: '/laboratorios', label: 'Laboratórios', section: 'CADASTROS', icon: <ScienceOutlinedIcon />, manager: true },
  { path: '/bi/institucional', label: 'Institucional', icon: <ApartmentOutlinedIcon />, parent: 'bi' },
  { path: '/bi/frequencia', label: 'Frequência', icon: <TrendingUpOutlinedIcon />, parent: 'bi' },
  { path: '/bi/risco', label: 'Risco', icon: <WarningAmberOutlinedIcon />, parent: 'bi' },
  { path: '/bi/reposicoes', label: 'Reposições', icon: <AssignmentTurnedInOutlinedIcon />, parent: 'bi' },
  { path: '/bi/cursos-turmas', label: 'Cursos e turmas', icon: <GroupsOutlinedIcon />, parent: 'bi' },
  { path: '/bi/professores', label: 'Professores', icon: <BadgeOutlinedIcon />, parent: 'bi' },
  { path: '/bi/laboratorios', label: 'Laboratórios', icon: <ScienceOutlinedIcon />, parent: 'bi' },
  { path: '/bi/qualidade', label: 'Qualidade dos dados', icon: <DataObjectOutlinedIcon />, parent: 'bi', manager: true },
  { path: '/usuarios', label: 'Usuários', section: 'SISTEMA', icon: <ManageAccountsOutlinedIcon />, admin: true },
  { path: '/conflitos', label: 'Conflitos', section: 'SISTEMA', icon: <CompareArrowsOutlinedIcon />, manager: true },
  { path: '/auditoria', label: 'Auditoria', section: 'SISTEMA', icon: <ManageHistoryOutlinedIcon />, manager: true },
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
const DashboardPage = lazy(() => import('./features/dashboard-page').then((module) => ({ default: module.DashboardPage })));
const ClassesPage = lazy(() => import('./features/classes-page').then((module) => ({ default: module.ClassesPage })));
const CourseDetailPage = lazy(() => import('./features/entity-detail-pages').then((module) => ({ default: module.CourseDetailPage })));
const ClassDetailPage = lazy(() => import('./features/entity-detail-pages').then((module) => ({ default: module.ClassDetailPage })));
const StudentDetailPage = lazy(() => import('./features/entity-detail-pages').then((module) => ({ default: module.StudentDetailPage })));
const ReportsCenterPage = lazy(() => import('./features/reports').then((module) => ({ default: module.ReportsCenterPage })));
const ConflictsPage = lazy(() => import('./features/conflicts-page').then((module) => ({ default: module.ConflictsPage })));
const AuditPage = lazy(() => import('./features/audit-page').then((module) => ({ default: module.AuditPage })));
const StudentsPage = lazy(() => import('./features/students-page').then((module) => ({ default: module.StudentsPage })));
const CoursesPage = lazy(() => import('./features/catalog-page').then((module) => ({ default: module.CoursesPage })));
const LaboratoriesPage = lazy(() => import('./features/catalog-page').then((module) => ({ default: module.LaboratoriesPage })));
const UsersPage = lazy(() => import('./features/users-page').then((module) => ({ default: module.UsersPage })));
const AttendancePage = lazy(() => import('./features/attendance-page').then((module) => ({ default: module.AttendancePage })));
const ReplacementsPage = lazy(() => import('./features/replacements-page').then((module) => ({ default: module.ReplacementsPage })));
const deferred = (page: React.ReactNode) => <Suspense fallback={<LinearProgress aria-label="Carregando módulo" sx={{ height: 2 }} />}>{page}</Suspense>;

function AppRoutes() {
  const { session } = useApp();
  const manager = canManage(session.role);
  return <Routes>
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
  </Routes>;
}

function Shell() {
  const { session, sync, syncState, message, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
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

  const navItem = (item: Destination, nested = false) => {
    const selected = isSelected(item);
    return (
      <ListItemButton
        key={item.path}
        selected={selected}
        onClick={() => go(item.path)}
        aria-current={selected ? 'page' : undefined}
        sx={{
          my: 0.25,
          ml: nested && !collapsed ? 1.5 : 0,
          minHeight: 36,
          py: 0.65,
          px: 1.25,
          justifyContent: collapsed ? 'center' : 'initial',
          borderRadius: 2,
          color: selected ? '#FFFFFF' : '#94A3B8',
          bgcolor: selected ? '#1E293B' : 'transparent',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            bgcolor: selected ? '#1E293B' : 'rgba(255, 255, 255, 0.05)',
            color: '#FFFFFF',
          },
          '&.Mui-selected': {
            bgcolor: '#1E293B',
            color: '#FFFFFF',
            '&:hover': { bgcolor: '#27354A' },
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: collapsed ? 0 : 30, justifyContent: 'center', color: selected ? '#38BDF8' : '#94A3B8', '& svg': { fontSize: 18 } }}>
          {item.icon}
        </ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={item.shortLabel ?? item.label}
            primaryTypographyProps={{
              fontWeight: selected ? 650 : 500,
              fontSize: 13,
              letterSpacing: '-0.01em',
            }}
          />
        )}
      </ListItemButton>
    );
  };

  const tree = (parent: Parent, label: string, icon: React.ReactNode, open: boolean, setOpen: (value: boolean) => void) => {
    const items = destinations.filter((item) => item.parent === parent);
    const selected = location.pathname.startsWith(`/${parent === 'bi' ? 'bi' : 'reposicoes'}`);
    return (
      <Box key={parent}>
        <Tooltip title={collapsed ? label : ''} placement="right">
          <ListItemButton
            selected={selected}
            onClick={() => { if (collapsed) go(items[0]?.path ?? '/'); else setOpen(!open); }}
            aria-expanded={!collapsed ? open : undefined}
            sx={{
              my: 0.25,
              minHeight: 36,
              py: 0.65,
              px: 1.25,
              justifyContent: collapsed ? 'center' : 'initial',
              borderRadius: 2,
              color: selected ? '#FFFFFF' : '#94A3B8',
              bgcolor: selected ? 'rgba(30, 41, 59, 0.7)' : 'transparent',
              transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)', color: '#FFFFFF' },
              '&.Mui-selected': {
                bgcolor: 'rgba(30, 41, 59, 0.7)',
                color: '#FFFFFF',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 30, justifyContent: 'center', color: selected ? '#38BDF8' : '#94A3B8', '& svg': { fontSize: 18 } }}>
              {icon}
            </ListItemIcon>
            {!collapsed && (
              <>
                <ListItemText primary={label} primaryTypographyProps={{ fontWeight: selected ? 650 : 500, fontSize: 13, letterSpacing: '-0.01em' }} />
                {open ? <ExpandLessIcon sx={{ fontSize: 17, color: '#64748B' }} /> : <ExpandMoreIcon sx={{ fontSize: 17, color: '#64748B' }} />}
              </>
            )}
          </ListItemButton>
        </Tooltip>
        {!collapsed && <Collapse in={open} timeout="auto" unmountOnExit>{items.map((item) => navItem(item, true))}</Collapse>}
      </Box>
    );
  };

  const topLevel = destinations.filter((item) => !item.parent);
  const nav = (
    <List sx={{ p: 1 }}>
      {topLevel.map((item) =>
        item.path === '/relatorios' ? (
          <Box key="reports-and-replacements">
            {navItem(item)}
            {tree('replacements', 'Reposição', <EventRepeatOutlinedIcon />, replacementsOpen, setReplacementsOpen)}
          </Box>
        ) : item.path === '/usuarios' ? (
          <Box key="bi-and-users">
            {tree('bi', 'Analytics B.I', <InsightsOutlinedIcon />, biOpen, setBiOpen)}
            {navItem(item)}
          </Box>
        ) : (
          navItem(item)
        ),
      )}
      {!topLevel.some((item) => item.path === '/usuarios') && tree('bi', 'Analytics B.I', <InsightsOutlinedIcon />, biOpen, setBiOpen)}
    </List>
  );

  const desktopWidth = collapsed ? 68 : 230;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="nav"
        aria-label="Navegação principal"
        sx={{
          width: desktopWidth,
          flexShrink: 0,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          bgcolor: '#0B0F17',
          color: '#E2E8F0',
          transition: 'width 180ms cubic-bezier(0.4, 0, 0.2, 1)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          zIndex: 10,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent={collapsed ? 'center' : 'space-between'}
          sx={{ px: collapsed ? 1 : 2, py: 1.5, minHeight: 52, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <Box sx={{ display: collapsed ? 'none' : 'block', minWidth: 0 }}>
            <Typography color="#FFFFFF" fontWeight={800} fontSize={15} letterSpacing="-0.025em" noWrap>
              Frequência ITB
            </Typography>
          </Box>
          <Tooltip title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            <IconButton onClick={toggleCollapsed} size="small" sx={{ color: '#64748B', '&:hover': { color: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.06)' } }}>
              {collapsed ? <MenuIcon sx={{ fontSize: 18 }} /> : <MenuOpenIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        </Stack>

        <Box sx={{ px: 0.5, py: 1, flex: 1, overflowY: 'auto' }}>
          {nav}
        </Box>

        <Box sx={{ p: 1.25, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Stack direction="row" alignItems="center" spacing={1} justifyContent={collapsed ? 'center' : 'flex-start'}>
            <Avatar sx={{ width: 28, height: 28, bgcolor: '#1E293B', color: '#38BDF8', fontSize: 12, fontWeight: 750 }}>
              {session.name.slice(0, 1).toUpperCase()}
            </Avatar>
            {!collapsed && (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize={12} fontWeight={650} color="#FFFFFF" noWrap sx={{ lineHeight: 1.2 }}>
                  {session.name}
                </Typography>
                <Typography fontSize={10.5} color="#64748B" noWrap>
                  {roleLabel[session.role]}
                </Typography>
              </Box>
            )}
            {!collapsed && (
              <Tooltip title="Sair do sistema">
                <IconButton size="small" onClick={() => void logout()} sx={{ color: '#64748B', '&:hover': { color: '#F43F5E' } }}>
                  <LogoutIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        sx={{ display: { md: 'none' } }}
        PaperProps={{
          sx: {
            width: 260,
            bgcolor: '#0B0F17',
            color: '#E2E8F0',
          },
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Typography color="#FFFFFF" fontWeight={800} fontSize={15} letterSpacing="-0.02em">
            Frequência ITB
          </Typography>
          <Typography fontSize={11.5} color="#64748B" sx={{ mt: 0.25 }}>
            {session.name} • {roleLabel[session.role]}
          </Typography>
        </Box>
        <Box sx={{ px: 0.5, py: 0.75 }}>{nav}</Box>
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            color: '#0F172A',
            zIndex: 5,
          }}
        >
          <Toolbar sx={{ minHeight: '52px !important', px: { xs: 2, sm: 3 } }}>
            <IconButton
              aria-label="Abrir menu"
              size="small"
              sx={{ display: { md: 'none' }, mr: 1.5, color: '#0F172A' }}
              onClick={() => setDrawer(true)}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ flex: 1, color: '#0F172A', fontWeight: 750, fontSize: { xs: 14.5, sm: 15.5 }, letterSpacing: '-0.015em' }} noWrap>
              {currentLabel}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                size="small"
                icon={syncState === 'offline' ? <WifiOffOutlinedIcon sx={{ fontSize: '13px !important' }} /> : <WifiOutlinedIcon sx={{ fontSize: '13px !important' }} />}
                label={syncState === 'offline' ? 'Offline' : syncState === 'syncing' ? 'Sincronizando' : 'Online'}
                sx={{
                  height: 22,
                  fontSize: 10.5,
                  fontWeight: 650,
                  bgcolor: syncState === 'offline' ? '#FFFBEB' : '#ECFDF5',
                  color: syncState === 'offline' ? '#B45309' : '#047857',
                  border: `1px solid ${syncState === 'offline' ? '#FDE68A' : '#A7F3D0'}`,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
              <Tooltip title={syncState === 'syncing' ? 'Sincronizando dados...' : 'Sincronizar agora'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={syncState === 'syncing'}
                    onClick={() => void sync()}
                    sx={{
                      color: '#64748B',
                      bgcolor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      width: 32,
                      height: 32,
                      '&:hover': { color: '#0F172A', bgcolor: '#F1F5F9' },
                    }}
                  >
                    {syncState === 'syncing' ? <CircularProgress size={14} color="inherit" /> : <SyncIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Sair do sistema">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void logout()}
                  sx={{
                    ml: 0.5,
                    px: 1.5,
                    py: 0.4,
                    minHeight: 30,
                    fontSize: 12,
                    color: '#64748B',
                    borderColor: '#E2E8F0',
                    display: { xs: 'none', sm: 'inline-flex' },
                    '&:hover': { color: '#F43F5E', borderColor: '#FECDD3', bgcolor: '#FFF1F2' },
                  }}
                >
                  Sair
                </Button>
              </Tooltip>
            </Stack>
          </Toolbar>
          {syncState === 'syncing' && <LinearProgress sx={{ height: 2 }} />}
        </AppBar>

        <Box component="main" sx={{ p: { xs: 2, sm: 2.5, md: 3 }, maxWidth: 1400, width: '100%', mx: 'auto', flex: 1 }}>
          <AppRoutes />
        </Box>
      </Box>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={6000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ maxWidth: { xs: 'calc(100vw - 24px)', sm: 440 } }}
      >
        <Alert
          variant="filled"
          severity={syncState === 'error' ? 'error' : syncState === 'offline' || syncState === 'warning' ? 'warning' : 'info'}
          sx={{ borderRadius: 2, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)' }}
        >
          {message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export function App() {
  const boot = useBoot();
  const [override, setOverride] = useState<typeof boot>();
  const state = override ?? boot;
  if (state.loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F8FAFC' }}>
        <CircularProgress size={36} thickness={4} sx={{ color: '#0F172A' }} />
      </Box>
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  );
}
