import { useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert, Box, Button, Card, CardContent, Chip, IconButton, InputAdornment, LinearProgress,
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
    if (!form.name.trim() || (isCourse && !form.code.trim())) { setNotice('Preencha todos os campos obrigatórios.'); return; }
    setBusy(true);
    try {
      await store.mutate(entity, { ...editing, code: isCourse ? form.code.trim() : undefined, name: form.name.trim(), active: editing.active ?? 1 });
      setEditing(undefined);
      await catalog.reload();
      void sync();
    } catch (error) { setNotice(error instanceof Error ? error.message : `Não foi possível salvar o ${label}.`); }
    finally { setBusy(false); }
  };
  const remove = async (item: LocalRecord) => {
    const block = catalogDeleteBlock(entity, item.id, classes.items);
    if (block) { setNotice(block); return; }
    if (!window.confirm(`Excluir ${text(item, 'name')}? O histórico já registrado será preservado.`)) return;
    try {
      await store.mutate(entity, item, 'delete');
      await catalog.reload();
      void sync();
    } catch (error) { setNotice(error instanceof Error ? error.message : `Não foi possível excluir o ${label}.`); }
  };

  return <Section title={isCourse ? 'Cursos' : 'Laboratórios'} action={canCreateOrDelete
    ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => startEdit()}>{isCourse ? 'Novo curso' : 'Novo laboratório'}</Button>
    : undefined}>
    {notice && <Alert severity="warning" onClose={() => setNotice(undefined)}>{notice}</Alert>}
    <TextField
      label={`Buscar ${isCourse ? 'curso ou código' : 'laboratório'}`}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon /></InputAdornment> }}
      sx={{ maxWidth: 480 }}
    />
    {(catalog.loading || classes.loading) && <LinearProgress aria-label="Carregando cadastros" />}
    {!catalog.loading && shown.length === 0 && <Card variant="outlined"><CardContent sx={{ py: 6, textAlign: 'center' }}>
      <Inventory2OutlinedIcon color="disabled" sx={{ fontSize: 46 }} />
      <Typography fontWeight={800} mt={1}>{query ? 'Nenhum resultado encontrado.' : `Nenhum ${label} cadastrado.`}</Typography>
    </CardContent></Card>}
    {!catalog.loading && shown.length > 0 && (compact
      ? <Stack gap={1}>{shown.map((item) => <Card key={item.id} variant="outlined"><CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <Box minWidth={0}>{isCourse && <Typography variant="caption" color="text.secondary">{text(item, 'code') || 'Sem código'}</Typography>}
            {isCourse ? <Button component={Link} to={`/cursos/${item.id}`} sx={{ px: 0, display: 'block', fontWeight: 800 }}>{text(item, 'name')}</Button> : <Typography fontWeight={800}>{text(item, 'name')}</Typography>}
            <Chip size="small" color={enabled(item) ? 'success' : 'default'} label={enabled(item) ? 'Ativo' : 'Inativo'} sx={{ mt: 1 }} />
          </Box>
          <Stack direction="row"><Tooltip title="Editar"><IconButton aria-label={`Editar ${text(item, 'name')}`} onClick={() => startEdit(item)}><EditOutlinedIcon /></IconButton></Tooltip>
            {canCreateOrDelete && <Tooltip title="Excluir"><IconButton color="error" aria-label={`Excluir ${text(item, 'name')}`} onClick={() => void remove(item)}><DeleteOutlineIcon /></IconButton></Tooltip>}</Stack>
        </Stack>
      </CardContent></Card>)}</Stack>
      : <Card variant="outlined"><TableContainer><Table><TableHead><TableRow>{isCourse && <TableCell>Código</TableCell>}<TableCell>Nome</TableCell><TableCell>Situação</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
        <TableBody>{shown.map((item) => <TableRow key={item.id} hover>{isCourse && <TableCell>{text(item, 'code') || '—'}</TableCell>}<TableCell>{isCourse ? <Button component={Link} to={`/cursos/${item.id}`} sx={{ px: 0, fontWeight: 800 }}>{text(item, 'name')}</Button> : text(item, 'name')}</TableCell><TableCell><Chip size="small" color={enabled(item) ? 'success' : 'default'} label={enabled(item) ? 'Ativo' : 'Inativo'} /></TableCell><TableCell align="right"><Tooltip title="Editar"><IconButton aria-label={`Editar ${text(item, 'name')}`} onClick={() => startEdit(item)}><EditOutlinedIcon /></IconButton></Tooltip>{canCreateOrDelete && <Tooltip title="Excluir"><IconButton color="error" aria-label={`Excluir ${text(item, 'name')}`} onClick={() => void remove(item)}><DeleteOutlineIcon /></IconButton></Tooltip>}</TableCell></TableRow>)}</TableBody>
      </Table></TableContainer></Card>)}
    <PageDialog open={Boolean(editing)} title={`${editing?.created_at ? 'Editar' : 'Novo'} ${label}`} onClose={() => setEditing(undefined)} onSave={() => void save()} saveText={busy ? 'Salvando…' : 'Salvar'}>
      {isCourse && <TextField required label="Código" value={form.code} inputProps={{ maxLength: 30 }} onChange={(event) => setForm({ ...form, code: event.target.value })} />}
      <TextField required label="Nome" value={form.name} inputProps={{ maxLength: 120 }} onChange={(event) => setForm({ ...form, name: event.target.value })} />
    </PageDialog>
  </Section>;
}

export function CoursesPage() { return <CatalogPage entity="courses" />; }
export function LaboratoriesPage() { return <CatalogPage entity="laboratories" />; }
