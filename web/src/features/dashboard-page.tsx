import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Clock,
  CheckCircle2,
  CalendarCheck,
  CalendarX,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Layers,
  Award,
} from 'lucide-react';
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
  P: '#10B981',
  F: '#F43F5E',
  J: '#0284C7',
  A: '#F59E0B',
  R: '#8B5CF6',
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

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  colorClass,
  loading = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        data-testid="kpi-skeleton"
        aria-busy="true"
        aria-label={`Carregando ${label}`}
        className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center gap-3.5 text-left animate-pulse"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-24 bg-slate-100 rounded-sm" />
          <div className="h-6 w-16 bg-slate-200 rounded-sm" />
          <div className="h-2.5 w-32 bg-slate-100 rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:border-slate-300 transition-colors flex items-center gap-3.5 text-left">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight my-0.5 leading-none">
          {value}
        </p>
        <p className="text-[11px] text-slate-400 font-medium truncate">{detail}</p>
      </div>
    </div>
  );
}

function ChartSkeleton({
  height = 280,
  label = 'Carregando gráfico',
}: {
  height?: number;
  label?: string;
}) {
  return (
    <div
      data-testid="chart-skeleton"
      aria-busy="true"
      aria-label={label}
      className="w-full flex flex-col justify-end gap-2 p-4 animate-pulse bg-slate-50/50 rounded-xl border border-dashed border-slate-200/70"
      style={{ minHeight: height }}
    >
      <div className="flex items-end justify-between gap-3 h-44 w-full px-4 pb-2">
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-20" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-36" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-28" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-40" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-24" />
      </div>
      <div className="h-3 w-1/3 bg-slate-200/60 rounded-sm mx-auto" />
    </div>
  );
}

