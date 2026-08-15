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
import {
  attendanceCallAccess, buildAttendanceDraftRows, replacementDraftError, saveAttendanceCall,
  toggleAttendanceStatus, type AttendanceDraftRow, type EditableAttendanceStatus,
} from './attendance-model';

const statusConfig: Record<
  EditableAttendanceStatus,
  { label: string; activeBg: string; activeColor: string; hoverBg: string }
> = {
  P: { label: 'Presente', activeBg: '#059669', activeColor: '#FFFFFF', hoverBg: '#E2E8F0' },
  F: { label: 'Falta', activeBg: '#E11D48', activeColor: '#FFFFFF', hoverBg: '#E2E8F0' },
  J: { label: 'Justificada', activeBg: '#0284C7', activeColor: '#FFFFFF', hoverBg: '#E2E8F0' },
  A: { label: 'Atraso', activeBg: '#D97706', activeColor: '#FFFFFF', hoverBg: '#E2E8F0' },
  R: { label: 'Reposição', activeBg: '#7C3AED', activeColor: '#FFFFFF', hoverBg: '#E2E8F0' },
};

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

  const stats = useMemo(() => {
    const total = rows.length;
    const present = rows.filter((r) => r.status === 'P').length;
    const absent = rows.filter((r) => r.status === 'F').length;
    const justified = rows.filter((r) => r.status === 'J').length;
    const late = rows.filter((r) => r.status === 'A').length;
    const replacement = rows.filter((r) => r.status === 'R').length;
    const unset = rows.filter((r) => !r.status).length;
    const rate = total ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, justified, late, replacement, unset, rate };
  }, [rows]);

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

  return (
    <Stack gap={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Box>
          <Typography variant="h5" component="h1" fontWeight={800} color="#0F172A" letterSpacing="-0.02em">
            Lançamento de Frequência
          </Typography>
          <Typography variant="body2" color="text.secondary">
            P = presente, F = falta, J = justificada, A = atraso e R = reposição.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="medium"
          startIcon={<SaveOutlinedIcon />}
          disabled={!access.editable || !rows.length || saving}
          onClick={() => void save()}
          sx={{ px: 2.5, py: 0.9, borderRadius: 2, fontWeight: 650 }}
        >
          {saving ? 'Salvando…' : 'Salvar chamada'}
        </Button>
      </Stack>

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <SelectField label="Turma" value={classId} onChange={setClassId} options={classOptions} />
            </Box>
            <Box sx={{ width: { xs: '100%', md: 240 } }}>
              <DateField label="Data da chamada" value={date} onChange={setDate} required />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {!access.editable && classId && canonicalDate && (
        <Alert severity="warning" icon={<LockClockOutlinedIcon />} sx={{ borderRadius: 2 }}>
          <strong>Somente leitura.</strong> {access.message}
        </Alert>
      )}

      {classId && canonicalDate && (
        <>
          {rows.length > 0 && (
            <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, bgcolor: '#FFFFFF' }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Total: <strong>{stats.total}</strong> alunos
                    </Typography>
                    <Typography variant="body2" color="success.dark">
                      Presentes: <strong>{stats.present}</strong> ({stats.rate}%)
                    </Typography>
                    <Typography variant="body2" color="error.dark">
                      Faltas: <strong>{stats.absent}</strong>
                    </Typography>
                    {stats.justified > 0 && (
                      <Typography variant="body2" color="info.dark">
                        Justificadas: <strong>{stats.justified}</strong>
                      </Typography>
                    )}
                    {stats.late > 0 && (
                      <Typography variant="body2" color="warning.dark">
                        Atrasos: <strong>{stats.late}</strong>
                      </Typography>
                    )}
                    {stats.replacement > 0 && (
                      <Typography variant="body2" color="secondary.dark">
                        Reposições: <strong>{stats.replacement}</strong>
                      </Typography>
                    )}
                  </Stack>
                  {stats.unset > 0 && (
                    <Chip
                      size="small"
                      label={`${stats.unset} sem marcação`}
                      variant="outlined"
                      sx={{ height: 22, fontSize: 11, fontWeight: 600, color: '#64748B' }}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          <TextField
            fullWidth
            size="small"
            label="Buscar aluno na chamada"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            size="small"
            multiline
            minRows={2}
            label="Observação geral da turma nesta chamada"
            value={generalNotes}
            disabled={!access.editable}
            inputProps={{ maxLength: 2000 }}
            onChange={(event) => setGeneralNotes(event.target.value)}
            helperText={`${generalNotes.length}/2000`}
          />

          {!loading && rows.length === 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              A turma selecionada não possui matrículas ativas.
            </Alert>
          )}
          {!loading && rows.length > 0 && visibleRows.length === 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Nenhum aluno corresponde à busca.
            </Alert>
          )}

          <Stack gap={1}>
            {visibleRows.map((row) => {
              const rowIndex = rows.findIndex((candidate) => candidate.student.id === row.student.id);
              const noteOpen = expandedNotes.has(row.student.id);
              return (
                <Card
                  key={row.student.id}
                  sx={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 2.5,
                    transition: 'border-color 0.15s ease',
                    '&:hover': { borderColor: '#CBD5E1' },
                  }}
                >
                  <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
                      <Stack direction="row" gap={1.25} alignItems="center" sx={{ minWidth: 200, flex: 1 }}>
                        <Avatar
                          sx={{
                            bgcolor: '#F1F5F9',
                            color: '#0F172A',
                            fontWeight: 700,
                            fontSize: 14,
                            width: 34,
                            height: 34,
                            borderRadius: 2,
                          }}
                        >
                          {text(row.student, 'name').slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Box minWidth={0}>
                          <Typography fontWeight={700} color="#0F172A" fontSize={14} noWrap>
                            {text(row.student, 'name')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Matrícula {text(row.student, 'registration_number') || 'não informada'}
                          </Typography>
                        </Box>
                      </Stack>

                      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                        <Box
                          sx={{
                            display: 'inline-flex',
                            p: '2px',
                            bgcolor: '#F1F5F9',
                            borderRadius: 2,
                            gap: '2px',
                          }}
                        >
                          {(['P', 'F', 'J', 'A', 'R'] as EditableAttendanceStatus[]).map((statusKey) => {
                            const selected = row.status === statusKey;
                            const cfg = statusConfig[statusKey];
                            return (
                              <Button
                                key={statusKey}
                                size="small"
                                disabled={!access.editable}
                                aria-pressed={selected}
                                onClick={() => selectStatus(rowIndex, statusKey)}
                                sx={{
                                  minWidth: 32,
                                  width: 32,
                                  height: 32,
                                  p: 0,
                                  fontWeight: selected ? 800 : 600,
                                  fontSize: 13,
                                  borderRadius: 1.5,
                                  border: 'none',
                                  bgcolor: selected ? cfg.activeBg : 'transparent',
                                  color: selected ? cfg.activeColor : '#64748B',
                                  boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                  '&:hover': {
                                    bgcolor: selected ? cfg.activeBg : cfg.hoverBg,
                                    color: selected ? cfg.activeColor : '#0F172A',
                                  },
                                }}
                              >
                                {statusKey}
                              </Button>
                            );
                          })}
                        </Box>

                        {row.status === 'R' && (
                          <Chip
                            size="small"
                            icon={<CalendarMonthOutlinedIcon style={{ fontSize: 14 }} />}
                            color="secondary"
                            variant="outlined"
                            label={
                              row.replacement
                                ? `${formatDate(row.replacement.scheduledDate)} às ${row.replacement.scheduledTime}`
                                : 'Definir data/hora'
                            }
                            onClick={access.editable ? () => openReplacement(rowIndex) : undefined}
                            sx={{ fontWeight: 600, height: 28, borderRadius: 1.5 }}
                          />
                        )}

                        <Tooltip title={noteOpen ? 'Fechar anotação' : 'Anotação do aluno'}>
                          <IconButton
                            size="small"
                            aria-label={`Anotação de ${text(row.student, 'name')}`}
                            color={row.notes.trim() ? 'primary' : 'default'}
                            onClick={() =>
                              setExpandedNotes((current) => {
                                const next = new Set(current);
                                if (next.has(row.student.id)) next.delete(row.student.id);
                                else next.add(row.student.id);
                                return next;
                              })
                            }
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: row.notes.trim() ? 'primary.light' : 'transparent',
                            }}
                          >
                            <EditNoteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Collapse in={noteOpen}>
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        minRows={2}
                        sx={{ mt: 1.5 }}
                        label="Anotação do aluno"
                        value={row.notes}
                        disabled={!access.editable || !row.status}
                        inputProps={{ maxLength: 1000 }}
                        helperText={
                          row.status ? `${row.notes.length}/1000` : 'Selecione uma situação para registrar uma anotação.'
                        }
                        onChange={(event) =>
                          updateRow(rowIndex, (current) => ({ ...current, notes: event.target.value }))
                        }
                      />
                    </Collapse>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </>
      )}

      <Dialog
        open={Boolean(replacementDialog)}
        onClose={() => setReplacementDialog(undefined)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 750, color: '#0F172A', px: 3, pt: 2.5, pb: 1 }}>
          <Stack direction="row" gap={1} alignItems="center">
            <EventRepeatOutlinedIcon color="secondary" fontSize="small" />
            Agendar reposição
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          <Stack gap={2} sx={{ pt: 1 }}>
            {replacementDialog?.error && <Alert severity="error" sx={{ borderRadius: 2 }}>{replacementDialog.error}</Alert>}
            <DateField
              label="Data da reposição"
              value={replacementDialog?.date ?? ''}
              allowFuture
              required
              onChange={(value) =>
                setReplacementDialog((current) => (current ? { ...current, date: value, error: undefined } : current))
              }
            />
            <TextField
              required
              size="small"
              label="Horário da reposição"
              type="time"
              value={replacementDialog?.time ?? ''}
              InputLabelProps={{ shrink: true }}
              onChange={(event) =>
                setReplacementDialog((current) =>
                  current ? { ...current, time: event.target.value, error: undefined } : current,
                )
              }
            />
            <TextField
              size="small"
              label="Observação da reposição"
              multiline
              minRows={3}
              value={replacementDialog?.notes ?? ''}
              inputProps={{ maxLength: 1000 }}
              placeholder="Motivo ou conteúdo a ser reposto"
              onChange={(event) =>
                setReplacementDialog((current) =>
                  current ? { ...current, notes: event.target.value, error: undefined } : current,
                )
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #F1F5F9' }}>
          <Button onClick={() => setReplacementDialog(undefined)} sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={confirmReplacement} sx={{ px: 2.5, fontWeight: 650 }}>
            Confirmar reposição
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice(undefined)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {notice ? (
          <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}

