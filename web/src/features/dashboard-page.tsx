import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonGroup,
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
  P: '#2E7D32',
  F: '#D32F2F',
  J: '#00838F',
  A: '#ED6C02',
  R: '#7B1FA2',
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
    <Card
      sx={{
        height: '100%',
        border: '1px solid #E2E8F0',
        borderRadius: 3,
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: '#CBD5E1',
        },
      }}
    >
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            width: 42,
            height: 42,
            borderRadius: 2.5,
            color,
            bgcolor: `${color}10`,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {label}
          </Typography>
          <Typography variant="h5" component="p" fontWeight={800} sx={{ color: '#0F172A', my: 0.25, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

function DashboardCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card sx={{ height: '100%', border: '1px solid #E2E8F0', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
        <Typography variant="subtitle1" component="h2" fontWeight={750} color="#0F172A">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: 200, display: 'grid', placeItems: 'center', px: 2, textAlign: 'center' }}>
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
    <Stack gap={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
        <Box>
          <Typography variant="h5" component="h1" fontWeight={800} color="#0F172A" letterSpacing="-0.02em">
            Visão Geral
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Olá, {session.name.split(' ')[0]}. Acompanhe os indicadores pedagógicos e frequência consolidada.
          </Typography>
        </Box>
      </Stack>

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#F1F5F9', color: '#0F172A', display: 'grid', placeItems: 'center' }}>
                <CalendarMonthOutlinedIcon fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={700} color="#0F172A">
                  Período Analisado
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {range.from || '—'} a {range.to || '—'}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ display: 'inline-flex', p: '2px', bgcolor: '#F1F5F9', borderRadius: 2, gap: '2px' }}>
              {([7, 30, 90] as const).map((days) => (
                <Button
                  key={days}
                  size="small"
                  onClick={() => applyPreset(days)}
                  sx={{
                    px: 1.75,
                    py: 0.5,
                    fontWeight: preset === days ? 700 : 550,
                    fontSize: 12.5,
                    borderRadius: 1.5,
                    bgcolor: preset === days ? '#0F172A' : 'transparent',
                    color: preset === days ? '#FFFFFF' : '#64748B',
                    '&:hover': {
                      bgcolor: preset === days ? '#0F172A' : '#E2E8F0',
                      color: preset === days ? '#FFFFFF' : '#0F172A',
                    },
                  }}
                >
                  {days} dias
                </Button>
              ))}
              <Button
                size="small"
                onClick={() => setPreset('custom')}
                sx={{
                  px: 1.75,
                  py: 0.5,
                  fontWeight: preset === 'custom' ? 700 : 550,
                  fontSize: 12.5,
                  borderRadius: 1.5,
                  bgcolor: preset === 'custom' ? '#0F172A' : 'transparent',
                  color: preset === 'custom' ? '#FFFFFF' : '#64748B',
                  '&:hover': {
                    bgcolor: preset === 'custom' ? '#0F172A' : '#E2E8F0',
                    color: preset === 'custom' ? '#FFFFFF' : '#0F172A',
                  },
                }}
              >
                Personalizado
              </Button>
            </Box>
          </Stack>
          {preset === 'custom' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2, mt: 2, maxWidth: 640 }}>
              <DateField label="Data inicial" value={range.from} onChange={(value) => setRange((current) => ({ ...current, from: value }))} required allowFuture />
              <DateField label="Data final" value={range.to} onChange={(value) => setRange((current) => ({ ...current, to: value }))} required allowFuture />
            </Box>
          )}
          {!validRange && <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>Informe um período válido; a data inicial não pode ser posterior à data final.</Alert>}
        </CardContent>
        {loading && <LinearProgress aria-label="Carregando indicadores" sx={{ height: 2 }} />}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
        <KpiCard label="Taxa de Frequência" value={`${analytics.attendanceRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} detail={`${numberFormatter.format(analytics.records)} marcações no período`} color="#0284C7" icon={<InsightsOutlinedIcon fontSize="small" />} />
        <KpiCard label="Presenças" value={numberFormatter.format(analytics.present)} detail="Situação P" color={statusColors.P} icon={<CheckCircleOutlineIcon fontSize="small" />} />
        <KpiCard label="Faltas" value={numberFormatter.format(analytics.absent)} detail="Situação F" color={statusColors.F} icon={<EventBusyOutlinedIcon fontSize="small" />} />
        <KpiCard label="Atrasos" value={numberFormatter.format(analytics.delayed)} detail="Situação A" color={statusColors.A} icon={<AccessTimeOutlinedIcon fontSize="small" />} />
        <KpiCard label="Alunos em Risco" value={numberFormatter.format(analytics.riskStudents)} detail={`de ${numberFormatter.format(analytics.activeStudents)} alunos ativos`} color="#F59E0B" icon={<WarningAmberOutlinedIcon fontSize="small" />} />
        <KpiCard label="Chamadas Realizadas" value={numberFormatter.format(analytics.distinctCalls)} detail="Total por turma e data" color="#64748B" icon={<EventAvailableOutlinedIcon fontSize="small" />} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.65fr) minmax(300px, 1fr)' }, gap: 1.5 }}>
        <DashboardCard title="Evolução da Frequência" subtitle="Percentual diário de presenças ao longo do período">
          {analytics.evolution.length ? (
            <Box role="img" aria-label="Gráfico da evolução diária da frequência" sx={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.evolution} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value) => shortDate(String(value))} minTickGap={28} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                  <YAxis domain={[0, 100]} unit="%" width={44} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                  <Tooltip
                    labelFormatter={(value) => formatDate(String(value))}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  />
                  <Line type="monotone" dataKey="rate" name="Frequência (%)" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 2.5, fill: '#2563EB' }} activeDot={{ r: 5, fill: '#2563EB' }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : <EmptyChart>Não há frequência registrada neste período.</EmptyChart>}
        </DashboardCard>

        <DashboardCard title="Distribuição das Situações" subtitle="Presença, falta, justificativa, atraso e reposição">
          {analytics.records ? (
            <Box role="img" aria-label="Gráfico de distribuição das situações de frequência" sx={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
                    {distribution.map((item) => <Cell key={item.key} fill={statusColors[item.key as keyof typeof statusColors]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : <EmptyChart>Não há marcações para distribuir neste período.</EmptyChart>}
        </DashboardCard>
      </Box>

      <DashboardCard title="Comparativo por Turma" subtitle="Frequência consolidada no período selecionado">
        {analytics.byClass.length ? (
          <Box role="img" aria-label="Gráfico comparativo da frequência por turma" sx={{ width: '100%', height: Math.min(480, Math.max(240, analytics.byClass.length * 40)) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.byClass} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }} stroke="#E2E8F0" tickFormatter={(value) => String(value).length > 18 ? `${String(value).slice(0, 17)}…` : String(value)} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="rate" name="Frequência (%)" fill="#0284C7" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : <EmptyChart>Nenhuma turma está disponível para comparação.</EmptyChart>}
      </DashboardCard>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        <DashboardCard title="Alunos com Mais Faltas" subtitle="Até dez alunos, ordenados pelo maior número de faltas">
          {analytics.topAbsentees.length ? (
            <Stack component="ol" divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {analytics.topAbsentees.map((student, index) => (
                <Stack component="li" key={student.studentId} direction="row" gap={1.5} alignItems="center" sx={{ py: 1 }}>
                  <Avatar sx={{ width: 26, height: 26, fontSize: 11, fontWeight: 700, bgcolor: index < 3 ? '#FFF1F2' : '#F1F5F9', color: index < 3 ? '#E11D48' : '#64748B' }}>
                    {index + 1}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={700} color="#0F172A" fontSize={13.5} noWrap>{student.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{student.registrationNumber ? `Matrícula ${student.registrationNumber}` : 'Matrícula não informada'}</Typography>
                  </Box>
                  <Stack alignItems="flex-end" sx={{ flex: '0 0 auto' }}>
                    <Chip size="small" color="error" variant="outlined" label={`${student.absences} falta${student.absences === 1 ? '' : 's'}`} sx={{ fontWeight: 650, height: 22, fontSize: 11 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>{student.rate.toLocaleString('pt-BR')}% presença</Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          ) : <EmptyChart>Nenhum aluno com falta no período selecionado.</EmptyChart>}
        </DashboardCard>

        <DashboardCard title="Carga Docente" subtitle="Turmas com chamadas e alunos vinculados">
          {teacherDirectoryOffline && analytics.teacherWorkload.length > 0 && (
            <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2 }}>Os nomes dos professores não estão disponíveis offline; a carga local continua calculada.</Alert>
          )}
          {analytics.teacherWorkload.length ? (
            <Stack divider={<Divider flexItem sx={{ borderColor: '#F1F5F9' }} />}>
              {analytics.teacherWorkload.map((teacher) => (
                <Box key={teacher.teacherId} sx={{ py: 1 }}>
                  <Stack direction="row" justifyContent="space-between" gap={2} alignItems="baseline">
                    <Typography fontWeight={700} color="#0F172A" fontSize={13.5} noWrap>{teacherNames[teacher.teacherId] || `Professor ${teacher.teacherId.slice(0, 8)}`}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: '0 0 auto', fontWeight: 500 }}>
                      {teacher.classes} turma{teacher.classes === 1 ? '' : 's'} · {teacher.students} aluno{teacher.students === 1 ? '' : 's'}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={(teacher.classes / maxTeacherClasses) * 100}
                    sx={{
                      mt: 0.75,
                      height: 6,
                      borderRadius: 3,
                      bgcolor: '#F1F5F9',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: '#2563EB',
                        borderRadius: 3,
                      },
                    }}
                  />
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
