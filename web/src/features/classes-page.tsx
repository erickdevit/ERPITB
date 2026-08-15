import { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChildCareOutlinedIcon from '@mui/icons-material/ChildCareOutlined';
import CoPresentOutlinedIcon from '@mui/icons-material/CoPresentOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Switch,
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
import { PageDialog, Section, SelectField } from '../components';
import type { LocalRecord } from '../types';
import {
  buildClassViews,
  classShifts,
  classWeekDays,
  filterClassViews,
  permissionsForClasses,
  planTeacherToggle,
  shiftLabel,
  validateClassDraft,
  type ClassDraft,
  type ClassView,
} from './classes-model';
import { useEntity } from '../lib/use-entity';

const identifier = () => crypto.randomUUID();
const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const emptyDraft = (): ClassDraft => ({ name: '', courseId: '', shift: 'manha', weekDay: '', laboratoryId: '', teacherId: '', isKids: false });

function MetadataChip({ icon, label }: { icon: React.ReactElement; label: string }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={icon}
      label={label}
      sx={{
        bgcolor: '#F8FAFC',
        borderColor: '#E2E8F0',
        color: '#475569',
        fontWeight: 500,
        fontSize: 11.5,
        height: 24,
      }}
    />
  );
}

function TeacherNames({ row }: { row: ClassView }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
      {row.teachers.length ? row.teachers.map((teacher) => teacher.name).join(', ') : 'Sem professor vinculado'}
    </Typography>
  );
}

