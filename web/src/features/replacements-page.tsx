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
import { replacementDraftError } from './attendance-model';
import { buildReplacementViews, filterReplacementViews, type ReplacementView } from './replacements-model';

const identifier = () => crypto.randomUUID();
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const formatCompletion = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
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
  const canonical = (value: string) => {
    try {
      return value ? parseBrazilDate(value, { allowFuture: true }) ?? '' : '';
    } catch {
      return '';
    }
  };
  const fromDate = canonical(from);
  const toDate = canonical(to);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const allRows = useMemo(
    () =>
      buildReplacementViews({
        attendance: attendance.items,
        replacements: replacements.items,
        students: students.items,
        classes: classes.items,
      }),
    [attendance.items, classes.items, replacements.items, students.items],
  );
  const rows = useMemo(
    () => (invalidRange ? [] : filterReplacementViews(allRows, { history, query, classId, from: fromDate, to: toDate })),
    [allRows, classId, fromDate, history, invalidRange, query, toDate],
  );

  const openSchedule = (row: ReplacementView) => {
    setEditing(row);
    setNotice(undefined);
    setForm({
      date: formatDate(row.scheduledDate || addDays(today, 1)),
      time: row.scheduledTime || '14:00',
      notes: row.notes || '',
    });
  };

  const saveSchedule = async () => {
    if (!editing || busy) return;
    let scheduledDate = '';
    try {
      scheduledDate = parseBrazilDate(form.date, { allowFuture: true }) ?? '';
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Data inválida.');
      return;
    }
    const error = replacementDraftError({ scheduledDate, scheduledTime: form.time, notes: form.notes });
    if (error) {
      setNotice(error);
      return;
    }
    setBusy(true);
    try {
      await store.mutate('replacements', {
        ...editing.schedule,
        id: editing.schedule?.id ?? identifier(),
        attendance_record_id: editing.attendance.id,
        class_id: editing.attendance.class_id,
        student_id: editing.attendance.student_id,
        attendance_date: editing.attendanceDate,
        scheduled_date: scheduledDate,
        scheduled_time: form.time,
        notes: form.notes.trim() || null,
        completed_at: editing.completedAt || null,
        recorded_by_user_id: session.id,
      });
      setEditing(undefined);
      await replacements.reload();
      void sync();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível salvar a agenda.');
    } finally {
      setBusy(false);
    }
  };

  const complete = async (row: ReplacementView) => {
    if (!row.schedule) {
      setNotice('Agende a data e o horário antes de concluir a reposição.');
      return;
    }
    if (!window.confirm(`Confirmar a reposição de ${row.studentName}?`)) return;
    const completedAt = new Date().toISOString();
    try {
      await store.mutateBatch([
        {
          entity: 'attendance_records',
          data: {
            ...row.attendance,
            status: 'RC',
            completed_at: completedAt,
            recorded_by_user_id: session.id,
          },
        },
        {
          entity: 'replacements',
          data: {
            ...row.schedule,
            completed_at: completedAt,
            recorded_by_user_id: session.id,
          },
        },
      ]);
      await Promise.all([attendance.reload(), replacements.reload()]);
      void sync();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível concluir a reposição.');
    }
  };

  return (
    <Section
      title={history ? 'Histórico de reposições' : 'Reposições em aberto'}
      subtitle={
        history
          ? 'Registro completo de reposições de aula concluídas e confirmadas'
          : 'Alunos marcados para reposição de conteúdo ou aula pendente'
      }
    >
      {notice && (
        <Alert severity="warning" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}
      {invalidRange && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          A data inicial não pode ser posterior à data final.
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Buscar aluno ou matrícula"
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
            <Box sx={{ minWidth: { xs: '100%', lg: 240 } }}>
              <SelectField
                label="Turma"
                value={classId}
                onChange={setClassId}
                options={[
                  { value: '', label: 'Todas as turmas' },
                  ...classes.items.map((item) => ({ value: item.id, label: String(item.name ?? '') })),
                ]}
              />
            </Box>
            <Box sx={{ minWidth: { xs: '100%', sm: 180 } }}>
              <DateField label="Data inicial" value={from} onChange={setFrom} />
            </Box>
            <Box sx={{ minWidth: { xs: '100%', sm: 180 } }}>
              <DateField label="Data final" value={to} onChange={setTo} />
            </Box>
          </Stack>
        </CardContent>
        {loading && <LinearProgress aria-label="Carregando reposições" sx={{ height: 2 }} />}
      </Card>

      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {rows.length} {rows.length === 1 ? 'reposição encontrada' : 'reposições encontradas'}
      </Typography>

      {!loading && rows.length === 0 && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            {history ? (
              <HistoryOutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            ) : (
              <EventAvailableOutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            )}
            <Typography mt={1} fontWeight={700} color="#0F172A">
              {history ? 'Nenhuma reposição concluída.' : 'Nenhuma reposição pendente.'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {history
                ? 'As reposições confirmadas aparecerão aqui.'
                : 'Alunos marcados com R na chamada aparecerão aqui.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Stack gap={1.25}>
        {rows.map((row) => (
          <Card
            key={row.id}
            sx={{
              border: '1px solid #E2E8F0',
              borderRadius: 2.5,
              transition: 'border-color 0.15s ease',
              '&:hover': { borderColor: '#CBD5E1' },
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1.75} alignItems={{ md: 'flex-start' }}>
                <Avatar
                  sx={{
                    bgcolor: row.completed ? '#ECFDF5' : '#F5F3FF',
                    color: row.completed ? '#059669' : '#7C3AED',
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {row.studentName.slice(0, 1).toUpperCase()}
                </Avatar>
                <Stack flex={1} minWidth={0} gap={0.5}>
                  <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                    <Typography fontWeight={750} color="#0F172A" fontSize={15}>
                      {row.studentName}
                    </Typography>
                    <Chip
                      size="small"
                      color={row.completed ? 'success' : 'secondary'}
                      label={row.completed ? 'Concluída' : 'Pendente'}
                      sx={{ fontWeight: 650, height: 20, fontSize: 10.5 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Matrícula: {row.registrationNumber} • Turma: {row.className}
                  </Typography>
                  <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                    <strong style={{ color: '#0F172A' }}>Data da chamada:</strong> {formatDate(row.attendanceDate)}
                  </Typography>
                  <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                    <strong style={{ color: '#0F172A' }}>Agendamento:</strong>{' '}
                    {row.scheduledDate ? `${formatDate(row.scheduledDate)} às ${row.scheduledTime}` : 'Ainda não agendada'}
                  </Typography>
                  {row.completedAt && (
                    <Typography variant="caption" color="success.dark" fontWeight={600} sx={{ fontSize: 12.5 }}>
                      <strong>Confirmada em:</strong> {formatCompletion(row.completedAt)}
                    </Typography>
                  )}
                  {row.notes && (
                    <Box sx={{ p: 1.25, bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 2, mt: 0.5 }}>
                      <Typography variant="caption" color="#334155" sx={{ fontSize: 12.5, display: 'block' }}>
                        {row.notes}
                      </Typography>
                    </Box>
                  )}
                </Stack>
                {!history && (
                  <Stack direction={{ xs: 'row', md: 'column' }} gap={1} flexWrap="wrap" sx={{ alignSelf: { md: 'center' } }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<EditCalendarOutlinedIcon fontSize="small" />}
                      onClick={() => openSchedule(row)}
                      sx={{ borderRadius: 2, fontWeight: 650 }}
                    >
                      {row.schedule ? 'Editar agenda' : 'Agendar'}
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      color="success"
                      startIcon={<CheckCircleOutlineIcon fontSize="small" />}
                      disabled={!row.schedule}
                      onClick={() => void complete(row)}
                      sx={{ borderRadius: 2, fontWeight: 650 }}
                    >
                      Concluir
                    </Button>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <PageDialog
        open={Boolean(editing)}
        title="Agendar reposição"
        onClose={() => setEditing(undefined)}
        onSave={() => void saveSchedule()}
        saveText={busy ? 'Salvando…' : 'Salvar agenda'}
      >
        <DateField label="Data da reposição" value={form.date} onChange={(date) => setForm({ ...form, date })} required allowFuture />
        <TextField
          required
          size="small"
          label="Horário da reposição"
          type="time"
          value={form.time}
          InputLabelProps={{ shrink: true }}
          onChange={(event) => setForm({ ...form, time: event.target.value })}
        />
        <TextField
          size="small"
          label="Observações"
          multiline
          minRows={3}
          value={form.notes}
          inputProps={{ maxLength: 1000 }}
          placeholder="Motivo ou conteúdo a ser reposto"
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </PageDialog>
    </Section>
  );
}