function ListSkeleton({
  rows = 4,
  label = 'Carregando lista',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      data-testid="list-skeleton"
      aria-busy="true"
      aria-label={label}
      className="divide-y divide-slate-100 animate-pulse"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-slate-100 shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3.5 w-1/2 bg-slate-200 rounded-sm" />
              <div className="h-2.5 w-1/3 bg-slate-100 rounded-sm" />
            </div>
          </div>
          <div className="h-5 w-16 bg-slate-100 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

function DashboardCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">{subtitle}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function EmptyChart({
  icon: Icon = CalendarX,
  title,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="empty-chart"
      className="min-h-[220px] flex flex-col items-center justify-center p-6 text-center text-slate-500"
    >
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center mb-2.5 text-slate-400 shrink-0">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      {title && <p className="text-xs sm:text-sm font-semibold text-slate-700 mb-1">{title}</p>}
      <div className="text-xs text-slate-500 max-w-sm font-medium">{children}</div>
    </div>
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
    void api
      .get<{ items: LocalRecord[] }>('/users?role=professor')
      .then((result) => {
        if (!active) return;
        setTeacherNames(Object.fromEntries((result?.items ?? []).map((teacher) => [teacher.id, String(teacher.name ?? '')])));
        setTeacherDirectoryOffline(false);
      })
      .catch(() => {
        if (active) setTeacherDirectoryOffline(true);
      });
    return () => {
      active = false;
    };
  }, [api, session.id, session.name, session.role]);

  const from = safeCanonicalDate(range.from);
  const to = safeCanonicalDate(range.to);
  const validRange = Boolean(from && to && from <= to);

  useEffect(() => {
    if (!validRange || typeof api.getAnalytics !== 'function') return;
    void api.getAnalytics({ from: from!, to: to! }).catch(() => undefined);
  }, [api, from, to, validRange]);

  const analytics = useMemo(
    () =>
      buildAnalytics(
        {
          attendance: attendance.items ?? [],
          classes: classes.items ?? [],
          students: students.items ?? [],
          enrollments: enrollments.items ?? [],
          classTeachers: classTeachers.items ?? [],
        },
        validRange ? { from: from!, to: to! } : { from: '9999-12-31', to: '0000-01-01' },
      ),
    [attendance.items, classTeachers.items, classes.items, enrollments.items, from, students.items, to, validRange],
  );

  const loading =
    attendance.loading || classes.loading || students.loading || enrollments.loading || classTeachers.loading;

  const distribution = [
    { key: 'P', name: 'P · Presenças', value: analytics.present },
    { key: 'F', name: 'F · Faltas', value: analytics.absent },
    { key: 'J', name: 'J · Justificadas', value: analytics.justified },
    { key: 'A', name: 'A · Atrasos', value: analytics.delayed },
    { key: 'R', name: 'R · Reposições', value: analytics.replacements },
  ];

  const maxTeacherClasses = Math.max(1, ...(analytics.teacherWorkload ?? []).map((item) => item.classes));

  const applyPreset = (next: Exclude<PeriodPreset, 'custom'>) => {
    setPreset(next);
    setRange(rangeFor(next));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Period Selector Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Período Analisado</p>
              <p className="text-[11px] text-slate-400 font-medium">
                {range.from || '—'} a {range.to || '—'}
              </p>
            </div>
          </div>

          <div className="inline-flex flex-wrap p-0.5 bg-slate-100 rounded-lg gap-0.5 border border-slate-200 self-start md:self-auto">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => applyPreset(days)}
                className={`px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  preset === days
                    ? 'bg-slate-950 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {days} dias
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset('custom')}
              className={`px-3 py-1.5 min-h-[36px] rounded-md text-xs font-semibold transition-all cursor-pointer ${
                preset === 'custom'
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Personalizado
            </button>
          </div>
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 max-w-xl">
            <DateField
              label="Data inicial"
              value={range.from}
              onChange={(value) => setRange((cur) => ({ ...cur, from: value }))}
              required
              allowFuture
            />
            <DateField
              label="Data final"
              value={range.to}
              onChange={(value) => setRange((cur) => ({ ...cur, to: value }))}
              required
              allowFuture
            />
          </div>
        )}

        {!validRange && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Informe um período válido; a data inicial não pode ser posterior à data final.
          </div>
        )}

        {loading && (
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-3" aria-label="Carregando indicadores">
            <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <KpiCard
          label="Taxa de Frequência"
          value={`${analytics.attendanceRate.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`}
          detail={`${numberFormatter.format(analytics.records)} marcações no período`}
          icon={TrendingUp}
          colorClass="bg-sky-50 text-sky-600"
          loading={loading}
        />
        <KpiCard
          label="Presenças"
          value={numberFormatter.format(analytics.present)}
          detail={`Presenças (P): ${numberFormatter.format(analytics.present)}`}
          icon={CheckCircle2}
          colorClass="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
        <KpiCard
          label="Faltas"
          value={numberFormatter.format(analytics.absent)}
          detail={`Faltas (F): ${numberFormatter.format(analytics.absent)}`}
          icon={CalendarX}
          colorClass="bg-rose-50 text-rose-600"
          loading={loading}
        />
        <KpiCard
          label="Atrasos"
          value={numberFormatter.format(analytics.delayed)}
          detail={`Atrasos (A): ${numberFormatter.format(analytics.delayed)}`}
          icon={Clock}
          colorClass="bg-amber-50 text-amber-600"
          loading={loading}
        />
        <KpiCard
          label="Alunos em Risco"
          value={numberFormatter.format(analytics.riskStudents)}
          detail={`de ${numberFormatter.format(analytics.activeStudents)} alunos ativos`}
          icon={AlertTriangle}
          colorClass="bg-orange-50 text-orange-600"
          loading={loading}
        />
        <KpiCard
          label="Chamadas Realizadas"
          value={numberFormatter.format(analytics.distinctCalls)}
          detail="Total por turma e data"
          icon={CalendarCheck}
          colorClass="bg-slate-100 text-slate-700"
          loading={loading}
        />
      </div>

      {/* Complementary Status Breakdown (Justificativas and Reposições without duplicating KPI cards) */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Situações Complementares</span>
          <span className="text-[11px] text-slate-400 font-medium">
            ({loading ? '…' : `${numberFormatter.format(analytics.records)} marcações no total`})
          </span>
        </div>
        {loading ? (
          <div className="flex flex-wrap items-center gap-1.5 animate-pulse" aria-busy="true" aria-label="Carregando resumo de marcações">
            <div className="h-6 w-32 bg-slate-200/70 rounded-lg" />
            <div className="h-6 w-32 bg-slate-200/70 rounded-lg" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold"
              data-testid="badge-justified"
            >
              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              Justificativas (J): {numberFormatter.format(analytics.justified)}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs font-semibold"
              data-testid="badge-replacements"
            >
              <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              Reposições (R/RC): {numberFormatter.format(analytics.replacements)}
            </span>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        <div className="lg:col-span-2">
          <DashboardCard
            title="Evolução da Frequência"
            subtitle="Percentual diário de presenças ao longo do período"
          >
            {loading ? (
              <ChartSkeleton height={288} label="Carregando evolução da frequência" />
            ) : analytics.evolution.length ? (
              <div role="img" aria-label="Gráfico da evolução diária da frequência" className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.evolution} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val) => shortDate(String(val))}
                      minTickGap={28}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      stroke="#E2E8F0"
                    />
                    <YAxis domain={[0, 100]} unit="%" width={44} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                    <Tooltip
                      labelFormatter={(val) => formatDate(String(val))}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: 'none' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      name="Frequência (%)"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: '#2563EB' }}
                      activeDot={{ r: 5, fill: '#2563EB' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart icon={TrendingUp} title="Sem evolução no período">
                Não há frequência registrada neste período.
              </EmptyChart>
            )}
          </DashboardCard>
        </div>

        <div>
          <DashboardCard
            title="Distribuição das Situações"
            subtitle="Presença, falta, justificativa, atraso e reposição"
          >
            {loading ? (
              <ChartSkeleton height={288} label="Carregando distribuição das situações" />
            ) : analytics.records ? (
              <div role="img" aria-label="Gráfico de distribuição das situações de frequência" className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
                      {distribution.map((item) => (
                        <Cell key={item.key} fill={statusColors[item.key as keyof typeof statusColors]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart icon={Layers} title="Sem marcações para distribuir">
                Não há marcações para distribuir neste período.
              </EmptyChart>
            )}
          </DashboardCard>
        </div>
      </div>

      {/* Class Comparison Chart */}
      <DashboardCard title="Comparativo por Turma" subtitle="Frequência consolidada no período selecionado">
        {loading ? (
          <ChartSkeleton height={240} label="Carregando comparativo por turma" />
        ) : analytics.byClass.length ? (
          <div className="space-y-3">
            {analytics.byClass.some((item) => item.records === 0) && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Turmas sem chamadas no período:</span>
                {analytics.byClass
                  .filter((item) => item.records === 0)
                  .map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-medium"
                    >
                      {item.name}: <span className="text-slate-400">Sem chamadas no período</span>
                    </span>
                  ))}
              </div>
            )}
            <div
              role="img"
              aria-label="Gráfico comparativo da frequência por turma"
              style={{ height: Math.min(480, Math.max(240, analytics.byClass.length * 40)) }}
              className="w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byClass} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }}
                    stroke="#E2E8F0"
                    tickFormatter={(val) => (String(val).length > 18 ? `${String(val).slice(0, 17)}…` : String(val))}
                  />
                  <Tooltip
                    formatter={(value: any, _name: any, item: any) => {
                      if (item?.payload?.records === 0) {
                        return ['Sem chamadas no período', 'Status'];
                      }
                      return [`${value}% (${item?.payload?.present ?? 0} presenças em ${item?.payload?.records ?? 0} marcações)`, 'Frequência'];
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                  <Bar
                    dataKey="rate"
                    name="Frequência (%)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                    label={(props: any) => {
                      const { x, y, width, height, value, index } = props;
                      const entry = analytics.byClass[index];
                      if (!entry) return null;
                      if (entry.records === 0) {
                        return (
                          <text
                            x={x + 8}
                            y={y + height / 2}
                            fill="#94A3B8"
                            fontSize={11}
                            fontWeight={500}
                            dominantBaseline="central"
                          >
                            Sem chamadas no período
                          </text>
                        );
                      }
                      return (
                        <text
                          x={x + width + 8}
                          y={y + height / 2}
                          fill="#475569"
                          fontSize={11}
                          fontWeight={600}
                          dominantBaseline="central"
                        >
                          {value}%
                        </text>
                      );
                    }}
                  >
                    {analytics.byClass.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={entry.records === 0 ? '#E2E8F0' : '#0284C7'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <EmptyChart icon={CalendarX} title="Nenhuma turma disponível">
            Nenhuma turma está disponível para comparação.
          </EmptyChart>
        )}
      </DashboardCard>

      {/* Tables Row: Top Absentees & Teacher Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <DashboardCard title="Alunos com Mais Faltas" subtitle="Até dez alunos, ordenados pelo maior número de faltas">
          {loading ? (
            <ListSkeleton rows={4} label="Carregando alunos faltosos" />
          ) : analytics.topAbsentees.length ? (
            <ol className="divide-y divide-slate-100 list-none p-0 m-0">
              {analytics.topAbsentees.map((student, index) => (
                <li key={`${student.studentId}-${student.classId ?? index}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        index < 3 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 text-left">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{student.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{student.className}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-50 border border-rose-200 text-rose-700">
                      {student.absences} falta{student.absences === 1 ? '' : 's'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {student.rate.toLocaleString('pt-BR')}% presença
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyChart icon={CheckCircle2} title="Sem faltas registradas">
              Nenhum aluno com falta no período selecionado.
            </EmptyChart>
          )}
        </DashboardCard>

        <DashboardCard title="Carga Docente" subtitle="Turmas com chamadas e alunos vinculados">
          {teacherDirectoryOffline && analytics.teacherWorkload.length > 0 && (
            <div className="mb-3 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800">
              Os nomes dos professores não estão disponíveis offline; a carga local continua calculada.
            </div>
          )}
          {loading ? (
            <ListSkeleton rows={3} label="Carregando carga docente" />
          ) : analytics.teacherWorkload.length ? (
            <div className="divide-y divide-slate-100">
              {analytics.teacherWorkload.map((teacher) => (
                <div key={teacher.teacherId} className="py-2.5 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {teacherNames[teacher.teacherId] || `Professor ${teacher.teacherId.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-slate-500 font-medium shrink-0">
                      {teacher.classes} turma{teacher.classes === 1 ? '' : 's'} · {teacher.students} aluno{teacher.students === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all"
                      style={{ width: `${(teacher.classes / maxTeacherClasses) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart icon={Clock} title="Sem carga docente com chamadas">
              Nenhuma carga docente com chamadas no período.
            </EmptyChart>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}

export default DashboardPage;
