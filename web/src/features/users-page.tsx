import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, LinearProgress, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useApp } from '../app-context';
import { ErrorNotice, PageDialog, Section, SelectField } from '../components';
import type { LocalRecord, Role } from '../types';
import { roleLabel } from '../types';
import { filterUsers } from './directory-model';

const identifier = () => crypto.randomUUID();
const text = (record: LocalRecord | undefined, key: string) => String(record?.[key] ?? '');
const enabled = (record: LocalRecord) => record.active !== 0 && record.active !== false;
type UserForm = { name: string; email: string; password: string; role: Role; active: 'true' | 'false' };
const emptyForm = (): UserForm => ({ name: '', email: '', password: '', role: 'professor', active: 'true' });

export function UsersPage() {
  const { api, session } = useApp();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [users, setUsers] = useState<LocalRecord[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [editing, setEditing] = useState<LocalRecord>();
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => filterUsers(users, query, role, active), [active, query, role, users]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api.get<{ items: LocalRecord[] }>('/users')).items);
      setNotice(undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (session.role === 'admin') void load();
  }, [load, session.role]);

  if (session.role !== 'admin') return <ErrorNotice>Somente administradores podem gerenciar usuários.</ErrorNotice>;

  const edit = (user?: LocalRecord) => {
    setEditing(user ?? { id: identifier() });
    setForm(
      user
        ? {
            name: text(user, 'name'),
            email: text(user, 'email'),
            password: '',
            role: text(user, 'role') as Role,
            active: enabled(user) ? 'true' : 'false',
          }
        : emptyForm(),
    );
    setNotice(undefined);
  };

  const save = async () => {
    if (!editing || busy) return;
    if (!form.name.trim() || !form.email.trim() || (!editing.created_at && form.password.length < 6)) {
      setNotice('Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: form.active === 'true',
        ...(form.password ? { password: form.password } : {}),
      };
      if (editing.created_at) await api.request(`/users/${editing.id}`, 'PATCH', payload);
      else await api.post('/users', payload);
      setEditing(undefined);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar o usuário.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user: LocalRecord) => {
    if (user.id === session.id) {
      setNotice('Você não pode inativar seu próprio usuário.');
      return;
    }
    if (!window.confirm(`Inativar ${text(user, 'name')}? O histórico e os vínculos serão preservados.`)) return;
    try {
      await api.request(`/users/${user.id}`, 'DELETE');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível inativar o usuário.');
    }
  };

  const actions = (user: LocalRecord) => (
    <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
      <Tooltip title="Editar">
        <IconButton aria-label={`Editar ${text(user, 'name')}`} onClick={() => edit(user)} size="small">
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {enabled(user) && user.id !== session.id && (
        <Tooltip title="Inativar">
          <IconButton color="error" aria-label={`Inativar ${text(user, 'name')}`} onClick={() => void remove(user)} size="small">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );

  return (
    <Section
      title="Usuários"
      subtitle="Controle de acessos, perfis e contas institucionais"
      action={
        <Stack direction="row" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon fontSize="small" />}
            onClick={() => void load()}
            disabled={loading}
            sx={{ px: 2, py: 0.8, borderRadius: 2, fontWeight: 650 }}
          >
            Atualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => edit()}
            sx={{ px: 2.25, py: 0.8, borderRadius: 2, fontWeight: 650 }}
          >
            Novo usuário
          </Button>
        </Stack>
      }
    >
      {notice && (
        <Alert severity="warning" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Buscar nome ou e-mail"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ minWidth: { xs: '100%', md: 220 } }}>
              <SelectField
                label="Perfil"
                value={role}
                onChange={(value) => setRole(value as Role | '')}
                options={[{ value: '', label: 'Todos os perfis' }, ...Object.entries(roleLabel).map(([value, label]) => ({ value, label }))]}
              />
            </Box>
            <Box sx={{ minWidth: { xs: '100%', md: 160 } }}>
              <SelectField
                label="Situação"
                value={active}
                onChange={(value) => setActive(value as typeof active)}
                options={[{ value: '', label: 'Todas' }, { value: 'true', label: 'Ativos' }, { value: 'false', label: 'Inativos' }]}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {loading && <LinearProgress aria-label="Carregando usuários" sx={{ height: 2 }} />}

      {!loading && shown.length === 0 && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <ManageAccountsOutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            <Typography mt={1} fontWeight={700} color="#0F172A">
              {query || role || active ? 'Nenhum usuário corresponde aos filtros.' : 'Nenhum usuário cadastrado.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading &&
        shown.length > 0 &&
        (compact ? (
          <Stack gap={1.25}>
            {shown.map((user) => (
              <Card key={user.id} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" gap={1.5} alignItems="flex-start">
                    <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
                      <Avatar sx={{ bgcolor: '#EFF6FF', color: '#1976D2', width: 38, height: 38, borderRadius: 2, fontWeight: 700, fontSize: 15 }}>
                        {text(user, 'name').slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Stack minWidth={0}>
                        <Typography fontWeight={750} color="#0F172A" fontSize={14.5} noWrap>
                          {text(user, 'name')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                          {text(user, 'email')}
                        </Typography>
                        <Stack direction="row" gap={0.75} mt={0.5}>
                          <Chip size="small" label={roleLabel[text(user, 'role') as Role]} sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }} />
                          <Chip
                            size="small"
                            color={enabled(user) ? 'success' : 'default'}
                            label={enabled(user) ? 'Ativo' : 'Inativo'}
                            sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }}
                          />
                        </Stack>
                      </Stack>
                    </Stack>
                    {actions(user)}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Perfil</TableCell>
                    <TableCell>Situação</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell sx={{ fontWeight: 700, color: '#0F172A' }}>{text(user, 'name')}</TableCell>
                      <TableCell sx={{ color: '#475569' }}>{text(user, 'email')}</TableCell>
                      <TableCell>
                        <Chip size="small" label={roleLabel[text(user, 'role') as Role]} sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={enabled(user) ? 'success' : 'default'}
                          label={enabled(user) ? 'Ativo' : 'Inativo'}
                          sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }}
                        />
                      </TableCell>
                      <TableCell align="right">{actions(user)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        ))}

      <PageDialog
        open={Boolean(editing)}
        title={editing?.created_at ? 'Editar usuário' : 'Novo usuário'}
        onClose={() => setEditing(undefined)}
        onSave={() => void save()}
        saveText={busy ? 'Salvando…' : 'Salvar'}
      >
        <TextField
          required
          size="small"
          label="Nome completo"
          value={form.name}
          inputProps={{ maxLength: 120 }}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <TextField
          required
          size="small"
          type="email"
          label="E-mail"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <TextField
          required={!editing?.created_at}
          size="small"
          type="password"
          label={editing?.created_at ? 'Nova senha (opcional)' : 'Senha (mínimo 6 caracteres)'}
          value={form.password}
          inputProps={{ minLength: 6, maxLength: 200 }}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <SelectField
          label="Perfil"
          value={form.role}
          onChange={(value) => setForm({ ...form, role: value as Role })}
          options={Object.entries(roleLabel).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          label="Situação"
          value={form.active}
          onChange={(value) => setForm({ ...form, active: value as 'true' | 'false' })}
          options={[{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }]}
        />
      </PageDialog>
    </Section>
  );
}
