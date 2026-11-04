import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  FileText,
  TrendingUp,
  BarChart3,
  Users,
  BookOpen,
  Search,
  Filter,
  ArrowUpRight,
  Sun,
  Sunset,
  Moon,
  Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEntity } from '../../lib/use-entity';
import { formatDate, todayInSaoPaulo } from '../../lib/date';
import type { LocalRecord } from '../../types';
import { BiFilterBar } from './bi-filter-bar';
import { ExportActions, initialFilters } from './bi-page';
import type { BiFilters } from './model';
import { useBiData } from './use-bi-data';
import {
  ChartContainer,
  LineTrendChart,
  HorizontalBarChart,
  formatPercent,
  formatInteger,
  CHART_TOKENS,
} from '../../lib/charts';

const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const SHIFT_NAMES: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  integral: 'Integral',
};

export function BiAttendancePage() {
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<BiFilters>(defaults);
  const { data, directory, options, loading } = useBiData(filters, today);
  const rawAttendance = useEntity('attendance_records', true);
  const rawClasses = useEntity('classes', true);

  const [activeTab, setActiveTab] = useState<'classes' | 'risk' | 'patterns' | 'calls'>('classes');
  const [chartMode, setChartMode] = useState<'evolution' | 'volume' | 'shifts' | 'weekdays'>('evolution');
  const [searchTurma, setSearchTurma] = useState('');
  const [searchAluno, setSearchAluno] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'consecutive'>('all');

  const analytics = data.analytics;
  const totals = {
    present: analytics?.present ?? 0,
    absent: analytics?.absent ?? 0,
    justified: analytics?.justified ?? 0,
    delayed: analytics?.delayed ?? 0,
    replacements: analytics?.replacements ?? 0,
    records: analytics?.records ?? 0,
    rate: analytics?.attendanceRate ?? 0,
    calls: data.calls ?? 0,
    activeStudents: analytics?.activeStudents ?? 0,
    riskStudents: analytics?.riskStudents ?? 0,
  };

  const absenteeRate = totals.records > 0 ? ((totals.absent / totals.records) * 100).toFixed(1) : '0.0';

  // Metrics Ribbon
  const metricsRibbon = [
    { label: 'Frequência Geral', value: `${totals.rate.toFixed(1).replace('.', ',')}%` },
    { label: 'Presenças', value: totals.present.toLocaleString('pt-BR') },
    { label: 'Faltas', value: totals.absent.toLocaleString('pt-BR') },
    { label: 'Justificadas', value: totals.justified.toLocaleString('pt-BR') },
    { label: 'Atrasos', value: totals.delayed.toLocaleString('pt-BR') },
    { label: 'Reposições', value: totals.replacements.toLocaleString('pt-BR') },
    { label: 'Chamadas', value: totals.calls.toLocaleString('pt-BR') },
    { label: 'Alunos em Risco', value: totals.riskStudents.toLocaleString('pt-BR') },
  ];

  // Map of classes for quick metadata
  const classMap = useMemo(() => {
    return new Map((rawClasses.items ?? []).map((c) => [c.id, c]));
  }, [rawClasses.items]);

  // Filtered raw attendance records in scope
  const scopedAttendance = useMemo(() => {
    const classIds = new Set((data.classRows ?? []).map((r) => r.id));
    return (rawAttendance.items ?? []).filter((item) => {
      if (item.deleted_at) return false;
      const d = String(item.date || '');
      if (d < filters.from || d > filters.to) return false;
      if (filters.classId && item.class_id !== filters.classId) return false;
      if (filters.studentId && item.student_id !== filters.studentId) return false;
      if (classIds.size > 0 && !classIds.has(String(item.class_id))) return false;
      return true;
    });
  }, [rawAttendance.items, filters, data.classRows]);

  // 1. Day of the Week Analysis
  const weekdayAnalysis = useMemo(() => {
    const days = [1, 2, 3, 4, 5, 6].map((dayIdx) => ({
      dayIdx,
      name: DAY_NAMES[dayIdx] || '',
      shortName: (DAY_NAMES[dayIdx] || '').slice(0, 3),
      present: 0,
      absent: 0,
      justified: 0,
      delayed: 0,
      records: 0,
      calls: new Set<string>(),
      rate: 0,
    }));

    for (const record of scopedAttendance) {
      const dStr = String(record.date || '');
      const [y, m, d] = dStr.split('-').map(Number);
      if (!y || !m || !d) continue;
      const dt = new Date(y, m - 1, d);
      const dayIdx = dt.getDay();
      const target = days.find((item) => item.dayIdx === dayIdx);
      if (!target) continue;

      target.records += 1;
      const status = String(record.status || '');
      if (status === 'P' || status === 'RC') target.present += 1;
      else if (status === 'F') target.absent += 1;
      else if (status === 'J') target.justified += 1;
      else if (status === 'A') target.delayed += 1;

      target.calls.add(`${record.class_id}:${dStr}`);
    }

    return days.map((d) => ({
      ...d,
      totalCalls: d.calls.size,
      rate: d.records > 0 ? Math.round((d.present / d.records) * 1000) / 10 : 0,
    }));
  }, [scopedAttendance]);

  // 2. Shift Analysis
  const shiftAnalysis = useMemo(() => {
    const shifts: Record<string, { shift: string; label: string; present: number; absent: number; records: number; rate: number }> = {
      manha: { shift: 'manha', label: 'Manhã', present: 0, absent: 0, records: 0, rate: 0 },
      tarde: { shift: 'tarde', label: 'Tarde', present: 0, absent: 0, records: 0, rate: 0 },
      noite: { shift: 'noite', label: 'Noite', present: 0, absent: 0, records: 0, rate: 0 },
      integral: { shift: 'integral', label: 'Integral', present: 0, absent: 0, records: 0, rate: 0 },
    };

    for (const record of scopedAttendance) {
      const cls = classMap.get(String(record.class_id));
      const shiftKey = String(cls?.shift || 'manha').toLowerCase();
      const target = shifts[shiftKey] || shifts.manha;
      if (!target) continue;
      target.records += 1;
      const status = String(record.status || '');
      if (status === 'P' || status === 'RC') target.present += 1;
      else if (status === 'F') target.absent += 1;
    }

    return Object.values(shifts)
      .filter((s) => s.records > 0)
      .map((s) => ({
        ...s,
        rate: s.records > 0 ? Math.round((s.present / s.records) * 1000) / 10 : 0,
      }));
  }, [scopedAttendance, classMap]);

  // 3. Consolidated Calls History (Sessions)
  const callsHistory = useMemo(() => {
    const callMap = new Map<string, {
      classId: string;
      className: string;
      courseName: string;
      shift: string;
      date: string;
      total: number;
      present: number;
      absent: number;
      justified: number;
      delayed: number;
      replacements: number;
    }>();

    for (const record of scopedAttendance) {
      const classId = String(record.class_id || '');
      const date = String(record.date || '');
      const key = `${classId}:${date}`;
      const cls = classMap.get(classId);

      const existing = callMap.get(key) ?? {
        classId,
        className: String(cls?.name || 'Turma não informada'),
        courseName: String((data.classRows ?? []).find((c) => c.id === classId)?.courseName || '—'),
        shift: String(cls?.shift || '—'),
        date,
        total: 0,
        present: 0,
        absent: 0,
        justified: 0,
        delayed: 0,
        replacements: 0,
      };

      existing.total += 1;
      const status = String(record.status || '');
      if (status === 'P' || status === 'RC') existing.present += 1;
      else if (status === 'F') existing.absent += 1;
      else if (status === 'J') existing.justified += 1;
      else if (status === 'A') existing.delayed += 1;
      else if (status === 'R') existing.replacements += 1;

      callMap.set(key, existing);
    }

    return Array.from(callMap.values())
      .map((c) => ({
        ...c,
        rate: c.total > 0 ? Math.round((c.present / c.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [scopedAttendance, classMap, data.classRows]);

  // Volume Chart Data (by Date)
  const volumeChartData = useMemo(() => {
    const dayMap = new Map<string, { date: string; displayDate: string; present: number; absent: number; justified: number }>();
    for (const record of scopedAttendance) {
      const date = String(record.date || '');
      const existing = dayMap.get(date) ?? {
        date,
        displayDate: formatDate(date),
        present: 0,
        absent: 0,
        justified: 0,
      };
      const status = String(record.status || '');
      if (status === 'P' || status === 'RC') existing.present += 1;
      else if (status === 'F') existing.absent += 1;
      else if (status === 'J') existing.justified += 1;
      dayMap.set(date, existing);
    }
    return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [scopedAttendance]);

  // Filtered Class Rows
  const filteredClassRows = useMemo(() => {
    const list = data.classRows ?? [];
    if (!searchTurma.trim()) return list;
    const q = searchTurma.toLowerCase();
    return list.filter((r) => r.name.toLowerCase().includes(q) || r.courseName.toLowerCase().includes(q));
  }, [data.classRows, searchTurma]);

  // Filtered Risk Students
  const filteredRiskRows = useMemo(() => {
    let list = data.riskRows ?? [];
    if (riskFilter === 'critical') list = list.filter((r) => r.rate < 75);
    else if (riskFilter === 'consecutive') list = list.filter((r) => r.consecutiveAbsences >= 3);

    if (searchAluno.trim()) {
      const q = searchAluno.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.registrationNumber.toLowerCase().includes(q) || r.className.toLowerCase().includes(q));
    }
    return list;
  }, [data.riskRows, riskFilter, searchAluno]);

  // Export context
  const exportContext = useMemo(
    () => [`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)}`],
    [filters.from, filters.to],
  );

  const exportHeaders = ['Turma', 'Curso', 'Turno', 'Chamadas', 'Presenças', 'Faltas', 'Justificadas', 'Atrasos', 'Reposições', 'Taxa %'];
  const exportRows = (data.classRows ?? []).map((item) => [
    item.name,
    item.courseName,
    SHIFT_NAMES[item.shift] || item.shift,
    item.calls,
    item.present,
    item.absent,
    item.justified,
    item.delayed,
    item.replacements,
    `${item.rate.toFixed(1).replace('.', ',')}%`,
  ]);

  return (
    <div className="flex flex-col gap-4 text-left">
      {/* 1. Filter Toolbar */}
      <BiFilterBar
        filters={filters}
        onChange={setFilters}
        {...options}
        teachers={directory}
        onReset={() => setFilters(defaults)}
      />

      {/* 2. Executive KPI Summary Ribbon */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-end border-b border-slate-100 pb-2">
          <ExportActions
            title="BI de Frequencia - opschool"
            context={exportContext}
            headers={exportHeaders}
            rows={exportRows}
            payload={{ totals, classes: data.classRows, risk: data.riskRows, weekdays: weekdayAnalysis, shifts: shiftAnalysis }}
            metrics={metricsRibbon}
          />
        </div>

        {/* Big Indicators Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* Frequência Geral */}
          <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-col justify-between col-span-2 sm:col-span-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Frequência Geral</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-bold">Meta: 75%</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black tracking-tight">
                {totals.records > 0 ? `${totals.rate.toFixed(1).replace('.', ',')}%` : '—'}
              </span>
              <span className={`text-[11px] font-bold ${totals.rate >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totals.records === 0 ? '' : totals.rate >= 75 ? 'Regular' : 'Abaixo da Meta'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {totals.records.toLocaleString('pt-BR')} marcações consolidadas
            </div>
          </div>

          {/* Presenças */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-emerald-900 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Presenças</div>
            <div className="text-xl font-black text-emerald-800 mt-1">{totals.present.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-emerald-600 font-medium">Comparecimentos</div>
          </div>

          {/* Faltas */}
          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/80 text-rose-900 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Faltas</div>
            <div className="text-xl font-black text-rose-800 mt-1">{totals.absent.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-rose-600 font-medium">{absenteeRate}% ausência</div>
          </div>

          {/* Justificadas */}
          <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80 text-sky-900 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Justificadas</div>
            <div className="text-xl font-black text-sky-800 mt-1">{totals.justified.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-sky-600 font-medium">Atestados/motivo</div>
          </div>

          {/* Atrasos */}
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Atrasos</div>
            <div className="text-xl font-black text-amber-800 mt-1">{totals.delayed.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-amber-600 font-medium">Entrada tardia</div>
          </div>

          {/* Chamadas */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Chamadas</div>
            <div className="text-xl font-black text-slate-900 mt-1">{totals.calls.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-slate-400 font-medium">Aulas com registro</div>
          </div>

          {/* Alunos em Risco */}
          <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/80 text-purple-900 flex flex-col justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Em Risco</div>
            <div className="text-xl font-black text-purple-800 mt-1">{totals.riskStudents.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-purple-600 font-medium">&lt; 75% ou 3+ faltas</div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
        </div>
      )}

      {/* 3. Advanced Charts Section with View Toggle */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-600" />
              <span>Análise Gráfica Avançada</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {chartMode === 'evolution' && 'Evolução da taxa de presença diária ao longo do período selecionado'}
              {chartMode === 'volume' && 'Volume diário comparativo de presenças, faltas e justificativas'}
              {chartMode === 'shifts' && 'Aproveitamento e taxa de presença média agrupada por turno'}
              {chartMode === 'weekdays' && 'Padrão de frequência por dia da semana para identificar dias com alta evasão'}
            </p>
          </div>

          {/* Chart View Switcher */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setChartMode('evolution')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                chartMode === 'evolution' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Evolução %
            </button>
            <button
              type="button"
              onClick={() => setChartMode('volume')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                chartMode === 'volume' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Volume Marcações
            </button>
            <button
              type="button"
              onClick={() => setChartMode('shifts')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                chartMode === 'shifts' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Turno
            </button>
            <button
              type="button"
              onClick={() => setChartMode('weekdays')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                chartMode === 'weekdays' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Dia da Semana
            </button>
          </div>
        </div>

        {/* Dynamic Chart Container */}
        <div>
          {chartMode === 'evolution' ? (
            <ChartContainer
              ariaLabel="Gráfico de linha da taxa diária de presença"
              summary={`Taxa média no período de ${formatPercent(totals.rate)}.`}
              empty={!(analytics?.evolution ?? []).length}
              height={288}
              tableData={analytics?.evolution ?? []}
              tableColumns={[
                { header: 'Data', key: 'date', format: (d) => formatDate(String(d)) },
                { header: 'Frequência', key: 'rate', align: 'right', format: (r) => formatPercent(Number(r)) },
              ]}
            >
              <LineTrendChart
                data={analytics?.evolution ?? []}
                series={[{ key: 'rate', name: 'Taxa de Presença (%)', color: '#2563EB' }]}
                targetValue={75}
                targetLabel="Meta: 75%"
                height={288}
              />
            </ChartContainer>
          ) : chartMode === 'volume' ? (
            <ChartContainer
              ariaLabel="Gráfico comparativo de volume de marcações por data"
              empty={!volumeChartData.length}
              height={288}
              tableData={volumeChartData}
              tableColumns={[
                { header: 'Data', key: 'displayDate' },
                { header: 'Presenças', key: 'present', align: 'right', format: (v) => formatInteger(Number(v)) },
                { header: 'Faltas', key: 'absent', align: 'right', format: (v) => formatInteger(Number(v)) },
                { header: 'Justificadas', key: 'justified', align: 'right', format: (v) => formatInteger(Number(v)) },
              ]}
            >
              <HorizontalBarChart
                data={volumeChartData}
                categoryKey="displayDate"
                valueKey="present"
                valueSuffix=" presenças"
                barColor="#10B981"
                height={288}
              />
            </ChartContainer>
          ) : chartMode === 'shifts' ? (
            <ChartContainer
              ariaLabel="Gráfico de assiduidade por turno escolar"
              empty={!shiftAnalysis.length}
              height={288}
              tableData={shiftAnalysis}
              tableColumns={[
                { header: 'Turno', key: 'label' },
                { header: 'Marcações', key: 'records', align: 'center', format: (r) => formatInteger(Number(r)) },
                { header: 'Frequência', key: 'rate', align: 'right', format: (r) => formatPercent(Number(r)) },
              ]}
            >
              <HorizontalBarChart
                data={shiftAnalysis}
                categoryKey="label"
                valueKey="rate"
                valueSuffix="%"
                barColor="#6366F1"
                height={288}
              />
            </ChartContainer>
          ) : (
            <ChartContainer
              ariaLabel="Gráfico de assiduidade por dia da semana"
              empty={!weekdayAnalysis.length}
              height={288}
              tableData={weekdayAnalysis}
              tableColumns={[
                { header: 'Dia da Semana', key: 'name' },
                { header: 'Chamadas', key: 'totalCalls', align: 'center', format: (c) => formatInteger(Number(c)) },
                { header: 'Frequência', key: 'rate', align: 'right', format: (r) => formatPercent(Number(r)) },
              ]}
            >
              <HorizontalBarChart
                data={weekdayAnalysis}
                categoryKey="name"
                valueKey="rate"
                valueSuffix="%"
                barColor="#0EA5E9"
                height={288}
              />
            </ChartContainer>
          )}
        </div>
      </div>

      {/* 4. Deep Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Desempenho por Turma ({data.classRows?.length ?? 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('risk')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'risk'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Radar de Alunos & Evasão ({data.riskRows?.length ?? 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('patterns')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'patterns'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Padrões por Dia & Turno</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calls')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'calls'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Histórico de Chamadas ({callsHistory.length})</span>
        </button>
      </div>

      {/* 5. TAB CONTENT */}

      {/* TAB 1: DESEMPENHO POR TURMA */}
      {activeTab === 'classes' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden space-y-3 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Comparativo de Turmas no Período</h2>
              <p className="text-xs text-slate-500 font-medium">Assiduidade, chamadas realizadas e detalhamento por situação</p>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTurma}
                onChange={(e) => setSearchTurma(e.target.value)}
                placeholder="Pesquisar turma ou curso..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-950 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/90">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3.5">Turma</th>
                  <th className="py-2.5 px-3">Curso</th>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3 text-center">Alunos</th>
                  <th className="py-2.5 px-3 text-center">Aulas</th>
                  <th className="py-2.5 px-2.5 text-center text-emerald-700">P</th>
                  <th className="py-2.5 px-2.5 text-center text-rose-700">F</th>
                  <th className="py-2.5 px-2.5 text-center text-sky-700">J</th>
                  <th className="py-2.5 px-2.5 text-center text-amber-700">A</th>
                  <th className="py-2.5 px-2.5 text-center text-purple-700">R</th>
                  <th className="py-2.5 px-3 text-right">Frequência</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredClassRows.map((item) => {
                  const isHealthy = item.rate >= 75;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">
                        <Link to={`/turmas/${item.id}`} className="hover:text-blue-600 hover:underline">
                          {item.name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{item.courseName}</td>
                      <td className="py-2.5 px-3 text-slate-600">{SHIFT_NAMES[item.shift] || item.shift}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{item.activeStudents}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{item.calls}</td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-emerald-700 bg-emerald-50/40">{item.present}</td>
                      <td className="py-2.5 px-2.5 text-center font-bold text-rose-700 bg-rose-50/40">{item.absent}</td>
                      <td className="py-2.5 px-2.5 text-center font-medium text-sky-700">{item.justified}</td>
                      <td className="py-2.5 px-2.5 text-center font-medium text-amber-700">{item.delayed}</td>
                      <td className="py-2.5 px-2.5 text-center font-medium text-purple-700">{item.replacements}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(item.rate, 100)}%` }}
                            />
                          </div>
                          <span className={`font-black text-xs ${isHealthy ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {item.rate.toFixed(1).replace('.', ',')}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isHealthy
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isHealthy ? 'Regular' : 'Crítica'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RADAR DE ALUNOS & EVASÃO */}
      {activeTab === 'risk' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden space-y-3 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Alunos em Risco de Evasão / Reprovação por Falta</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Alunos com taxa de frequência abaixo de 75% ou com 3 ou mais faltas consecutivas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setRiskFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    riskFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({data.riskRows?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    riskFilter === 'critical' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Frequência &lt; 75%
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter('consecutive')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    riskFilter === 'consecutive' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  3+ Faltas Consecutivas
                </button>
              </div>

              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchAluno}
                  onChange={(e) => setSearchAluno(e.target.value)}
                  placeholder="Pesquisar por nome/matrícula..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-950 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {!filteredRiskRows.length ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50/60 rounded-xl border border-slate-200/60">
              Nenhum aluno em risco para os filtros selecionados. Ótimo desempenho!
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/90">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Aluno</th>
                    <th className="py-2.5 px-3">Matrícula</th>
                    <th className="py-2.5 px-3">Turma</th>
                    <th className="py-2.5 px-3 text-center">Faltas</th>
                    <th className="py-2.5 px-3 text-center">Faltas Consecutivas</th>
                    <th className="py-2.5 px-3 text-right">Frequência</th>
                    <th className="py-2.5 px-4">Motivo do Risco</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredRiskRows.map((r) => {
                    const isSevere = r.rate < 60;
                    return (
                      <tr key={r.studentId} className="hover:bg-slate-50/75 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          <Link to={`/alunos/${r.studentId}`} className="hover:text-blue-600 hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{r.registrationNumber || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{r.className}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-700">{r.absences}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                          {r.consecutiveAbsences > 0 ? `${r.consecutiveAbsences}x` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-black ${
                              isSevere
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {r.rate.toFixed(1).replace('.', ',')}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-rose-700 font-medium">
                          {r.reasons?.join(' · ') || 'Frequência abaixo de 75%'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link
                            to={`/alunos/${r.studentId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                          >
                            <span>Ver Ficha</span>
                            <ArrowUpRight className="w-3 h-3 text-slate-500" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PADRÕES POR DIA DA SEMANA E TURNO */}
      {activeTab === 'patterns' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Weekday breakdown */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-700" />
              <span>Assiduidade por Dia da Semana</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Identifique os dias com maior índice de evasão ou menor taxa de presença
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200/90 mt-3">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Dia da Semana</th>
                    <th className="py-2.5 px-3 text-center">Chamadas</th>
                    <th className="py-2.5 px-3 text-center text-emerald-700">Presenças</th>
                    <th className="py-2.5 px-3 text-center text-rose-700">Faltas</th>
                    <th className="py-2.5 px-3 text-right">Frequência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {weekdayAnalysis.map((d) => (
                    <tr key={d.dayIdx} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{d.name}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{d.totalCalls}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">{d.present}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-700">{d.absent}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-black ${d.rate >= 75 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {d.records > 0 ? `${d.rate.toFixed(1).replace('.', ',')}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shift breakdown */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Assiduidade por Turno</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Comparativo de assiduidade entre os turnos matutino, vespertino e noturno
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200/90 mt-3">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Turno</th>
                    <th className="py-2.5 px-3 text-center">Registros</th>
                    <th className="py-2.5 px-3 text-center text-emerald-700">Presenças</th>
                    <th className="py-2.5 px-3 text-center text-rose-700">Faltas</th>
                    <th className="py-2.5 px-3 text-right">Frequência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {shiftAnalysis.map((s) => (
                    <tr key={s.shift} className="hover:bg-slate-50/75">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{s.label}</td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-800">{s.records}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">{s.present}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-700">{s.absent}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-black ${s.rate >= 75 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {s.records > 0 ? `${s.rate.toFixed(1).replace('.', ',')}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HISTÓRICO DE CHAMADAS */}
      {activeTab === 'calls' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden space-y-3 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Histórico Consolidado de Chamadas</h2>
              <p className="text-xs text-slate-500 font-medium">Cada aula realizada no período com taxa de presença apurada</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/90 max-h-[520px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-1">
                <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Data da Aula</th>
                  <th className="py-2.5 px-4">Turma</th>
                  <th className="py-2.5 px-3">Curso</th>
                  <th className="py-2.5 px-3 text-center">Turno</th>
                  <th className="py-2.5 px-3 text-center">Alunos</th>
                  <th className="py-2.5 px-3 text-center text-emerald-700">Presentes</th>
                  <th className="py-2.5 px-3 text-center text-rose-700">Faltas</th>
                  <th className="py-2.5 px-4 text-right">Adesão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {callsHistory.map((c, idx) => {
                  const isHealthy = c.rate >= 75;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        {formatDate(c.date)}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        <Link to={`/turmas/${c.classId}`} className="hover:text-blue-600 hover:underline">
                          {c.className}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{c.courseName}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{SHIFT_NAMES[c.shift] || c.shift}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">{c.total}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">{c.present}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-700">{c.absent}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-black ${
                            isHealthy ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {c.rate.toFixed(1).replace('.', ',')}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
