import { useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, LinearProgress,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useApp } from '../app-context';
import { PageDialog, Section } from '../components';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import { catalogDeleteBlock, filterCatalog } from './directory-model';

const identifier = () => crypto.randomUUID();
const text = (record: LocalRecord | undefined, key: string) => String(record?.[key] ?? '');
const enabled = (record: LocalRecord) => record.active !== 0 && record.active !== false;

type Catalog = 'courses' | 'laboratories';

function CatalogPage({ entity }: { entity: Catalog }) {
  const { store, sync, session } = useApp();
  const catalog = useEntity(entity);
  const classes = useEntity('classes');
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LocalRecord>();
  const [form, setForm] = useState({ code: '', name: '' });
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isCourse = entity === 'courses';
  const label = isCourse ? 'curso' : 'laboratório';
  const shown = useMemo(() => filterCatalog(catalog.items, query), [catalog.items, query]);
  const canCreateOrDelete = session.role === 'admin';

  const startEdit = (item?: LocalRecord) => {
    setForm({ code: text(item, 'code'), name: text(item, 'name') });
    setNotice(undefined);
    setEditing(item ?? { id: identifier(), active: 1 });
  };
  const save = async () => {
    if (!editing || busy) return;
    if (!form.name.trim() || (isCourse && !form.code.trim())) {
      setNotice('Preencha todos os campos obrigatórios.');
      return;
    }
    setBusy(true);
    try {
      await store.mutate(entity, {
        ...editing,
        code: isCourse ? form.code.trim() : undefined,
        name: form.name.trim(),
        active: editing.active ?? 1,
      });
      setEditing(undefined);
      await catalog.reload();
      void sync();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Não foi possível salvar o ${label}.`);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (item: LocalRecord) => {
    const block = catalogDeleteBlock(entity, item.id, classes.items);
    if (block) {
      setNotice(block);
      return;
    }
    if (!window.confirm(`Excluir ${text(item, 'name')}? O histórico já registrado será preservado.`)) return;
    try {
      await store.mutate(entity, item, 'delete');
      await catalog.reload();
      void sync();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Não foi possível excluir o ${label}.`);
    }
  };

  return (
    <Section
      title={isCourse ? 'Cursos' : 'Laboratórios'}
      subtitle={isCourse ? 'Gestão dos cursos institucionais oferecidos' : 'Gestão dos laboratórios e salas especializadas'}
      action={
        canCreateOrDelete ? (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => startEdit()}
            sx={{ px: 2.25, py: 0.8, borderRadius: 2, fontWeight: 650 }}
          >
            {isCourse ? 'Novo curso' : 'Novo laboratório'}
          </Button>
        ) : undefined
      }
    >
      {notice && (
        <Alert severity="warning" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <TextField
            fullWidth
            size="small"
            label={`Buscar ${isCourse ? 'curso ou código' : 'laboratório'}`}
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
        </CardContent>
      </Card>

      {(catalog.loading || classes.loading) && <LinearProgress aria-label="Carregando cadastros" sx={{ height: 2 }} />}

      {!catalog.loading && shown.length === 0 && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Inventory2OutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            <Typography fontWeight={700} color="#0F172A" mt={1}>
              {query ? 'Nenhum resultado encontrado.' : `Nenhum ${label} cadastrado.`}
            </Typography>
          </CardContent>
        </Card>
      )}

      {!catalog.loading &&
        shown.length > 0 &&
        (compact ? (
          <Stack gap={1.25}>
            {shown.map((item) => (
              <Card key={item.id} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
                      <Avatar
                        sx={{
                          bgcolor: isCourse ? '#F1F5F9' : '#F1F5F9',
                          color: '#0F172A',
                          width: 38,
                          height: 38,
                          borderRadius: 2,
                        }}
                      >
                        {isCourse ? <MenuBookOutlinedIcon fontSize="small" /> : <ScienceOutlinedIcon fontSize="small" />}
                      </Avatar>
                      <Box minWidth={0}>
                        {isCourse && (
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            {text(item, 'code') || 'Sem código'}
                          </Typography>
                        )}
                        {isCourse ? (
                          <Button
                            component={Link}
                            to={`/cursos/${item.id}`}
                            sx={{
                              px: 0,
                              display: 'block',
                              fontWeight: 700,
                              color: '#0F172A',
                              textAlign: 'left',
                              minWidth: 0,
                              '&:hover': { bgcolor: 'transparent', color: '#2563EB', textDecoration: 'underline' },
                            }}
                          >
                            {text(item, 'name')}
                          </Button>
                        ) : (
                          <Typography fontWeight={700} color="#0F172A" fontSize={14.5}>
                            {text(item, 'name')}
                          </Typography>
                        )}
                        <Chip
                          size="small"
                          color={enabled(item) ? 'success' : 'default'}
                          label={enabled(item) ? 'Ativo' : 'Inativo'}
                          sx={{ mt: 0.5, height: 20, fontSize: 10, fontWeight: 600 }}
                        />
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Editar">
                        <IconButton aria-label={`Editar ${text(item, 'name')}`} onClick={() => startEdit(item)} size="small">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canCreateOrDelete && (
                        <Tooltip title="Excluir">
                          <IconButton
                            color="error"
                            aria-label={`Excluir ${text(item, 'name')}`}
                            onClick={() => void remove(item)}
                            size="small"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
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
                    {isCourse && <TableCell>Código</TableCell>}
                    <TableCell>Nome</TableCell>
                    <TableCell>Situação</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((item) => (
                    <TableRow key={item.id} hover>
                      {isCourse && <TableCell sx={{ fontWeight: 600, color: '#64748B', fontSize: 12.5 }}>{text(item, 'code') || '—'}</TableCell>}
                      <TableCell>
                        {isCourse ? (
                          <Button
                            component={Link}
                            to={`/cursos/${item.id}`}
                            sx={{
                              px: 0,
                              fontWeight: 700,
                              color: '#0F172A',
                              textAlign: 'left',
                              minWidth: 0,
                              '&:hover': { bgcolor: 'transparent', color: '#2563EB', textDecoration: 'underline' },
                            }}
                          >
                            {text(item, 'name')}
                          </Button>
                        ) : (
                          <Typography fontWeight={700} color="#0F172A" fontSize={14}>
                            {text(item, 'name')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={enabled(item) ? 'success' : 'default'}
                          label={enabled(item) ? 'Ativo' : 'Inativo'}
                          sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                          <Tooltip title="Editar">
                            <IconButton aria-label={`Editar ${text(item, 'name')}`} onClick={() => startEdit(item)} size="small">
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canCreateOrDelete && (
                            <Tooltip title="Excluir">
                              <IconButton
                                color="error"
                                aria-label={`Excluir ${text(item, 'name')}`}
                                onClick={() => void remove(item)}
                                size="small"
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        ))}

      <PageDialog
        open={Boolean(editing)}
        title={`${editing?.created_at ? 'Editar' : 'Novo'} ${label}`}
        onClose={() => setEditing(undefined)}
        onSave={() => void save()}
        saveText={busy ? 'Salvando…' : 'Salvar'}
      >
        {isCourse && (
          <TextField
            required
            size="small"
            label="Código"
            value={form.code}
            inputProps={{ maxLength: 30 }}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        )}
        <TextField
          required
          size="small"
          label="Nome"
          value={form.name}
          inputProps={{ maxLength: 120 }}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </PageDialog>
    </Section>
  );
}

export function CoursesPage() {
  return <CatalogPage entity="courses" />;
}

export function LaboratoriesPage() {
  return <CatalogPage entity="laboratories" />;
}

