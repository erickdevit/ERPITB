import { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useApp } from '../app-context';
import { DateField, PageDialog, Section, SelectField } from '../components';
import { formatDate, parseBrazilDate } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import {
  buildStudentViews,
  classesVisibleToSession,
  enrollmentStatusLabel,
  filterStudentViews,
  performanceTone,
  permissionsForStudents,
  validateStudentDraft,
  type PerformanceFilter,
  type StudentDraft,
  type StudentView,
} from './students-model';

const identifier = () => crypto.randomUUID();
const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const emptyDraft = (): StudentDraft => ({ classId: '', name: '', registrationNumber: '', cpf: '', contact: '', birthDate: '' });

function displayRegistrationDate(value: string): string {
  if (!value) return '—';
  const canonical = value.slice(0, 10);
  return formatDate(canonical) || '—';
}

function RateChip({ row }: { row: StudentView }) {
  return (
    <Chip
      size="small"
      color={performanceTone(row.attendanceRate)}
      variant={row.attendanceRecords ? 'filled' : 'outlined'}
      label={`${row.attendanceRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
      sx={{ fontWeight: 700, borderRadius: 2 }}
    />
  );
}

function StudentActions({
  row,
  canEdit,
  canDelete,
  canInactivate,
  onEdit,
  onRemove,
}: {
  row: StudentView;
  canEdit: boolean;
  canDelete: boolean;
  canInactivate: boolean;
  onEdit: (row: StudentView) => void;
  onRemove: (row: StudentView) => void;
}) {
  if (!canEdit && !canDelete && !canInactivate) return null;
  return (
    <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
      {canEdit && (
        <Tooltip title="Editar aluno">
          <IconButton aria-label={`Editar ${row.name}`} onClick={() => onEdit(row)} size="small">
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip title="Excluir aluno">
          <IconButton color="error" aria-label={`Excluir ${row.name}`} onClick={() => onRemove(row)} size="small">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canInactivate && (
        <Tooltip title="Inativar aluno">
          <IconButton color="warning" aria-label={`Inativar ${row.name}`} onClick={() => onRemove(row)} size="small">
            <PersonOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function MobileStudentCard({ row, actions }: { row: StudentView; actions?: React.ReactNode }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
      <CardActionArea component={Link} to={`/alunos/${row.id}`} aria-label={`Abrir detalhes de ${row.name}`}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" gap={1.5} alignItems="flex-start">
            <Avatar sx={{ bgcolor: '#F1F5F9', color: '#0F172A', width: 38, height: 38, borderRadius: 2, fontWeight: 700, fontSize: 15 }}>
              {row.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box flex={1} minWidth={0}>
              <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
                <Box minWidth={0}>
                  <Typography fontWeight={750} color="#0F172A" fontSize={14.5} noWrap>
                    {row.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Matrícula {row.registrationNumber}
                  </Typography>
                </Box>
                <Chip size="small" label={enrollmentStatusLabel(row.enrollmentStatus)} sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }} />
              </Stack>
              <Stack gap={0.4} mt={1.25}>
                <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                  <strong style={{ color: '#0F172A' }}>Turma:</strong> {row.className}
                </Typography>
                <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                  <strong style={{ color: '#0F172A' }}>Nascimento:</strong> {formatDate(row.birthDate) || '—'}
                </Typography>
                <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                  <strong style={{ color: '#0F172A' }}>Cadastro:</strong> {displayRegistrationDate(row.registrationDate)}
                </Typography>
                {row.contact && (
                  <Typography variant="caption" color="#475569" sx={{ fontSize: 12.5 }}>
                    <strong style={{ color: '#0F172A' }}>Contato:</strong> {row.contact}
                  </Typography>
                )}
                <Stack direction="row" alignItems="center" gap={1} mt={0.5}>
                  <Typography variant="caption" fontWeight={700} color="#0F172A">
                    Frequência:
                  </Typography>
                  <RateChip row={row} />
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
      {actions && (
        <>
          <Divider sx={{ borderColor: '#F1F5F9' }} />
          <Box px={1.5} py={0.5}>
            {actions}
          </Box>
        </>
      )}
    </Card>
  );
}

function StudentTable({ rows, renderActions }: { rows: StudentView[]; renderActions: (row: StudentView) => React.ReactNode }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Matrícula</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Turma</TableCell>
              <TableCell>Nascimento</TableCell>
              <TableCell>Cadastro</TableCell>
              <TableCell>Contato</TableCell>
              <TableCell>Situação</TableCell>
              <TableCell>Taxa</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} hover>
                <TableCell sx={{ fontWeight: 600, color: '#64748B', fontSize: 12.5 }}>{row.registrationNumber}</TableCell>
                <TableCell>
                  <Button
                    component={Link}
                    to={`/alunos/${row.id}`}
                    sx={{ px: 0, fontWeight: 700, color: '#0F172A', textAlign: 'left', minWidth: 0, '&:hover': { bgcolor: 'transparent', color: '#2563EB', textDecoration: 'underline' } }}
                  >
                    {row.name}
                  </Button>
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{row.className}</TableCell>
                <TableCell sx={{ color: '#475569' }}>{formatDate(row.birthDate) || '—'}</TableCell>
                <TableCell sx={{ color: '#475569' }}>{displayRegistrationDate(row.registrationDate)}</TableCell>
                <TableCell sx={{ color: '#475569' }}>{row.contact || '—'}</TableCell>
                <TableCell>
                  <Chip size="small" label={enrollmentStatusLabel(row.enrollmentStatus)} sx={{ fontWeight: 600, height: 20, fontSize: 10.5 }} />
                </TableCell>
                <TableCell>
                  <RateChip row={row} />
                </TableCell>
                <TableCell align="right">{renderActions(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export function StudentsPage() {
  const { store, sync, session, api } = useApp();
  const students = useEntity('students');
  const classes = useEntity('classes');
  const enrollments = useEntity('enrollments');
  const assignments = useEntity('class_teachers');
  const attendance = useEntity('attendance_records');
  const permissions = permissionsForStudents(session.role);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [directory, setDirectory] = useState<LocalRecord[]>([]);
  const [notice, setNotice] = useState<string>();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [performance, setPerformance] = useState<PerformanceFilter>('');
  const [status, setStatus] = useState('ativa');
  const [editing, setEditing] = useState<StudentView | 'new'>();
  const [draft, setDraft] = useState<StudentDraft>(emptyDraft);
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permissions.readOnly) return;
    let live = true;
    void api.get<{ items: LocalRecord[] }>('/users?role=professor&active=true').then((response) => {
      if (live) setDirectory(response.items);
    }).catch((error) => {
      if (live) setNotice(error instanceof Error
        ? `A lista local continua disponível, mas os professores não puderam ser atualizados: ${error.message}`
        : 'A lista local continua disponível, mas os professores não puderam ser atualizados.');
    });
    return () => { live = false; };
  }, [api, permissions.readOnly]);

  const visibleClasses = useMemo(() => classesVisibleToSession(classes.items, assignments.items, session), [assignments.items, classes.items, session]);
  const rows = useMemo(() => buildStudentViews({
    students: students.items,
    classes: classes.items,
    enrollments: enrollments.items,
    assignments: assignments.items,
    attendance: attendance.items,
    session,
  }), [assignments.items, attendance.items, classes.items, enrollments.items, session, students.items]);
  const shown = useMemo(() => filterStudentViews(rows, {
    query,
    classId: classFilter,
    teacherId: teacherFilter,
    performance,
    enrollmentStatus: status,
  }), [classFilter, performance, query, rows, status, teacherFilter]);
  const activeTeachers = directory.filter((item) => !item.deleted_at && item.active !== 0 && item.active !== false);
  const loading = students.loading || classes.loading || enrollments.loading || assignments.loading || attendance.loading;

  const startCreate = () => {
    if (!visibleClasses.length) {
      setNotice('Cadastre uma turma ativa antes de criar um aluno.');
      return;
    }
    setDraft({ ...emptyDraft(), classId: classFilter || visibleClasses[0]!.id });
    setFormError(undefined);
    setEditing('new');
  };

  const startEdit = (row: StudentView) => {
    setDraft({
      classId: row.classId,
      name: row.name,
      registrationNumber: row.registrationNumber,
      cpf: row.cpf,
      contact: row.contact,
      birthDate: formatDate(row.birthDate),
    });
    setFormError(undefined);
    setEditing(row);
  };

  const save = async () => {
    if (busy || !editing) return;
    const validation = validateStudentDraft(draft, new Set(visibleClasses.map((item) => item.id)));
    if (validation) { setFormError(validation); return; }
    let birthDate: string | null;
    try { birthDate = draft.birthDate ? parseBrazilDate(draft.birthDate) : null; }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Data de nascimento inválida.'); return; }
    setBusy(true);
    setFormError(undefined);
    try {
      const previous = editing === 'new' ? undefined : editing;
      const studentId = previous?.id ?? identifier();
      await store.mutate('students', {
        ...previous?.record,
        id: studentId,
        name: draft.name.trim(),
        registration_number: draft.registrationNumber.trim(),
        cpf: draft.cpf.trim() || null,
        contact: draft.contact.trim() || null,
        birth_date: birthDate,
        active: previous?.record.active ?? 1,
      });
      if (!previous || previous.classId !== draft.classId) await store.moveStudent(studentId, draft.classId);
      setEditing(undefined);
      await Promise.all([students.reload(), enrollments.reload()]);
      void sync();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o aluno.');
    } finally { setBusy(false); }
  };

  const remove = async (row: StudentView) => {
    const deleting = permissions.canDelete;
    const question = deleting
      ? `Excluir ${row.name}? O aluno sairá das listagens e da turma, mas o histórico registrado será preservado.`
      : `Inativar ${row.name}? O aluno deixará de aparecer como ativo, mas o histórico será preservado.`;
    if (!window.confirm(question)) return;
    try {
      if (deleting) await store.mutate('students', row.record, 'delete');
      else await store.mutate('students', { ...row.record, active: 0 });
      await students.reload();
      void sync();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Não foi possível ${deleting ? 'excluir' : 'inativar'} o aluno.`);
    }
  };

  const actions = (row: StudentView) => (
    <StudentActions
      row={row}
      canEdit={permissions.canEdit}
      canDelete={permissions.canDelete}
      canInactivate={permissions.canInactivate}
      onEdit={startEdit}
      onRemove={(value) => void remove(value)}
    />
  );

  return (
    <Section
      title="Alunos"
      subtitle="Cadastro de alunos, matrículas e acompanhamento de frequência"
      action={
        permissions.canCreate ? (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            disabled={!visibleClasses.length}
            onClick={startCreate}
            sx={{ px: 2.25, py: 0.8, borderRadius: 2, fontWeight: 650 }}
          >
            Novo aluno
          </Button>
        ) : undefined
      }
    >
      {permissions.readOnly && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Você está vendo somente os alunos das turmas atribuídas ao seu perfil.
        </Alert>
      )}
      {notice && (
        <Alert severity="warning" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={1.5} flexWrap="wrap">
            <Box sx={{ width: { xs: '100%', lg: 260 } }}>
              <SelectField
                label="Turma"
                value={classFilter}
                onChange={setClassFilter}
                options={[{ value: '', label: 'Todas as turmas' }, ...visibleClasses.map((item) => ({ value: item.id, label: text(item, 'name') }))]}
              />
            </Box>
            <TextField
              size="small"
              label="Buscar aluno ou matrícula"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ flex: 1, minWidth: { xs: '100%', lg: 240 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {!permissions.readOnly && (
              <Box sx={{ width: { xs: '100%', lg: 220 } }}>
                <SelectField
                  label="Professor"
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  options={[{ value: '', label: 'Todos os professores' }, ...activeTeachers.map((item) => ({ value: item.id, label: text(item, 'name') }))]}
                />
              </Box>
            )}
            <Box sx={{ width: { xs: '100%', sm: 180 } }}>
              <SelectField
                label="Desempenho"
                value={performance}
                onChange={(value) => setPerformance(value as PerformanceFilter)}
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'critical', label: 'Crítico (<75%)' },
                  { value: 'attention', label: 'Atenção (75–85%)' },
                  { value: 'regular', label: 'Regular (>85%)' },
                ]}
              />
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 160 } }}>
              <SelectField
                label="Matrícula"
                value={status}
                onChange={setStatus}
                options={[
                  { value: '', label: 'Todos os alunos' },
                  { value: 'ativa', label: 'Ativa' },
                  { value: 'trancada', label: 'Trancada' },
                  { value: 'concluida', label: 'Concluída' },
                ]}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {loading && <LinearProgress aria-label="Carregando alunos" sx={{ height: 2 }} />}
      {!loading && !shown.length && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="text.secondary" fontWeight={600}>
              Nenhum aluno corresponde aos filtros.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading &&
        shown.length > 0 &&
        (compact ? (
          <Stack gap={1.25} data-testid="mobile-student-list">
            {shown.map((row) => (
              <MobileStudentCard key={row.key} row={row} actions={actions(row)} />
            ))}
          </Stack>
        ) : (
          <StudentTable rows={shown} renderActions={actions} />
        ))}

      <PageDialog
        open={Boolean(editing)}
        title={editing === 'new' ? 'Novo aluno' : 'Editar aluno'}
        onClose={() => !busy && setEditing(undefined)}
        onSave={() => void save()}
        saveText={busy ? 'Salvando…' : 'Salvar'}
      >
        {formError && <Alert severity="error" sx={{ borderRadius: 2 }}>{formError}</Alert>}
        <SelectField
          label="Turma *"
          value={draft.classId}
          onChange={(classId) => setDraft({ ...draft, classId })}
          options={visibleClasses.map((item) => ({ value: item.id, label: text(item, 'name') }))}
        />
        <TextField
          required
          size="small"
          label="Nome completo"
          value={draft.name}
          inputProps={{ maxLength: 160 }}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <TextField
          required
          size="small"
          label="Matrícula"
          value={draft.registrationNumber}
          inputProps={{ maxLength: 40 }}
          onChange={(event) => setDraft({ ...draft, registrationNumber: event.target.value })}
        />
        <TextField
          size="small"
          label="CPF"
          value={draft.cpf}
          inputProps={{ maxLength: 20 }}
          onChange={(event) => setDraft({ ...draft, cpf: event.target.value })}
        />
        <TextField
          size="small"
          label="Contato"
          value={draft.contact}
          inputProps={{ maxLength: 200 }}
          onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
        />
        <DateField label="Data de nascimento" value={draft.birthDate} onChange={(birthDate) => setDraft({ ...draft, birthDate })} />
        {editing !== 'new' && <TextField size="small" label="Data de cadastro" value={displayRegistrationDate(editing?.registrationDate ?? '')} disabled />}
      </PageDialog>
    </Section>
  );
}
