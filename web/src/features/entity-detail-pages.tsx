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
const statusLabel: Record<string, string> = { P: 'Presente', F: 'Falta', J: 'Justificada', A: 'Atraso', R: 'Reposição', RC: 'Reposição concluída' };
const statusColors = ['#2E9D65', '#D64550', '#6B7280', '#D97706', '#1769AA'];

function daysAgo(days: number) {
  const value = new Date(`${todayInSaoPaulo()}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Card><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" color="primary.dark" fontWeight={850}>{value}</Typography>{detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}</CardContent></Card>;
}

function Overview({ analytics, calls }: { analytics: AnalyticsResult; calls: number }) {
  const distribution = [
    { name: 'Presentes', value: analytics.present }, { name: 'Faltas', value: analytics.absent },
    { name: 'Justificadas', value: analytics.justified }, { name: 'Atrasos', value: analytics.delayed },
    { name: 'Reposições', value: analytics.replacements },
  ];
  return <>
    <Grid container spacing={2} columns={{ xs: 2, sm: 6, lg: 12 }}>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Frequência" value={`${analytics.attendanceRate}%`} /></Grid>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Alunos ativos" value={analytics.activeStudents} /></Grid>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Chamadas" value={calls} detail="Turma e data distintas" /></Grid>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Presenças" value={analytics.present} /></Grid>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Faltas" value={analytics.absent} /></Grid>
      <Grid size={{ xs: 1, sm: 2 }}><Metric label="Em risco" value={analytics.riskStudents} /></Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 7 }}><Card><CardContent><Typography fontWeight={800}>Evolução da frequência</Typography><Box sx={{ height: 280, mt: 2 }}><ResponsiveContainer><LineChart data={analytics.evolution}><CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" /><XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28} /><YAxis domain={[0, 100]} unit="%" /><Tooltip labelFormatter={(value) => formatDate(String(value))} /><Line type="monotone" dataKey="rate" name="Frequência" stroke="#1769AA" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></Box></CardContent></Card></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><Card><CardContent><Typography fontWeight={800}>Distribuição das marcações</Typography><Box sx={{ height: 280 }}><ResponsiveContainer><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>{distribution.map((item, index) => <Cell key={item.name} fill={statusColors[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></Box><Stack direction="row" flexWrap="wrap" gap={1}>{distribution.map((item, index) => <Chip key={item.name} size="small" label={`${item.name}: ${item.value}`} sx={{ borderColor: statusColors[index] }} variant="outlined" />)}</Stack></CardContent></Card></Grid>
    </Grid>
  </>;
}

function DetailHeader({ backTo, backLabel, title, subtitle, activeRecord = true }: { backTo: string; backLabel: string; title: string; subtitle?: string; activeRecord?: boolean }) {
  return <Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Button component={Link} to={backTo} startIcon={<ArrowBackOutlinedIcon />} sx={{ px: 0 }}>{backLabel}</Button><Typography variant="h5" fontWeight={850} color="primary.dark">{title}</Typography>{subtitle && <Typography color="text.secondary">{subtitle}</Typography>}</Box><Chip label={activeRecord ? 'Ativo' : 'Inativo'} color={activeRecord ? 'success' : 'default'} sx={{ alignSelf: 'flex-start' }} /></Stack></CardContent></Card>;
}

function LoadingState() { return <LinearProgress aria-label="Carregando detalhes" />; }
function Missing({ label }: { label: string }) { return <Alert severity="warning">{label} não encontrado ou indisponível para este perfil.</Alert>; }

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const courses = useEntity('courses'); const classes = useEntity('classes'); const enrollments = useEntity('enrollments');
  const students = useEntity('students'); const attendance = useEntity('attendance_records'); const classTeachers = useEntity('class_teachers');
  if ([courses, classes, enrollments, students, attendance, classTeachers].some((value) => value.loading)) return <LoadingState />;
  const course = courses.items.find((item) => item.id === courseId); if (!course) return <Missing label="Curso" />;
  const ownClasses = classes.items.filter((item) => item.course_id === courseId && active(item));
  const ownIds = new Set(ownClasses.map((item) => item.id));
  const ownRecords = attendance.items.filter((item) => ownIds.has(String(item.class_id)) && String(item.date) >= daysAgo(89));
  const analytics = buildAnalytics({ attendance: attendance.items, classes: classes.items, students: students.items, enrollments: enrollments.items, classTeachers: classTeachers.items }, { from: daysAgo(89), to: todayInSaoPaulo(), courseId });
  const calls = new Set(ownRecords.map((item) => `${item.class_id}:${item.date}`)).size;
  return <Stack gap={2}><DetailHeader backTo="/cursos" backLabel="Voltar para cursos" title={text(course, 'name')} subtitle={`Código: ${text(course, 'code') || 'não informado'} · últimos 90 dias`} activeRecord={active(course)} /><Overview analytics={analytics} calls={calls} /><Card><CardContent><Typography fontWeight={800} mb={1}>Turmas do curso</Typography><Stack divider={<Divider flexItem />}>{ownClasses.map((item) => { const summary = analytics.byClass.find((value) => value.id === item.id); return <Button key={item.id} component={Link} to={`/turmas/${item.id}`} sx={{ justifyContent: 'space-between', py: 1.5, color: 'text.primary' }}><span>{text(item, 'name')} · {text(item, 'shift')}</span><span>{summary?.rate ?? 0}%</span></Button>; })}{!ownClasses.length && <Typography color="text.secondary">Nenhuma turma ativa neste curso.</Typography>}</Stack></CardContent></Card></Stack>;
}

export function ClassDetailPage() {
  const { classId = '' } = useParams();
  const classes = useEntity('classes'); const courses = useEntity('courses'); const labs = useEntity('laboratories'); const enrollments = useEntity('enrollments');
  const students = useEntity('students'); const attendance = useEntity('attendance_records'); const classTeachers = useEntity('class_teachers'); const replacements = useEntity('replacements');
  if ([classes, courses, labs, enrollments, students, attendance, classTeachers, replacements].some((value) => value.loading)) return <LoadingState />;
  const classRecord = classes.items.find((item) => item.id === classId); if (!classRecord) return <Missing label="Turma" />;
  const course = courses.items.find((item) => item.id === classRecord.course_id); const lab = labs.items.find((item) => item.id === classRecord.laboratory_id);
  const ownEnrollments = enrollments.items.filter((item) => item.class_id === classId && item.status === 'ativa' && !item.deleted_at);
  const roster = ownEnrollments.map((item) => students.items.find((student) => student.id === item.student_id)).filter((item): item is LocalRecord => Boolean(item));
  const ownRecords = attendance.items.filter((item) => item.class_id === classId && String(item.date) >= daysAgo(89));
  const analytics = buildAnalytics({ attendance: attendance.items, classes: classes.items, students: students.items, enrollments: enrollments.items, classTeachers: classTeachers.items }, { from: daysAgo(89), to: todayInSaoPaulo(), classId });
  const calls = new Set(ownRecords.map((item) => String(item.date))).size;
  const openReplacements = replacements.items.filter((item) => item.class_id === classId && !item.completed_at).length;
  return <Stack gap={2}><DetailHeader backTo="/turmas" backLabel="Voltar para turmas" title={text(classRecord, 'name')} subtitle={`${text(course, 'name') || 'Curso não informado'} · ${text(classRecord, 'shift')} · ${text(classRecord, 'week_day') || 'dia não informado'} · ${text(lab, 'name') || 'sem laboratório'}`} activeRecord={active(classRecord)} /><Overview analytics={analytics} calls={calls} /><Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={800}>Alunos da turma</Typography><Typography variant="body2" color="text.secondary">{roster.length} matrículas ativas · {openReplacements} reposições em aberto</Typography></Box><Button component={Link} to={`/frequencia?turma=${classId}`} startIcon={<FactCheckOutlinedIcon />}>Abrir frequência</Button></Stack><Divider sx={{ my: 1 }} /><Stack divider={<Divider flexItem />}>{roster.sort((left, right) => text(left, 'name').localeCompare(text(right, 'name'))).map((student) => { const ranking = analytics.topAbsentees.find((item) => item.studentId === student.id); return <Button key={student.id} component={Link} to={`/alunos/${student.id}`} sx={{ justifyContent: 'space-between', py: 1.25, color: 'text.primary' }}><span>{text(student, 'name')} · {text(student, 'registration_number')}</span><span>{ranking ? `${ranking.rate}% · ${ranking.absences} faltas` : 'Sem faltas no período'}</span></Button>; })}{!roster.length && <Typography color="text.secondary">Nenhum aluno com matrícula ativa.</Typography>}</Stack></CardContent></Card></Stack>;
}

export function StudentDetailPage() {
  const { studentId = '' } = useParams();
  const students = useEntity('students'); const classes = useEntity('classes'); const courses = useEntity('courses'); const enrollments = useEntity('enrollments', true);
  const attendance = useEntity('attendance_records', true); const classTeachers = useEntity('class_teachers'); const replacements = useEntity('replacements', true);
  if ([students, classes, courses, enrollments, attendance, classTeachers, replacements].some((value) => value.loading)) return <LoadingState />;
  const student = students.items.find((item) => item.id === studentId); if (!student) return <Missing label="Aluno" />;
  const ownEnrollments = enrollments.items.filter((item) => item.student_id === studentId).sort((left, right) => text(right, 'updated_at').localeCompare(text(left, 'updated_at')));
  const currentEnrollment = ownEnrollments.find((item) => item.status === 'ativa' && !item.deleted_at); const currentClass = classes.items.find((item) => item.id === currentEnrollment?.class_id); const course = courses.items.find((item) => item.id === currentClass?.course_id);
  const ownRecords = attendance.items.filter((item) => item.student_id === studentId && !item.deleted_at && String(item.date) >= daysAgo(89)).sort((left, right) => text(right, 'date').localeCompare(text(left, 'date')));
  const analytics = buildAnalytics({ attendance: attendance.items, classes: classes.items, students: students.items, enrollments: enrollments.items, classTeachers: classTeachers.items }, { from: daysAgo(89), to: todayInSaoPaulo(), studentId });
  const calls = new Set(ownRecords.map((item) => `${item.class_id}:${item.date}`)).size;
  const ownReplacements = replacements.items.filter((item) => item.student_id === studentId && !item.deleted_at);
  return <Stack gap={2}><DetailHeader backTo="/alunos" backLabel="Voltar para alunos" title={text(student, 'name')} subtitle={`Matrícula: ${text(student, 'registration_number')} · ${text(course, 'name') || 'curso não informado'} / ${text(currentClass, 'name') || 'sem turma ativa'}`} activeRecord={active(student)} /><Overview analytics={analytics} calls={calls} /><Grid container spacing={2}><Grid size={{ xs: 12, lg: 5 }}><Card><CardContent><Typography fontWeight={800}>Histórico de matrículas</Typography><Stack divider={<Divider flexItem />} mt={1}>{ownEnrollments.map((item) => { const classRecord = classes.items.find((value) => value.id === item.class_id); return <Box key={item.id} py={1}><Button component={Link} to={`/turmas/${item.class_id}`} sx={{ px: 0 }}>{text(classRecord, 'name') || 'Turma removida'}</Button><Typography variant="body2" color="text.secondary">{text(item, 'status')} · atualização {formatDate(text(item, 'updated_at').slice(0, 10))}</Typography></Box>; })}{!ownEnrollments.length && <Typography color="text.secondary">Nenhuma matrícula encontrada.</Typography>}</Stack></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 7 }}><Card><CardContent><Typography fontWeight={800}>Linha do tempo de frequência</Typography><Stack divider={<Divider flexItem />} mt={1}>{ownRecords.slice(0, 30).map((record) => { const replacement = ownReplacements.find((item) => item.attendance_record_id === record.id); return <Box key={record.id} py={1}><Stack direction="row" justifyContent="space-between" gap={1}><Typography>{formatDate(text(record, 'date'))} · {text(classes.items.find((item) => item.id === record.class_id), 'name')}</Typography><Chip size="small" label={statusLabel[text(record, 'status')] ?? text(record, 'status')} /></Stack>{text(record, 'notes') && <Typography variant="body2" color="text.secondary">{text(record, 'notes')}</Typography>}{replacement && <Typography variant="body2" color="primary">Reposição: {formatDate(text(replacement, 'scheduled_date'))} às {text(replacement, 'scheduled_time')} {replacement.completed_at ? '· concluída' : '· pendente'}</Typography>}</Box>; })}{!ownRecords.length && <Typography color="text.secondary">Nenhuma frequência nos últimos 90 dias.</Typography>}</Stack></CardContent></Card></Grid></Grid></Stack>;
}
