import { useMemo, useState } from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, InputAdornment, LinearProgress,
  Stack, TextField, Typography,
} from '@mui/material';
import { useApp } from '../app-context';
import { DateField, PageDialog, Section, SelectField } from '../components';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import { replacementDraftError } from './attendance-model';
import { buildReplacementViews, filterReplacementViews, type ReplacementView } from './replacements-model';

const identifier = () => crypto.randomUUID();
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
};
const formatCompletion = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
};

export function ReplacementsPage({ history = false, today = todayInSaoPaulo() }: { history?: boolean; today?: string }) {
  const { store, sync, session } = useApp();
  const attendance = useEntity('attendance_records', true);
  const replacements = useEntity('replacements', true);
  const students = useEntity('students', true);
  const classes = useEntity('classes');
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<ReplacementView>();
  const [form, setForm] = useState({ date: '', time: '', notes: '' });
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const loading = attendance.loading || replacements.loading || students.loading || classes.loading;
  const canonical = (value: string) => { try { return value ? parseBrazilDate(value, { allowFuture: true }) ?? '' : ''; } catch { return ''; } };
  const fromDate = canonical(from); const toDate = canonical(to);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const allRows = useMemo(() => buildReplacementViews({ attendance: attendance.items, replacements: replacements.items, students: students.items, classes: classes.items }), [attendance.items, classes.items, replacements.items, students.items]);
  const rows = useMemo(() => invalidRange ? [] : filterReplacementViews(allRows, { history, query, classId, from: fromDate, to: toDate }), [allRows, classId, fromDate, history, invalidRange, query, toDate]);

  const openSchedule = (row: ReplacementView) => {
    setEditing(row); setNotice(undefined);
    setForm({ date: formatDate(row.scheduledDate || addDays(today, 1)), time: row.scheduledTime || '14:00', notes: row.notes || '' });
  };
  const saveSchedule = async () => {
    if (!editing || busy) return;
    let scheduledDate = '';
    try { scheduledDate = parseBrazilDate(form.date, { allowFuture: true }) ?? ''; }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Data inválida.'); return; }
    const error = replacementDraftError({ scheduledDate, scheduledTime: form.time, notes: form.notes });
    if (error) { setNotice(error); return; }
    setBusy(true);
    try {
      await store.mutate('replacements', {
        ...editing.schedule,
        id: editing.schedule?.id ?? identifier(), attendance_record_id: editing.attendance.id,
        class_id: editing.attendance.class_id, student_id: editing.attendance.student_id,
        attendance_date: editing.attendanceDate, scheduled_date: scheduledDate, scheduled_time: form.time,
        notes: form.notes.trim() || null, completed_at: editing.completedAt || null, recorded_by_user_id: session.id,
      });
      setEditing(undefined); await replacements.reload(); void sync();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Não foi possível salvar a agenda.'); }
    finally { setBusy(false); }
  };
  const complete = async (row: ReplacementView) => {
    if (!row.schedule) { setNotice('Agende a data e o horário antes de concluir a reposição.'); return; }
    if (!window.confirm(`Confirmar a reposição de ${row.studentName}?`)) return;
    const completedAt = new Date().toISOString();
    try {
      await store.mutateBatch([
        { entity: 'attendance_records', data: { ...row.attendance, status: 'RC', completed_at: completedAt, recorded_by_user_id: session.id } },
        { entity: 'replacements', data: { ...row.schedule, completed_at: completedAt, recorded_by_user_id: session.id } },
      ]);
      await Promise.all([attendance.reload(), replacements.reload()]); void sync();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Não foi possível concluir a reposição.'); }
  };

  return <Section title={history ? 'Histórico de reposições' : 'Reposições em aberto'}>
    {notice && <Alert severity="warning" onClose={() => setNotice(undefined)}>{notice}</Alert>}
    {invalidRange && <Alert severity="error">A data inicial não pode ser posterior à data final.</Alert>}
    <Card variant="outlined"><CardContent><Stack direction={{ xs: 'column', lg: 'row' }} gap={1.5}>
      <TextField fullWidth label="Buscar aluno ou matrícula" value={query} onChange={(event) => setQuery(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon /></InputAdornment> }} />
      <Box sx={{ minWidth: { lg: 260 } }}><SelectField label="Turma" value={classId} onChange={setClassId} options={[{ value: '', label: 'Todas as turmas' }, ...classes.items.map((item) => ({ value: item.id, label: String(item.name ?? '') }))]} /></Box>
      <Box sx={{ minWidth: { lg: 190 } }}><DateField label="Data inicial" value={from} onChange={setFrom} /></Box>
      <Box sx={{ minWidth: { lg: 190 } }}><DateField label="Data final" value={to} onChange={setTo} /></Box>
    </Stack></CardContent>{loading && <LinearProgress aria-label="Carregando reposições" />}</Card>
    <Typography variant="body2" color="text.secondary">{rows.length} {rows.length === 1 ? 'reposição encontrada' : 'reposições encontradas'}</Typography>
    {!loading && rows.length === 0 && <Card variant="outlined"><CardContent sx={{ py: 6, textAlign: 'center' }}>{history ? <HistoryOutlinedIcon color="disabled" sx={{ fontSize: 48 }} /> : <EventAvailableOutlinedIcon color="disabled" sx={{ fontSize: 48 }} />}<Typography mt={1} fontWeight={800}>{history ? 'Nenhuma reposição concluída.' : 'Nenhuma reposição pendente.'}</Typography><Typography variant="body2" color="text.secondary">{history ? 'As reposições confirmadas aparecerão aqui.' : 'Alunos marcados com R na chamada aparecerão aqui.'}</Typography></CardContent></Card>}
    <Stack gap={1.25}>{rows.map((row) => <Card key={row.id} variant="outlined"><CardContent><Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'flex-start' }}>
      <Avatar sx={{ bgcolor: row.completed ? 'success.light' : 'secondary.light', color: row.completed ? 'success.dark' : 'secondary.dark' }}>{row.studentName.slice(0, 1).toUpperCase()}</Avatar>
      <Stack flex={1} minWidth={0} gap={.75}><Stack direction="row" gap={1} flexWrap="wrap" alignItems="center"><Typography fontWeight={850}>{row.studentName}</Typography><Chip size="small" color={row.completed ? 'success' : 'secondary'} label={row.completed ? 'Concluída' : 'Pendente'} /></Stack>
        <Typography variant="body2" color="text.secondary">Matrícula: {row.registrationNumber} • Turma: {row.className}</Typography>
        <Typography variant="body2"><strong>Data da chamada:</strong> {formatDate(row.attendanceDate)}</Typography>
        <Typography variant="body2"><strong>Agendamento:</strong> {row.scheduledDate ? `${formatDate(row.scheduledDate)} às ${row.scheduledTime}` : 'Ainda não agendada'}</Typography>
        {row.completedAt && <Typography variant="body2" color="success.dark"><strong>Confirmada em:</strong> {formatCompletion(row.completedAt)}</Typography>}
        {row.notes && <Box sx={{ p: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}><Typography variant="body2">{row.notes}</Typography></Box>}
      </Stack>
      {!history && <Stack direction={{ xs: 'row', md: 'column' }} gap={1} flexWrap="wrap"><Button variant="outlined" startIcon={<EditCalendarOutlinedIcon />} onClick={() => openSchedule(row)}>{row.schedule ? 'Editar agenda' : 'Agendar'}</Button><Button variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} disabled={!row.schedule} onClick={() => void complete(row)}>Concluir</Button></Stack>}
    </Stack></CardContent></Card>)}</Stack>
    <PageDialog open={Boolean(editing)} title="Agendar reposição" onClose={() => setEditing(undefined)} onSave={() => void saveSchedule()} saveText={busy ? 'Salvando…' : 'Salvar agenda'}>
      <DateField label="Data da reposição" value={form.date} onChange={(date) => setForm({ ...form, date })} required allowFuture />
      <TextField required label="Horário da reposição" type="time" value={form.time} InputLabelProps={{ shrink: true }} onChange={(event) => setForm({ ...form, time: event.target.value })} />
      <TextField label="Observações" multiline minRows={3} value={form.notes} inputProps={{ maxLength: 1000 }} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
    </PageDialog>
  </Section>;
}
