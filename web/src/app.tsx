import { useMemo, useState } from 'react';
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
import SyncIcon from '@mui/icons-material/Sync';
import { AppBar, Alert, Box, Button, CircularProgress, Collapse, CssBaseline, Drawer, IconButton, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Toolbar, Tooltip, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ApplicationProvider, useApp, useBoot } from './app-context';
import { Login } from './login';
import { AuditPage, AttendancePage, ClassesPage, ConflictsPage, CoursesPage, DashboardPage, LaboratoriesPage, ReplacementsPage, ReportsPage, StudentsPage, UsersPage } from './pages';
import { canManage } from './types';

const theme = createTheme({
  palette: { primary: { main: '#1769AA', dark: '#102A43' }, secondary: { main: '#29B6C8' }, success: { main: '#2E9D65' }, error: { main: '#D64550' }, background: { default: '#F4F7FA', paper: '#FFFFFF' } },
  typography: { fontFamily: 'Roboto, Segoe UI, Arial, sans-serif' },
  shape: { borderRadius: 14 },
  components: { MuiCard: { styleOverrides: { root: { boxShadow: 'none', border: '1px solid #D9E2EC' } } }, MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, borderRadius: 10 } } } },
});

type Destination = { key: string; label: string; icon: React.ReactNode; page: React.ReactNode; manager?: boolean; admin?: boolean; parent?: 'replacements' };
function Shell() {
  const { session, sync, syncState, message, logout } = useApp(); const [active, setActive] = useState('dashboard'); const [drawer, setDrawer] = useState(false); const [replacementsOpen, setReplacementsOpen] = useState(true);
  const destinations = useMemo<Destination[]>(() => [
    { key: 'dashboard', label: 'Visão geral', icon: <DashboardOutlinedIcon />, page: <DashboardPage /> }, { key: 'classes', label: 'Turmas', icon: <GroupsOutlinedIcon />, page: <ClassesPage /> },
    { key: 'students', label: 'Alunos', icon: <SchoolOutlinedIcon />, page: <StudentsPage /> }, { key: 'attendance', label: 'Frequência', icon: <FactCheckOutlinedIcon />, page: <AttendancePage /> },
    { key: 'reports', label: 'Relatórios', icon: <DescriptionOutlinedIcon />, page: <ReportsPage /> }, { key: 'replacements-open', label: 'Reposições em aberto', icon: <PendingActionsOutlinedIcon />, page: <ReplacementsPage /> , parent: 'replacements' as const }, { key: 'replacements-history', label: 'Histórico de reposições', icon: <HistoryOutlinedIcon />, page: <ReplacementsPage history />, parent: 'replacements' as const },
    { key: 'courses', label: 'Cursos', icon: <MenuBookOutlinedIcon />, page: <CoursesPage />, manager: true }, { key: 'laboratories', label: 'Laboratórios', icon: <ScienceOutlinedIcon />, page: <LaboratoriesPage />, manager: true },
    { key: 'users', label: 'Usuários', icon: <ManageAccountsOutlinedIcon />, page: <UsersPage />, admin: true }, { key: 'conflicts', label: 'Conflitos', icon: <CompareArrowsOutlinedIcon />, page: <ConflictsPage />, manager: true }, { key: 'audit', label: 'Auditoria', icon: <ManageHistoryOutlinedIcon />, page: <AuditPage />, manager: true },
  ].filter((item) => (!item.manager || canManage(session.role)) && (!item.admin || session.role === 'admin')), [session.role]);
  const current = destinations.find((item) => item.key === active) ?? destinations[0]!;
  const navItem = (item: Destination, nested = false) => <ListItemButton key={item.key} selected={item.key === current.key} onClick={() => { setActive(item.key); setDrawer(false); }} sx={{ my: .5, ml: nested ? 2 : 0, borderRadius: 2, color: item.key === current.key ? 'primary.dark' : 'inherit', '&.Mui-selected': { bgcolor: '#DCF3F7' } }}><ListItemIcon sx={{ minWidth: 42, color: 'inherit' }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: item.key === current.key ? 800 : 500 }} /></ListItemButton>;
  const replacementItems = destinations.filter((item) => item.parent === 'replacements');
  const nav = <List sx={{ p: 1 }}>{destinations.filter((item) => !item.parent).map((item) => item.key === 'reports' ? <Box key="replacements-tree">{navItem(item)}<ListItemButton selected={active.startsWith('replacements-')} onClick={() => { setReplacementsOpen((value) => !value); if (!active.startsWith('replacements-')) setActive('replacements-open'); }} sx={{ my: .5, borderRadius: 2, color: active.startsWith('replacements-') ? 'primary.dark' : 'inherit', '&.Mui-selected': { bgcolor: '#DCF3F7' } }}><ListItemIcon sx={{ minWidth: 42, color: 'inherit' }}><EventRepeatOutlinedIcon /></ListItemIcon><ListItemText primary="Reposição" primaryTypographyProps={{ fontWeight: 800 }} />{replacementsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</ListItemButton><Collapse in={replacementsOpen} timeout="auto" unmountOnExit>{replacementItems.map((child) => navItem(child, true))}</Collapse></Box> : navItem(item))}</List>;
  return <Box sx={{ display: 'flex', minHeight: '100vh' }}><Box component="nav" sx={{ width: 250, flexShrink: 0, display: { xs: 'none', md: 'block' }, bgcolor: '#102A43', color: '#FFF' }}><Box sx={{ p: 3 }}><Typography fontWeight={900} fontSize={22}>Frequência ITB</Typography><Typography fontSize={13} sx={{ color: '#BCCCDC' }}>{session.name}</Typography></Box><Box sx={{ mx: 1, '& .MuiListItemButton-root': { color: '#D9E2EC' }, '& .MuiListItemButton-root.Mui-selected': { color: '#102A43' } }}>{nav}</Box></Box><Drawer open={drawer} onClose={() => setDrawer(false)} sx={{ display: { md: 'none' } }}>{<Box sx={{ width: 290, bgcolor: '#102A43', minHeight: '100%', color: '#FFF' }}><Box sx={{ p: 3 }}><Typography fontWeight={900}>Frequência ITB</Typography><Typography fontSize={13}>{session.name}</Typography></Box><Box sx={{ bgcolor: '#FFF', color: '#102A43', minHeight: 'calc(100vh - 84px)' }}>{nav}</Box></Box>}</Drawer><Box sx={{ flex: 1, minWidth: 0 }}><AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid #D9E2EC' }}><Toolbar><IconButton sx={{ display: { md: 'none' }, mr: 1 }} onClick={() => setDrawer(true)}><MenuIcon /></IconButton><Typography sx={{ flex: 1, color: 'primary.dark', fontWeight: 800 }}>{current.label}</Typography><Tooltip title={syncState === 'syncing' ? 'Sincronizando' : 'Sincronizar agora'}><span><IconButton color={syncState === 'offline' || syncState === 'warning' ? 'warning' : 'primary'} disabled={syncState === 'syncing'} onClick={() => void sync()}>{syncState === 'syncing' ? <CircularProgress size={22} /> : <SyncIcon />}</IconButton></span></Tooltip><Button color="inherit" startIcon={<LogoutIcon />} onClick={() => void logout()}>Sair</Button></Toolbar>{syncState === 'syncing' && <LinearProgress />}</AppBar><Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }}>{current.page}</Box></Box><Snackbar open={Boolean(message)} autoHideDuration={6000}><Alert severity={syncState === 'error' ? 'error' : syncState === 'offline' || syncState === 'warning' ? 'warning' : 'info'}>{message}</Alert></Snackbar></Box>;
}

export function App() {
  const boot = useBoot(); const [override, setOverride] = useState<typeof boot>(); const state = override ?? boot;
  if (state.loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!state.session || !state.store) return <Login notice={state.error} onLogin={(session, store) => setOverride({ loading: false, session, store })} />;
  return <ApplicationProvider initialSession={state.session} initialStore={state.store} onSignedOut={(notice) => setOverride({ loading: false, error: notice })}><Shell /></ApplicationProvider>;
}

export function Root() { return <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>; }
