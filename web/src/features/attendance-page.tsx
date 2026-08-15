import { useEffect, useMemo, useState } from 'react';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment, Snackbar, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { useApp } from '../app-context';
import { DateField, SelectField } from '../components';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import {
  attendanceCallAccess, buildAttendanceDraftRows, replacementDraftError, saveAttendanceCall,
  toggleAttendanceStatus, type AttendanceDraftRow, type EditableAttendanceStatus,
} from './attendance-model';

const statuses: Array<{ value: EditableAttendanceStatus; label: string; color: 'success' | 'error' | 'warning' | 'info' | 'secondary' }> = [
  { value: 'P', label: 'Presente', color: 'success' },
  { value: 'F', label: 'Falta', color: 'error' },
  { value: 'J', label: 'Justificada', color: 'info' },
  { value: 'A', label: 'Atraso', color: 'warning' },
  { value: 'R', label: 'Reposição', color: 'secondary' },
];

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

interface ReplacementDialogState {
  rowIndex: number;
  date: string;
  time: string;
  notes: string;
  error?: string;
}

export function AttendancePage({ today = todayInSaoPaulo() }: { today?: string }) {
  const { store, sync, session } = useApp();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const attendance = useEntity('attendance_records', true);
  const classNotes = useEntity('class_notes', true);
  const replacements = useEntity('replacements', true);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(formatDate(today));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AttendanceDraftRow[]>([]);
  const [generalNotes, setGeneralNotes] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [replacementDialog, setReplacementDialog] = useState<ReplacementDialogState>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string }>();

  const loading = classes.loading || courses.loading || students.loading || enrollments.loading
    || attendance.loading || classNotes.loading || replacements.loading;
  const canonicalDate = useMemo(() => {
    try { return parseBrazilDate(date, { allowFuture: true }) ?? ''; } catch { return ''; }
  }, [date]);

  useEffect(() => {
    if (!classId && classes.items.length) setClassId(classes.items[0]!.id);
  }, [classId, classes.items]);

  const existingClassNote = classNotes.items.find((item) => !item.deleted_at
    && item.class_id === classId && item.date === canonicalDate);
  const existingCall = attendance.items.some((item) => !item.deleted_at
    && item.class_id === classId && item.date === canonicalDate);
  const access = attendanceCallAccess(session.role, canonicalDate, today, existingCall);

  useEffect(() => {
    if (loading || !classId || !canonicalDate) {
      setRows([]);
      setGeneralNotes('');
      return;
    }
    setRows(buildAttendanceDraftRows({
      classId,
      date: canonicalDate,
      students: students.items,
      enrollments: enrollments.items,
      attendance: attendance.items,
      replacements: replacements.items,
    }));
    setGeneralNotes(text(existingClassNote, 'notes'));
    setExpandedNotes(new Set());
  }, [attendance.items, canonicalDate, classId, enrollments.items, existingClassNote, loading, replacements.items, students.items]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return rows;
    return rows.filter((row) => `${text(row.student, 'name')} ${text(row.student, 'registration_number')}`
      .toLocaleLowerCase('pt-BR').includes(term));
  }, [rows, search]);

  const classOptions = classes.items.map((item) => {
    const course = courses.items.find((candidate) => candidate.id === item.course_id);
    const courseName = text(course, 'name');
    return { value: item.id, label: `${text(item, 'name')}${courseName ? ` • ${courseName}` : ''}` };
  });

  const updateRow = (index: number, update: (row: AttendanceDraftRow) => AttendanceDraftRow) => {
    setRows((current) => current.map((row, currentIndex) => currentIndex === index ? update(row) : row));
  };

  const openReplacement = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    const fallbackDate = addDays(today, 1);
    setReplacementDialog({
      rowIndex,
      date: formatDate(row.replacement?.scheduledDate || fallbackDate),
      time: row.replacement?.scheduledTime || '14:00',
      notes: row.replacement?.notes || '',
    });
  };

  const selectStatus = (rowIndex: number, status: EditableAttendanceStatus) => {
    const row = rows[rowIndex];
    if (!row || !access.editable) return;
    if (status === 'R' && row.status !== 'R') { openReplacement(rowIndex); return; }
    updateRow(rowIndex, (current) => toggleAttendanceStatus(current, status));
  };

  const confirmReplacement = () => {
    if (!replacementDialog) return;
    let scheduledDate = '';
    try { scheduledDate = parseBrazilDate(replacementDialog.date, { allowFuture: true }) ?? ''; }
    catch (error) {
      setReplacementDialog({ ...replacementDialog, error: error instanceof Error ? error.message : 'Data inválida.' });
      return;
    }
    const replacement = { scheduledDate, scheduledTime: replacementDialog.time, notes: replacementDialog.notes };
    const error = replacementDraftError(replacement);
    if (error) { setReplacementDialog({ ...replacementDialog, error }); return; }
    updateRow(replacementDialog.rowIndex, (row) => ({ ...row, status: 'R', replacement, statusChanged: true }));
    setExpandedNotes((current) => new Set(current).add(rows[replacementDialog.rowIndex]!.student.id));
    setReplacementDialog(undefined);
  };

  const save = async () => {
    if (!access.editable || !classId || !canonicalDate || saving) return;
    setSaving(true); setNotice(undefined);
    try {
      await saveAttendanceCall({
        store,
        classId,
        date: canonicalDate,
        userId: session.id,
        rows,
        generalNotes,
        existingClassNote,
      });
      await Promise.all([attendance.reload(), classNotes.reload(), replacements.reload()]);
      setNotice({ severity: 'success', message: 'Chamada salva neste dispositivo. A sincronização seguirá em segundo plano.' });
      void sync();
    } catch (error) {
      setNotice({ severity: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar a chamada.' });
    } finally { setSaving(false); }
  };

  return <Stack gap={2.5}>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Box>
        <Typography variant="h6" fontWeight={850} color="primary.dark">Lançamento de frequência</Typography>
        <Typography variant="body2" color="text.secondary">P = presente, F = falta, J = justificada, A = atraso e R = reposição.</Typography>
      </Box>
      <Button variant="contained" startIcon={<SaveOutlinedIcon />} disabled={!access.editable || !rows.length || saving} onClick={() => void save()}>
        {saving ? 'Salvando…' : 'Salvar chamada'}
      </Button>
    </Stack>

    <Card variant="outlined"><CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <Box sx={{ flex: 1, minWidth: 240 }}><SelectField label="Turma" value={classId} onChange={setClassId} options={classOptions} /></Box>
        <Box sx={{ width: { xs: '100%', md: 280 } }}><DateField label="Data da chamada" value={date} onChange={setDate} required /></Box>
      </Stack>
    </CardContent></Card>

    {!access.editable && classId && canonicalDate && <Alert severity="warning" icon={<LockClockOutlinedIcon />}>
      <strong>Somente leitura.</strong> {access.message}
    </Alert>}

    {classId && canonicalDate && <>
      <TextField
        fullWidth label="Buscar aluno na chamada" value={search} onChange={(event) => setSearch(event.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon /></InputAdornment> }}
      />
      <TextField
        fullWidth multiline minRows={2} label="Observação geral da turma nesta chamada" value={generalNotes}
        disabled={!access.editable} inputProps={{ maxLength: 2000 }} onChange={(event) => setGeneralNotes(event.target.value)}
        helperText={`${generalNotes.length}/2000`}
      />

      {!loading && rows.length === 0 && <Alert severity="info">A turma selecionada não possui matrículas ativas.</Alert>}
      {!loading && rows.length > 0 && visibleRows.length === 0 && <Alert severity="info">Nenhum aluno corresponde à busca.</Alert>}

      <Stack gap={1.25}>
        {visibleRows.map((row) => {
          const rowIndex = rows.findIndex((candidate) => candidate.student.id === row.student.id);
          const noteOpen = expandedNotes.has(row.student.id);
          return <Card key={row.student.id} variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Stack direction={{ xs: 'column', lg: 'row' }} gap={1.5} alignItems={{ lg: 'center' }}>
              <Stack direction="row" gap={1.25} alignItems="center" sx={{ flex: 1, minWidth: 220 }}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>{text(row.student, 'name').slice(0, 1).toUpperCase()}</Avatar>
                <Box minWidth={0}>
                  <Typography fontWeight={750} noWrap>{text(row.student, 'name')}</Typography>
                  <Typography variant="body2" color="text.secondary">Matrícula {text(row.student, 'registration_number') || 'não informada'}</Typography>
                </Box>
              </Stack>
              <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                {statuses.map((status) => <Button
                  key={status.value} size="small" color={status.color}
                  variant={row.status === status.value ? 'contained' : 'outlined'} disabled={!access.editable}
                  aria-pressed={row.status === status.value} onClick={() => selectStatus(rowIndex, status.value)}
                >{status.value}</Button>)}
                {row.status === 'R' && <Chip
                  size="small" icon={<CalendarMonthOutlinedIcon />} color="secondary" variant="outlined"
                  label={row.replacement ? `${formatDate(row.replacement.scheduledDate)} às ${row.replacement.scheduledTime}` : 'Definir data e horário'}
                  onClick={access.editable ? () => openReplacement(rowIndex) : undefined}
                />}
                <Tooltip title={noteOpen ? 'Fechar anotação' : 'Anotação do aluno'}><IconButton
                  aria-label={`Anotação de ${text(row.student, 'name')}`}
                  color={row.notes.trim() ? 'primary' : 'default'}
                  onClick={() => setExpandedNotes((current) => {
                    const next = new Set(current); if (next.has(row.student.id)) next.delete(row.student.id); else next.add(row.student.id); return next;
                  })}
                ><EditNoteOutlinedIcon /></IconButton></Tooltip>
              </Stack>
            </Stack>
            <Collapse in={noteOpen}>
              <TextField
                fullWidth multiline minRows={2} sx={{ mt: 1.5 }} label="Anotação do aluno" value={row.notes}
                disabled={!access.editable || !row.status} inputProps={{ maxLength: 1000 }}
                helperText={row.status ? `${row.notes.length}/1000` : 'Selecione uma situação para registrar uma anotação.'}
                onChange={(event) => updateRow(rowIndex, (current) => ({ ...current, notes: event.target.value }))}
              />
            </Collapse>
          </CardContent></Card>;
        })}
      </Stack>
    </>}

    <Dialog open={Boolean(replacementDialog)} onClose={() => setReplacementDialog(undefined)} fullWidth maxWidth="sm">
      <DialogTitle><Stack direction="row" gap={1} alignItems="center"><EventRepeatOutlinedIcon />Agendar reposição</Stack></DialogTitle>
      <DialogContent><Stack gap={2} sx={{ pt: 1 }}>
        {replacementDialog?.error && <Alert severity="error">{replacementDialog.error}</Alert>}
        <DateField label="Data da reposição" value={replacementDialog?.date ?? ''} allowFuture required onChange={(value) => setReplacementDialog((current) => current ? { ...current, date: value, error: undefined } : current)} />
        <TextField
          required label="Horário da reposição" type="time" value={replacementDialog?.time ?? ''} InputLabelProps={{ shrink: true }}
          onChange={(event) => setReplacementDialog((current) => current ? { ...current, time: event.target.value, error: undefined } : current)}
        />
        <TextField
          label="Observação da reposição" multiline minRows={3} value={replacementDialog?.notes ?? ''} inputProps={{ maxLength: 1000 }}
          placeholder="Motivo ou conteúdo a ser reposto"
          onChange={(event) => setReplacementDialog((current) => current ? { ...current, notes: event.target.value, error: undefined } : current)}
        />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setReplacementDialog(undefined)}>Cancelar</Button><Button variant="contained" onClick={confirmReplacement}>Confirmar reposição</Button></DialogActions>
    </Dialog>

    <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice(undefined)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      {notice ? <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(undefined)}>{notice.message}</Alert> : undefined}
    </Snackbar>
  </Stack>;
}