function ClassActions({
  row,
  onEdit,
  onTeachers,
  onDelete,
  canEdit,
  canAssignTeachers,
  canDelete,
}: {
  row: ClassView;
  onEdit: (row: ClassView) => void;
  onTeachers: (row: ClassView) => void;
  onDelete: (row: ClassView) => void;
  canEdit: boolean;
  canAssignTeachers: boolean;
  canDelete: boolean;
}) {
  if (!canEdit && !canAssignTeachers && !canDelete) return null;
  return (
    <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
      {canEdit && (
        <Tooltip title="Editar turma">
          <IconButton aria-label={`Editar ${row.name}`} onClick={() => onEdit(row)} size="small">
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canAssignTeachers && (
        <Tooltip title="Gerenciar professores">
          <IconButton aria-label={`Gerenciar professores de ${row.name}`} onClick={() => onTeachers(row)} size="small">
            <CoPresentOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip title="Excluir turma">
          <IconButton color="error" aria-label={`Excluir ${row.name}`} onClick={() => onDelete(row)} size="small">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

function MobileClassCard({ row, actions }: { row: ClassView; actions?: React.ReactNode }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5, overflow: 'hidden' }}>
      <CardActionArea component={Link} to={`/turmas/${row.id}`} aria-label={`Abrir detalhes de ${row.name}`}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" gap={1.5} alignItems="flex-start">
            <Avatar
              sx={{
                bgcolor: row.isKids ? '#FFFBEB' : '#EFF6FF',
                color: row.isKids ? '#D97706' : '#1976D2',
                width: 38,
                height: 38,
                borderRadius: 2,
              }}
            >
              {row.isKids ? <ChildCareOutlinedIcon fontSize="small" /> : <GroupsOutlinedIcon fontSize="small" />}
            </Avatar>
            <Box flex={1} minWidth={0}>
              <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
                <Typography fontWeight={750} color="#0F172A" fontSize={15}>
                  {row.name}
                </Typography>
                {row.isKids && (
                  <Chip
                    size="small"
                    label="Kids"
                    sx={{ bgcolor: '#FFFBEB', color: '#D97706', fontWeight: 700, height: 20, fontSize: 10.5 }}
                  />
                )}
                {!row.active && <Chip size="small" label="Inativa" sx={{ height: 20, fontSize: 10.5 }} />}
              </Stack>
              <Typography fontWeight={500} color="text.secondary" fontSize={13} mt={0.25}>
                {row.courseName}
              </Typography>
              <Stack direction="row" gap={0.75} flexWrap="wrap" mt={1}>
                <MetadataChip icon={<ScheduleOutlinedIcon fontSize="small" />} label={shiftLabel(row.shift)} />
                {row.weekDay && <MetadataChip icon={<CalendarTodayOutlinedIcon fontSize="small" />} label={row.weekDay} />}
                {row.laboratoryName && <MetadataChip icon={<ScienceOutlinedIcon fontSize="small" />} label={row.laboratoryName} />}
              </Stack>
              <Box mt={0.75}>
                <TeacherNames row={row} />
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
      {actions && (
        <Box px={1.5} pb={0.75} pt={0} onClick={(event) => event.stopPropagation()} sx={{ borderTop: '1px solid #F1F5F9' }}>
          {actions}
        </Box>
      )}
    </Card>
  );
}

function ClassTable({ rows, renderActions }: { rows: ClassView[]; renderActions: (row: ClassView) => React.ReactNode }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Turma</TableCell>
              <TableCell>Curso</TableCell>
              <TableCell>Turno / Dia</TableCell>
              <TableCell>Laboratório</TableCell>
              <TableCell>Professor(es)</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <Stack direction="row" gap={1} alignItems="center">
                    <Button
                      component={Link}
                      to={`/turmas/${row.id}`}
                      sx={{ px: 0, fontWeight: 700, color: '#1976D2', textAlign: 'left', minWidth: 0, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
                    >
                      {row.name}
                    </Button>
                    {row.isKids && (
                      <Chip
                        size="small"
                        label="Kids"
                        sx={{ bgcolor: '#FFFBEB', color: '#D97706', fontWeight: 700, height: 20, fontSize: 10 }}
                      />
                    )}
                    {!row.active && <Chip size="small" label="Inativa" sx={{ height: 20, fontSize: 10 }} />}
                  </Stack>
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{row.courseName}</TableCell>
                <TableCell sx={{ color: '#475569' }}>
                  {shiftLabel(row.shift)}
                  {row.weekDay ? ` · ${row.weekDay}` : ''}
                </TableCell>
                <TableCell sx={{ color: '#475569' }}>{row.laboratoryName || '—'}</TableCell>
                <TableCell>
                  <TeacherNames row={row} />
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

export function ClassesPage() {
  const { store, sync, session, api } = useApp();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const laboratories = useEntity('laboratories');
  const assignments = useEntity('class_teachers', true);
  const enrollments = useEntity('enrollments');
  const students = useEntity('students');
  const permissions = permissionsForClasses(session.role);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [directory, setDirectory] = useState<LocalRecord[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [query, setQuery] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [editing, setEditing] = useState<ClassView | 'new'>();
  const [draft, setDraft] = useState<ClassDraft>(emptyDraft);
  const [formError, setFormError] = useState<string>();
  const [teacherClass, setTeacherClass] = useState<ClassView>();
  const [teacherSearch, setTeacherSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!permissions.canAssignTeachers) return;
    let live = true;
    void api.get<{ items: LocalRecord[] }>('/users?role=professor&active=true').then((response) => {
      if (!live) return;
      setDirectory(response.items);
      setDirectoryLoaded(true);
    }).catch((error) => {
      if (!live) return;
      setDirectoryLoaded(false);
      setNotice(error instanceof Error
        ? `Não foi possível atualizar a lista de professores: ${error.message}`
        : 'Não foi possível atualizar a lista de professores.');
    });
    return () => { live = false; };
  }, [api, permissions.canAssignTeachers]);

  const views = useMemo(() => buildClassViews({
    classes: classes.items,
    courses: courses.items,
    laboratories: laboratories.items,
    assignments: assignments.items,
    teachers: directory,
    session,
  }), [assignments.items, classes.items, courses.items, directory, laboratories.items, session]);
  const shown = useMemo(() => filterClassViews(views, query, teacherFilter), [query, teacherFilter, views]);
  const availableCourses = courses.items.filter(active);
  const availableLabs = laboratories.items.filter(active);
  const activeTeachers = directory.filter(active);
  const loading = classes.loading || courses.loading || laboratories.loading || assignments.loading || enrollments.loading || students.loading;

  const startCreate = () => {
    if (!availableCourses.length) {
      setNotice('Cadastre um curso ativo antes de criar uma turma.');
      return;
    }
    setDraft({ ...emptyDraft(), courseId: availableCourses[0]!.id });
    setFormError(undefined);
    setEditing('new');
  };
  const startEdit = (row: ClassView) => {
    setDraft({
      name: row.name,
      courseId: row.courseId,
      shift: row.shift,
      weekDay: row.weekDay,
      laboratoryId: text(row.record, 'laboratory_id'),
      teacherId: '',
      isKids: row.isKids,
    });
    setFormError(undefined);
    setEditing(row);
  };
  const save = async () => {
    if (busy) return;
    const validation = validateClassDraft(draft, new Set(availableCourses.map((course) => course.id)));
    if (validation) { setFormError(validation); return; }
    setBusy(true);
    try {
      const existing = editing === 'new' ? undefined : editing?.record;
      const classId = existing?.id ?? identifier();
      await store.mutate('classes', {
        ...existing,
        id: classId,
        course_id: draft.courseId,
        name: draft.name.trim(),
        shift: draft.shift,
        week_day: draft.weekDay || null,
        laboratory_id: draft.laboratoryId || null,
        is_kids: draft.isKids ? 1 : 0,
        active: existing?.active ?? 1,
      });
      if (editing === 'new' && draft.teacherId) {
        await store.mutate('class_teachers', { id: identifier(), class_id: classId, user_id: draft.teacherId });
      }
      setEditing(undefined);
      setNotice(editing === 'new' && !draft.teacherId ? 'Turma criada sem professor. O vínculo pode ser feito depois.' : undefined);
      await Promise.all([classes.reload(), assignments.reload()]);
      void sync();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a turma.');
    } finally { setBusy(false); }
  };
  const remove = async (row: ClassView) => {
    const studentIds = new Set(students.items.filter(active).map((student) => student.id));
    const hasActiveStudents = enrollments.items.some((enrollment) => enrollment.class_id === row.id
      && enrollment.status === 'ativa' && !enrollment.deleted_at && studentIds.has(text(enrollment, 'student_id')));
    if (hasActiveStudents) {
      setNotice('Transfira ou exclua os alunos ativos antes de excluir a turma.');
      return;
    }
    if (!window.confirm(`Excluir a turma ${row.name}? O histórico ficará preservado.`)) return;
    try {
      await store.mutate('classes', row.record, 'delete');
      await classes.reload();
      void sync();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível excluir a turma.'); }
  };
  const toggleTeacher = async (teacherId: string, checked: boolean) => {
    if (!teacherClass || busy) return;
    const activeTeacherIds = directoryLoaded ? new Set(activeTeachers.map((teacher) => teacher.id)) : undefined;
    const plan = planTeacherToggle(assignments.items, teacherClass.id, teacherId, checked, activeTeacherIds);
    if (plan.kind === 'none') return;
    if (plan.kind === 'error') { setNotice(plan.message); return; }
    setBusy(true);
    try {
      if (plan.kind === 'delete') await store.mutate('class_teachers', plan.record, 'delete');
      if (plan.kind === 'upsert') await store.mutate('class_teachers', {
        ...plan.record,
        id: plan.record?.id ?? identifier(),
        class_id: teacherClass.id,
        user_id: teacherId,
      });
      await assignments.reload();
      void sync();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível alterar o vínculo.'); }
    finally { setBusy(false); }
  };
  const renderActions = (row: ClassView) => <ClassActions row={row} onEdit={startEdit} onTeachers={(value) => { setTeacherSearch(''); setTeacherClass(value); }} onDelete={(value) => void remove(value)} {...permissions} />;
  const assignedIds = new Set(assignments.items.filter((item) => item.class_id === teacherClass?.id && !item.deleted_at).map((item) => text(item, 'user_id')));
  const shownTeachers = activeTeachers.filter((teacher) => `${text(teacher, 'name')} ${text(teacher, 'email')}`.toLocaleLowerCase('pt-BR').includes(teacherSearch.toLocaleLowerCase('pt-BR')));

  return (
    <Section
      title={permissions.readOnly ? 'Minhas turmas' : 'Turmas'}
      subtitle="Gestão de turmas, turnos e professores responsáveis"
      action={
        permissions.canCreate ? (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={startCreate}
            sx={{ px: 2.25, py: 0.8, borderRadius: 2, fontWeight: 650 }}
          >
            Nova turma
          </Button>
        ) : undefined
      }
    >
      {loading && <LinearProgress aria-label="Carregando turmas" sx={{ height: 2 }} />}
      {notice && (
        <Alert severity="warning" onClose={() => setNotice(undefined)} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}
      {permissions.readOnly && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Estas são as turmas atribuídas a você. A gestão cadastral é feita pela equipe administrativa.
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <TextField
              size="small"
              label="Buscar turma ou curso"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {permissions.canAssignTeachers && (
              <Box sx={{ width: { xs: '100%', md: 280 } }}>
                <SelectField
                  label="Professor"
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  options={[
                    { value: '', label: 'Todos os professores' },
                    ...activeTeachers.map((teacher) => ({ value: teacher.id, label: text(teacher, 'name') })),
                  ]}
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      {!loading && !shown.length && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <GroupsOutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            <Typography mt={1} fontWeight={700} color="#0F172A">
              {query || teacherFilter
                ? 'Nenhuma turma corresponde aos filtros.'
                : permissions.readOnly
                ? 'Nenhuma turma foi atribuída a você.'
                : 'Nenhuma turma cadastrada.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {shown.length > 0 &&
        (compact ? (
          <Stack gap={1.25}>
            {shown.map((row) => (
              <MobileClassCard key={row.id} row={row} actions={renderActions(row)} />
            ))}
          </Stack>
        ) : (
          <ClassTable rows={shown} renderActions={renderActions} />
        ))}

      <PageDialog
        open={Boolean(editing)}
        title={editing === 'new' ? 'Nova turma' : 'Editar turma'}
        onClose={() => setEditing(undefined)}
        onSave={() => void save()}
        saveText={busy ? 'Salvando…' : 'Salvar'}
      >
        {formError && <Alert severity="error" sx={{ borderRadius: 2 }}>{formError}</Alert>}
        <SelectField
          label="Curso"
          value={draft.courseId}
          onChange={(courseId) => setDraft({ ...draft, courseId })}
          options={availableCourses.map((course) => ({ value: course.id, label: text(course, 'name') }))}
        />
        <TextField
          required
          size="small"
          label="Nome da turma"
          placeholder="Ex.: 1º Ano A"
          value={draft.name}
          inputProps={{ maxLength: 120 }}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
          <SelectField
            label="Turno"
            value={draft.shift}
            onChange={(shift) => setDraft({ ...draft, shift })}
            options={classShifts.map((shift) => ({ value: shift, label: shiftLabel(shift) }))}
          />
          <SelectField
            label="Dia da semana"
            value={draft.weekDay}
            onChange={(weekDay) => setDraft({ ...draft, weekDay })}
            options={[{ value: '', label: 'Não especificado' }, ...classWeekDays.map((day) => ({ value: day, label: day }))]}
          />
        </Stack>
        <SelectField
          label="Laboratório"
          value={draft.laboratoryId}
          onChange={(laboratoryId) => setDraft({ ...draft, laboratoryId })}
          options={[
            { value: '', label: 'Nenhum laboratório' },
            ...availableLabs.map((laboratory) => ({ value: laboratory.id, label: text(laboratory, 'name') })),
          ]}
        />
        <FormControlLabel
          control={<Switch checked={draft.isKids} onChange={(event) => setDraft({ ...draft, isKids: event.target.checked })} />}
          label="Turma Kids"
        />
        {editing === 'new' && (
          <SelectField
            label="Professor responsável (opcional)"
            value={draft.teacherId}
            onChange={(teacherId) => setDraft({ ...draft, teacherId })}
            options={[
              { value: '', label: 'Vincular depois' },
              ...activeTeachers.map((teacher) => ({ value: teacher.id, label: text(teacher, 'name') })),
            ]}
          />
        )}
      </PageDialog>

      <Dialog
        open={Boolean(teacherClass)}
        onClose={() => !busy && setTeacherClass(undefined)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 750, color: '#0F172A', px: 3, pt: 2.5, pb: 1 }}>
          Professores • {teacherClass?.name}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          <Stack gap={1.5} pt={1}>
            {!directoryLoaded && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                A lista de contas exige conexão. Os vínculos já sincronizados continuam visíveis na turma.
              </Alert>
            )}
            <TextField
              size="small"
              label="Buscar professor por nome ou e-mail"
              value={teacherSearch}
              onChange={(event) => setTeacherSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {directoryLoaded && !activeTeachers.length && (
              <Typography color="text.secondary" variant="body2">Nenhum professor ativo foi encontrado.</Typography>
            )}
            <List disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
              {shownTeachers.map((teacher) => {
                const checked = assignedIds.has(teacher.id);
                return (
                  <ListItemButton
                    key={teacher.id}
                    disabled={busy}
                    onClick={() => void toggleTeacher(teacher.id, !checked)}
                    sx={{ borderRadius: 2, mb: 0.5 }}
                  >
                    <ListItemIcon>
                      <Checkbox edge="start" checked={checked} tabIndex={-1} />
                    </ListItemIcon>
                    <ListItemText primary={text(teacher, 'name')} secondary={text(teacher, 'email')} />
                  </ListItemButton>
                );
              })}
            </List>
            {directoryLoaded && activeTeachers.length > 0 && !shownTeachers.length && (
              <Typography color="text.secondary" variant="body2">Nenhum professor corresponde à busca.</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #F1F5F9' }}>
          <Button variant="contained" onClick={() => setTeacherClass(undefined)} disabled={busy} sx={{ px: 2.5, fontWeight: 650 }}>
            Concluir
          </Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}
