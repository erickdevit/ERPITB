import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEntity } from '../lib/use-entity';
import { buildAnalytics, type AnalyticsResult } from '../lib/analytics';
import { formatDate, todayInSaoPaulo } from '../lib/date';
import type { LocalRecord } from '../types';

const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const statusLabel: Record<string, string> = {
  P: 'Presente',
  F: 'Falta',
  J: 'Justificada',
  A: 'Atraso',
  R: 'Reposição',
  RC: 'Reposição concluída',
};
const statusColors = ['#2E7D32', '#D32F2F', '#00838F', '#ED6C02', '#7B1FA2'];

function daysAgo(days: number) {
  const value = new Date(`${todayInSaoPaulo()}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
      <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="h6" component="p" color="#0F172A" fontWeight={800} sx={{ my: 0.25, letterSpacing: '-0.02em' }}>
          {value}
        </Typography>
        {detail && (
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function Overview({ analytics, calls }: { analytics: AnalyticsResult; calls: number }) {
  const distribution = [
    { name: 'Presentes', value: analytics.present },
    { name: 'Faltas', value: analytics.absent },
    { name: 'Justificadas', value: analytics.justified },
    { name: 'Atrasos', value: analytics.delayed },
    { name: 'Reposições', value: analytics.replacements },
  ];
  return (
    <>
      <Grid container spacing={1.25} columns={{ xs: 2, sm: 6, lg: 12 }}>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Frequência" value={`${analytics.attendanceRate}%`} />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Alunos ativos" value={analytics.activeStudents} />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Chamadas" value={calls} detail="Turma e data distintas" />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Presenças" value={analytics.present} />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Faltas" value={analytics.absent} />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <Metric label="Em risco" value={analytics.riskStudents} />
        </Grid>
      </Grid>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle2" fontWeight={750} color="#0F172A">
                Evolução da frequência
              </Typography>
              <Box sx={{ height: 260, mt: 1.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.evolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                    <Tooltip
                      labelFormatter={(value) => formatDate(String(value))}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                    />
                    <Line type="monotone" dataKey="rate" name="Frequência" stroke="#2563EB" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle2" fontWeight={750} color="#0F172A">
                Distribuição das marcações
              </Typography>
              <Box sx={{ height: 230 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {distribution.map((item, index) => (
                        <Cell key={item.name} fill={statusColors[index]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" flexWrap="wrap" gap={0.75} justifyContent="center">
                {distribution.map((item, index) => (
                  <Chip
                    key={item.name}
                    size="small"
                    label={`${item.name}: ${item.value}`}
                    sx={{ borderColor: statusColors[index], fontWeight: 600, height: 22, fontSize: 11 }}
                    variant="outlined"
                  />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

function DetailHeader({
  backTo,
  backLabel,
  title,
  subtitle,
  activeRecord = true,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  activeRecord?: boolean;
}) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.25 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ sm: 'center' }}>
          <Box>
            <Button
              component={Link}
              to={backTo}
              startIcon={<ArrowBackOutlinedIcon fontSize="small" />}
              sx={{ px: 0, fontWeight: 650, color: 'text.secondary', mb: 0.5, fontSize: 13, minWidth: 0, '&:hover': { bgcolor: 'transparent' } }}
            >
              {backLabel}
            </Button>
            <Typography variant="h5" fontWeight={800} color="#0F172A" letterSpacing="-0.02em">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Chip
            label={activeRecord ? 'Ativo' : 'Inativo'}
            color={activeRecord ? 'success' : 'default'}
            sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 650, height: 24 }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return <LinearProgress aria-label="Carregando detalhes" sx={{ height: 2 }} />;
}
function Missing({ label }: { label: string }) {
  return (
    <Alert severity="warning" sx={{ borderRadius: 2 }}>
      {label} não encontrado ou indisponível para este perfil.
    </Alert>
  );
}

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const courses = useEntity('courses');
  const classes = useEntity('classes');
  const enrollments = useEntity('enrollments');
  const students = useEntity('students');
  const attendance = useEntity('attendance_records');
  const classTeachers = useEntity('class_teachers');
  if ([courses, classes, enrollments, students, attendance, classTeachers].some((value) => value.loading))
    return <LoadingState />;
  const course = courses.items.find((item) => item.id === courseId);
  if (!course) return <Missing label="Curso" />;
  const ownClasses = classes.items.filter((item) => item.course_id === courseId && active(item));
  const ownIds = new Set(ownClasses.map((item) => item.id));
  const ownRecords = attendance.items.filter((item) => ownIds.has(String(item.class_id)) && String(item.date) >= daysAgo(89));
  const analytics = buildAnalytics(
    {
      attendance: attendance.items,
      classes: classes.items,
      students: students.items,
      enrollments: enrollments.items,
      classTeachers: classTeachers.items,
    },
    { from: daysAgo(89), to: todayInSaoPaulo(), courseId },
  );
  const calls = new Set(ownRecords.map((item) => `${item.class_id}:${item.date}`)).size;

  return (
    <Stack gap={2}>
      <DetailHeader
        backTo="/cursos"
        backLabel="Voltar para cursos"
        title={text(course, 'name')}
        subtitle={`Código: ${text(course, 'code') || 'não informado'} · últimos 90 dias`}
        activeRecord={active(course)}
      />
      <Overview analytics={analytics} calls={calls} />
      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Typography variant="subtitle1" fontWeight={750} color="#0F172A" mb={1}>
            Turmas do curso
          </Typography>
          <Stack divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />}>
            {ownClasses.map((item) => {
              const summary = analytics.byClass.find((value) => value.id === item.id);
              return (
                <Button
                  key={item.id}
                  component={Link}
                  to={`/turmas/${item.id}`}
                  sx={{ justifyContent: 'space-between', py: 1.25, color: '#0F172A', fontWeight: 650, borderRadius: 2 }}
                >
                  <span>
                    {text(item, 'name')} · {text(item, 'shift')}
                  </span>
                  <Chip
                    size="small"
                    label={`${summary?.rate ?? 0}%`}
                    color={(summary?.rate ?? 0) < 75 ? 'error' : 'success'}
                    sx={{ fontWeight: 650, height: 22, fontSize: 11 }}
                  />
                </Button>
              );
            })}
            {!ownClasses.length && <Typography color="text.secondary" variant="body2">Nenhuma turma ativa neste curso.</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function ClassDetailPage() {
  const { classId = '' } = useParams();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const labs = useEntity('laboratories');
  const enrollments = useEntity('enrollments');
  const students = useEntity('students');
  const attendance = useEntity('attendance_records');
  const classTeachers = useEntity('class_teachers');
  const replacements = useEntity('replacements');
  if ([classes, courses, labs, enrollments, students, attendance, classTeachers, replacements].some((value) => value.loading))
    return <LoadingState />;
  const classRecord = classes.items.find((item) => item.id === classId);
  if (!classRecord) return <Missing label="Turma" />;
  const course = courses.items.find((item) => item.id === classRecord.course_id);
  const lab = labs.items.find((item) => item.id === classRecord.laboratory_id);
  const ownEnrollments = enrollments.items.filter((item) => item.class_id === classId && item.status === 'ativa' && !item.deleted_at);
  const roster = ownEnrollments
    .map((item) => students.items.find((student) => student.id === item.student_id))
    .filter((item): item is LocalRecord => Boolean(item));
  const ownRecords = attendance.items.filter((item) => item.class_id === classId && String(item.date) >= daysAgo(89));
  const analytics = buildAnalytics(
    {
      attendance: attendance.items,
      classes: classes.items,
      students: students.items,
      enrollments: enrollments.items,
      classTeachers: classTeachers.items,
    },
    { from: daysAgo(89), to: todayInSaoPaulo(), classId },
  );
  const calls = new Set(ownRecords.map((item) => String(item.date))).size;
  const openReplacements = replacements.items.filter((item) => item.class_id === classId && !item.completed_at).length;

  return (
    <Stack gap={2}>
      <DetailHeader
        backTo="/turmas"
        backLabel="Voltar para turmas"
        title={text(classRecord, 'name')}
        subtitle={`${text(course, 'name') || 'Curso não informado'} · ${text(classRecord, 'shift')} · ${text(classRecord, 'week_day') || 'dia não informado'} · ${text(lab, 'name') || 'sem laboratório'}`}
        activeRecord={active(classRecord)}
      />
      <Overview analytics={analytics} calls={calls} />
      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={750} color="#0F172A">
                Alunos da turma
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {roster.length} matrículas ativas · {openReplacements} reposições em aberto
              </Typography>
            </Box>
            <Button
              component={Link}
              to={`/frequencia?turma=${classId}`}
              variant="outlined"
              size="small"
              startIcon={<FactCheckOutlinedIcon fontSize="small" />}
              sx={{ borderRadius: 2, fontWeight: 650 }}
            >
              Abrir frequência
            </Button>
          </Stack>
          <Divider sx={{ my: 1.25, borderColor: '#F1F5F9' }} />
          <Stack divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />}>
            {roster
              .sort((left, right) => text(left, 'name').localeCompare(text(right, 'name')))
              .map((student) => {
                const ranking = analytics.topAbsentees.find((item) => item.studentId === student.id);
                return (
                  <Button
                    key={student.id}
                    component={Link}
                    to={`/alunos/${student.id}`}
                    sx={{ justifyContent: 'space-between', py: 1, color: '#0F172A', fontWeight: 650, borderRadius: 2 }}
                  >
                    <span>
                      {text(student, 'name')} · {text(student, 'registration_number')}
                    </span>
                    <Typography variant="body2" color={ranking ? 'error.main' : 'text.secondary'} fontWeight={600}>
                      {ranking ? `${ranking.rate}% · ${ranking.absences} faltas` : 'Sem faltas no período'}
                    </Typography>
                  </Button>
                );
              })}
            {!roster.length && <Typography color="text.secondary" variant="body2">Nenhum aluno com matrícula ativa.</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function StudentDetailPage() {
  const { studentId = '' } = useParams();
  const students = useEntity('students');
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const enrollments = useEntity('enrollments', true);
  const attendance = useEntity('attendance_records', true);
  const classTeachers = useEntity('class_teachers');
  const replacements = useEntity('replacements', true);
  if ([students, classes, courses, enrollments, attendance, classTeachers, replacements].some((value) => value.loading))
    return <LoadingState />;
  const student = students.items.find((item) => item.id === studentId);
  if (!student) return <Missing label="Aluno" />;
  const ownEnrollments = enrollments.items
    .filter((item) => item.student_id === studentId)
    .sort((left, right) => text(right, 'updated_at').localeCompare(text(left, 'updated_at')));
  const currentEnrollment = ownEnrollments.find((item) => item.status === 'ativa' && !item.deleted_at);
  const currentClass = classes.items.find((item) => item.id === currentEnrollment?.class_id);
  const course = courses.items.find((item) => item.id === currentClass?.course_id);
  const ownRecords = attendance.items
    .filter((item) => item.student_id === studentId && !item.deleted_at && String(item.date) >= daysAgo(89))
    .sort((left, right) => text(right, 'date').localeCompare(text(left, 'date')));
  const analytics = buildAnalytics(
    {
      attendance: attendance.items,
      classes: classes.items,
      students: students.items,
      enrollments: enrollments.items,
      classTeachers: classTeachers.items,
    },
    { from: daysAgo(89), to: todayInSaoPaulo(), studentId },
  );
  const calls = new Set(ownRecords.map((item) => `${item.class_id}:${item.date}`)).size;
  const ownReplacements = replacements.items.filter((item) => item.student_id === studentId && !item.deleted_at);

  return (
    <Stack gap={2}>
      <DetailHeader
        backTo="/alunos"
        backLabel="Voltar para alunos"
        title={text(student, 'name')}
        subtitle={`Matrícula: ${text(student, 'registration_number')} · ${text(course, 'name') || 'curso não informado'} / ${text(currentClass, 'name') || 'sem turma ativa'}`}
        activeRecord={active(student)}
      />
      <Overview analytics={analytics} calls={calls} />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" fontWeight={750} color="#0F172A">
                Histórico de matrículas
              </Typography>
              <Stack divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />} mt={1.25}>
                {ownEnrollments.map((item) => {
                  const classRecord = classes.items.find((value) => value.id === item.class_id);
                  return (
                    <Box key={item.id} py={0.75}>
                      <Button component={Link} to={`/turmas/${item.class_id}`} sx={{ px: 0, fontWeight: 700, color: '#0F172A', minWidth: 0, '&:hover': { color: '#2563EB', textDecoration: 'underline', bgcolor: 'transparent' } }}>
                        {text(classRecord, 'name') || 'Turma removida'}
                      </Button>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {text(item, 'status')} · atualização {formatDate(text(item, 'updated_at').slice(0, 10))}
                      </Typography>
                    </Box>
                  );
                })}
                {!ownEnrollments.length && <Typography color="text.secondary" variant="body2">Nenhuma matrícula encontrada.</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
            <CardContent sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" fontWeight={750} color="#0F172A">
                Linha do tempo de frequência
              </Typography>
              <Stack divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />} mt={1.25}>
                {ownRecords.slice(0, 30).map((record) => {
                  const replacement = ownReplacements.find((item) => item.attendance_record_id === record.id);
                  return (
                    <Box key={record.id} py={0.75}>
                      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                        <Typography fontWeight={650} color="#0F172A" fontSize={13.5}>
                          {formatDate(text(record, 'date'))} · {text(classes.items.find((item) => item.id === record.class_id), 'name')}
                        </Typography>
                        <Chip
                          size="small"
                          label={statusLabel[text(record, 'status')] ?? text(record, 'status')}
                          color={
                            text(record, 'status') === 'P'
                              ? 'success'
                              : text(record, 'status') === 'F'
                              ? 'error'
                              : text(record, 'status') === 'R' || text(record, 'status') === 'RC'
                              ? 'secondary'
                              : 'info'
                          }
                          sx={{ fontWeight: 650, height: 20, fontSize: 10.5 }}
                        />
                      </Stack>
                      {text(record, 'notes') && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {text(record, 'notes')}
                        </Typography>
                      )}
                      {replacement && (
                        <Typography variant="caption" color="primary.main" fontWeight={600} sx={{ display: 'block', mt: 0.25 }}>
                          Reposição: {formatDate(text(replacement, 'scheduled_date'))} às {text(replacement, 'scheduled_time')}{' '}
                          {replacement.completed_at ? '· concluída' : '· pendente'}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
                {!ownRecords.length && <Typography color="text.secondary" variant="body2">Nenhuma frequência nos últimos 90 dias.</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

