import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../app-context';
import { DateField } from '../components';
import { buildAnalytics } from '../lib/analytics';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';

type PeriodPreset = 7 | 30 | 90 | 'custom';

const statusColors = {
  P: '#2E7D5B',
  F: '#C43E4D',
  J: '#18899A',
  A: '#C57412',
  R: '#7051A3',
};

const numberFormatter = new Intl.NumberFormat('pt-BR');

function shiftIsoDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function rangeFor(days: number, today = todayInSaoPaulo()) {
  return { from: formatDate(shiftIsoDate(today, -(days - 1))), to: formatDate(today) };
}

function safeCanonicalDate(value: string) {
  try {
    return parseBrazilDate(value, { allowFuture: true });
  } catch {
    return null;
  }
}

function shortDate(value: string) {
  return formatDate(value).slice(0, 5);
}

function KpiCard({ label, value, detail, color, icon }: { label: string; value: string; detail: string; color: string; icon: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%', borderColor: `${color}35` }}>
      <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Box sx={{ display: 'grid', placeItems: 'center', flex: '0 0 auto', width: 42, height: 42, borderRadius: 2, color, bgcolor: `${color}14` }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h5" component="p" fontWeight={800} sx={{ color, lineHeight: 1.25 }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary">{detail}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function DashboardCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
        <Typography variant="h6" component="h2" fontWeight={750}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
        <Box sx={{ mt: 2 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', px: 2, textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary">{children}</Typography>
    </Box>
  );
}

export function DashboardPage() {
  const { api, session } = useApp();
  const attendance = useEntity('attendance_records');
  const classes = useEntity('classes');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const classTeachers = useEntity('class_teachers');
  const [preset, setPreset] = useState<PeriodPreset>(30);
  const [range, setRange] = useState(() => rangeFor(30));
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>(() => ({ [session.id]: session.name }));
  const [teacherDirectoryOffline, setTeacherDirectoryOffline] = useState(false);

  useEffect(() => {
    if (session.role === 'professor') {
      setTeacherNames({ [session.id]: session.name });
      setTeacherDirectoryOffline(false);
      return;
    }
    let active = true;
    void api.get<{ items: LocalRecord[] }>('/users?role=professor').then((result) => {
      if (!active) return;
      setTeacherNames(Object.fromEntries(result.items.map((teacher) => [teacher.id, String(teacher.name ?? '')])));
      setTeacherDirectoryOffline(false);
    }).catch(() => {
      if (active) setTeacherDirectoryOffline(true);
    });
    return () => { active = false; };
  }, [api, session.id, session.name, session.role]);

  const from = safeCanonicalDate(range.from);
  const to = safeCanonicalDate(range.to);
  const validRange = Boolean(from && to && from <= to);
  const analytics = useMemo(() => buildAnalytics({
    attendance: attendance.items,
    classes: classes.items,
    students: students.items,
    enrollments: enrollments.items,
    classTeachers: classTeachers.items,
  }, validRange ? { from: from!, to: to! } : { from: '9999-12-31', to: '0000-01-01' }), [attendance.items, classTeachers.items, classes.items, enrollments.items, from, students.items, to, validRange]);

  const loading = attendance.loading || classes.loading || students.loading || enrollments.loading || classTeachers.loading;
  const distribution = [
    { key: 'P', name: 'P · Presenças', value: analytics.present },
    { key: 'F', name: 'F · Faltas', value: analytics.absent },
    { key: 'J', name: 'J · Justificadas', value: analytics.justified },
    { key: 'A', name: 'A · Atrasos', value: analytics.delayed },
    { key: 'R', name: 'R · Reposições', value: analytics.replacements },
  ];
  const maxTeacherClasses = Math.max(1, ...analytics.teacherWorkload.map((item) => item.classes));

  const applyPreset = (next: Exclude<PeriodPreset, 'custom'>) => {
    setPreset(next);
    setRange(rangeFor(next));
  };

  return (
    <Stack gap={2.5}>
      <Typography variant="body1" color="text.secondary">
        Olá, {session.name.split(' ')[0]}. Acompanhe a frequência consolidada com os dados disponíveis neste dispositivo.
      </Typography>

      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="subtitle1" fontWeight={750}>Período analisado</Typography>
              <Typography variant="body2" color="text.secondary">{range.from || '—'} a {range.to || '—'}</Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {([7, 30, 90] as const).map((days) => (
                <Button key={days} size="small" variant={preset === days ? 'contained' : 'outlined'} onClick={() => applyPreset(days)}>
                  {days} dias
                </Button>
              ))}
              <Button size="small" variant={preset === 'custom' ? 'contained' : 'outlined'} onClick={() => setPreset('custom')}>
                Personalizado
              </Button>
            </Stack>
          </Stack>
          {preset === 'custom' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mt: 2, maxWidth: 680 }}>
              <DateField label="Data inicial" value={range.from} onChange={(value) => setRange((current) => ({ ...current, from: value }))} required allowFuture />
              <DateField label="Data final" value={range.to} onChange={(value) => setRange((current) => ({ ...current, to: value }))} required allowFuture />
            </Box>
          )}
          {!validRange && <Alert severity="warning" sx={{ mt: 2 }}>Informe um período válido; a data inicial não pode ser posterior à data final.</Alert>}
        </CardContent>
        {loading && <LinearProgress aria-label="Carregando indicadores" />}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <KpiCard label="Frequência" value={`${analytics.attendanceRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} detail={`${numberFormatter.format(analytics.records)} marcações no período`} color="#1769AA" icon={<InsightsOutlinedIcon />} />
        <KpiCard label="Presenças" value={numberFormatter.format(analytics.present)} detail="Situação P" color={statusColors.P} icon={<CheckCircleOutlineIcon />} />
        <KpiCard label="Faltas" value={numberFormatter.format(analytics.absent)} detail="Situação F" color={statusColors.F} icon={<EventBusyOutlinedIcon />} />
        <KpiCard label="Atrasos" value={numberFormatter.format(analytics.delayed)} detail="Situação A" color={statusColors.A} icon={<AccessTimeOutlinedIcon />} />
        <KpiCard label="Alunos em risco" value={numberFormatter.format(analytics.riskStudents)} detail={`de ${numberFormatter.format(analytics.activeStudents)} alunos ativos`} color="#A35214" icon={<WarningAmberOutlinedIcon />} />
        <KpiCard label="Chamadas distintas" value={numberFormatter.format(analytics.distinctCalls)} detail="Uma por turma e data" color="#4E5B71" icon={<EventAvailableOutlinedIcon />} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.65fr) minmax(320px, 1fr)' }, gap: 2 }}>
        <DashboardCard title="Evolução da frequência" subtitle="Percentual diário de presenças">
          {analytics.evolution.length ? (
            <Box role="img" aria-label="Gráfico da evolução diária da frequência" sx={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.evolution} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DDE3EA" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value) => shortDate(String(value))} minTickGap={28} tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} unit="%" width={48} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(value) => formatDate(String(value))} />
                  <Line type="monotone" dataKey="rate" name="Frequência (%)" stroke="#1769AA" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : <EmptyChart>Não há frequência registrada neste período.</EmptyChart>}
        </DashboardCard>

        <DashboardCard title="Distribuição das marcações" subtitle="Presença, falta, justificativa, atraso e reposição">
          {analytics.records ? (
            <Box role="img" aria-label="Gráfico de distribuição das situações de frequência" sx={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                    {distribution.map((item) => <Cell key={item.key} fill={statusColors[item.key as keyof typeof statusColors]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : <EmptyChart>Não há marcações para distribuir neste período.</EmptyChart>}
        </DashboardCard>
      </Box>

      <DashboardCard title="Comparativo por turma" subtitle="Frequência consolidada no período selecionado">
        {analytics.byClass.length ? (
          <Box role="img" aria-label="Gráfico comparativo da frequência por turma" sx={{ width: '100%', height: Math.min(520, Math.max(270, analytics.byClass.length * 42)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byClass} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DDE3EA" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12 }} tickFormatter={(value) => String(value).length > 18 ? `${String(value).slice(0, 17)}…` : String(value)} />
                <Tooltip />
                <Bar dataKey="rate" name="Frequência (%)" fill="#18899A" radius={[0, 5, 5, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : <EmptyChart>Nenhuma turma está disponível para comparação.</EmptyChart>}
      </DashboardCard>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <DashboardCard title="Alunos com mais faltas" subtitle="Até dez alunos, ordenados pelo maior número de faltas">
          {analytics.topAbsentees.length ? (
            <Stack component="ol" divider={<Divider flexItem />} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {analytics.topAbsentees.map((student, index) => (
                <Stack component="li" key={student.studentId} direction="row" gap={1.5} alignItems="center" sx={{ py: 1.25 }}>
                  <Typography color="text.secondary" fontWeight={700} sx={{ width: 24, flex: '0 0 auto' }}>{index + 1}</Typography>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={650} noWrap>{student.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{student.registrationNumber ? `Matrícula ${student.registrationNumber}` : 'Matrícula não informada'}</Typography>
                  </Box>
                  <Stack alignItems="flex-end" sx={{ flex: '0 0 auto' }}>
                    <Chip size="small" color="error" variant="outlined" label={`${student.absences} falta${student.absences === 1 ? '' : 's'}`} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{student.rate.toLocaleString('pt-BR')}% presença</Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          ) : <EmptyChart>Nenhum aluno com falta no período selecionado.</EmptyChart>}
        </DashboardCard>

        <DashboardCard title="Carga docente" subtitle="Turmas com chamadas e alunos vinculados">
          {teacherDirectoryOffline && analytics.teacherWorkload.length > 0 && (
            <Alert severity="info" sx={{ mb: 1.5 }}>Os nomes dos professores não estão disponíveis offline; a carga local continua calculada.</Alert>
          )}
          {analytics.teacherWorkload.length ? (
            <Stack divider={<Divider flexItem />}>
              {analytics.teacherWorkload.map((teacher) => (
                <Box key={teacher.teacherId} sx={{ py: 1.25 }}>
                  <Stack direction="row" justifyContent="space-between" gap={2} alignItems="baseline">
                    <Typography fontWeight={650} noWrap>{teacherNames[teacher.teacherId] || `Professor ${teacher.teacherId.slice(0, 8)}`}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: '0 0 auto' }}>
                      {teacher.classes} turma{teacher.classes === 1 ? '' : 's'} · {teacher.students} aluno{teacher.students === 1 ? '' : 's'}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={(teacher.classes / maxTeacherClasses) * 100} sx={{ mt: 1, height: 7, borderRadius: 4 }} />
                </Box>
              ))}
            </Stack>
          ) : <EmptyChart>Nenhuma carga docente com chamadas no período.</EmptyChart>}
        </DashboardCard>
      </Box>
    </Stack>
  );
}

export default DashboardPage;
