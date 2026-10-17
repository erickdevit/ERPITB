import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  BookOpen,
  Copy,
  Check,
  ShieldCheck,
  ArrowLeft,
  CalendarDays,
  Search,
  Award,
  Printer,
  FileSpreadsheet,
  MessageSquare,
} from 'lucide-react';
import { calculationModeLabel, formatGrade, type GradeStatus } from '../lib/grades';

export interface PublicReportCardItem {
  id: string;
  name: string;
  category: string;
  evaluationDate: string | null;
  maxScore: number;
  weight: number;
  notes: string | null;
  score: number | null;
  normalizedScore: number | null;
  remarks: string | null;
  updatedAt: string | null;
}

export interface PublicReportCardTable {
  id: string;
  name: string;
  className: string;
  courseName: string;
  courseCode: string | null;
  teacherName: string | null;
  calculationMode: 'simple' | 'weighted' | 'sum';
  passingGrade: number;
  startDate?: string | null;
  endDate?: string | null;
  notes: string | null;
  updatedAt: string;
  average: number | null;
  status: GradeStatus;
  statusLabel: string;
  totalItems: number;
  evaluatedItems: number;
  items: PublicReportCardItem[];
}

export interface PublicStudentPayload {
  student: {
    name: string;
    registrationNumber: string;
    active: boolean;
  };
  metrics: {
    totalLessons: number;
    present: number;
    absent: number;
    justified: number;
    delayed: number;
    replacement: number;
    attendanceRate: number;
  };
  classes: Array<{
    className: string;
    courseName: string;
    courseCode: string | null;
    shift: string;
    status: string;
  }>;
  monthlyEvolution: Array<{
    month: string;
    label: string;
    rate: number;
    present: number;
    total: number;
    absent: number;
  }>;
  history: Array<{
    id: string;
    date: string;
    status: 'P' | 'F' | 'J' | 'A' | 'R' | 'RC';
    statusLabel: string;
    className: string;
    courseName: string;
    notes: string | null;
    completedAt: string | null;
  }>;
  reportCard?: {
    overallAverage: number | null;
    passingGrade: number;
    overallStatus: GradeStatus;
    overallStatusLabel: string;
    totalTables: number;
    totalAssessments: number;
    evaluatedAssessments: number;
    byCategory: Array<{
      category: string;
      totalItems: number;
      evaluatedItems: number;
      average: number | null;
    }>;
    tables: PublicReportCardTable[];
  };
}

function gradeBadgeClasses(status: GradeStatus): string {
  switch (status) {
    case 'aprovado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'recuperacao':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'reprovado':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'em_andamento':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function PublicStudentPortal() {
  const { code: paramCode } = useParams<{ code: string }>();
  const location = useLocation();

  const code = useMemo(() => {
    if (paramCode) return paramCode.trim();
    const match = location.pathname.match(/^\/(?:matricula|portal|aluno|public\/student|public\/matricula)\/([^/]+)/i);
    if (match && match[1]) return decodeURIComponent(match[1]).trim();
    const segments = location.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ? decodeURIComponent(segments[segments.length - 1]).trim() : '';
  }, [paramCode, location.pathname]);

  const [data, setData] = useState<PublicStudentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'boletim' | 'frequencia'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchHistory, setSearchHistory] = useState<string>('');

  useEffect(() => {
    if (!code) {
      setError('Código de matrícula não informado.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const endpoint = `/api/matricula/${encodeURIComponent(code)}`;
    fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Matrícula não encontrada ou aluno inativo.');
          }
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || 'Não foi possível carregar as informações do aluno.');
        }
        return res.json() as Promise<PublicStudentPayload>;
      })
      .then((json) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrintReportCard = () => {
    window.print();
  };

  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    return data.history.filter((item) => {
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'P' && (item.status === 'P' || item.status === 'RC')) ||
        item.status === filterStatus;

      const q = searchHistory.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.date.includes(q) ||
        item.className.toLowerCase().includes(q) ||
        item.courseName.toLowerCase().includes(q) ||
        item.statusLabel.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [data?.history, filterStatus, searchHistory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-600 animate-pulse">
          Consultando dados de frequência do aluno...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Consulta Pública de Frequência e Boletim</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            {error || 'Não foi possível localizar o histórico do aluno com a matrícula informada.'}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors w-full cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Acessar portal administrativo</span>
          </Link>
        </div>
      </div>
    );
  }

  const { student, metrics, classes, monthlyEvolution, reportCard } = data;
  const isHealthyAttendance = metrics.attendanceRate >= 75;
  const showBoletim = activeTab === 'all' || activeTab === 'boletim';
  const showFrequencia = activeTab === 'all' || activeTab === 'frequencia';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Student Profile Card */}
        <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight">
                    {student.name}
                  </h1>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      student.active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {student.active ? 'Matrícula Ativa' : 'Matrícula Inativa'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition-colors border border-slate-200 cursor-pointer print:hidden"
                    title="Copiar link desta página"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    <span>{copied ? 'Copiado!' : 'Copiar link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReportCard}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200/80 transition-colors border border-slate-200 cursor-pointer print:hidden"
                    title="Imprimir ou salvar boletim em PDF"
                  >
                    <Printer className="w-3 h-3 text-slate-600" />
                    <span>Imprimir Boletim</span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 font-medium">
                  <span>
                    Matrícula: <strong className="text-slate-800 font-semibold">{student.registrationNumber}</strong>
                  </span>
                  {classes.length > 0 && (
                    <>
                      <span>•</span>
                      <span>
                        Turma: <strong className="text-slate-800 font-semibold">{classes[0].className}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Curso: <strong className="text-slate-800 font-semibold">{classes[0].courseName}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Dual Summary Badges: Attendance + Overall Grade */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
              {reportCard && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 min-w-[140px]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Média Geral (Notas)
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                      {formatGrade(reportCard.overallAverage)}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">/ 10,0</span>
                  </div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${gradeBadgeClasses(
                        reportCard.overallStatus,
                      )}`}
                    >
                      {reportCard.overallStatusLabel}
                    </span>
                  </div>
                </div>
              )}

              <div className="sm:text-right bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Taxa de Frequência
                </div>
                <div className="flex items-baseline sm:justify-end gap-1.5">
                  <span
                    className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                      isHealthyAttendance ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {metrics.attendanceRate.toFixed(1)}%
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    ({metrics.present}/{metrics.totalLessons} aulas)
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                  {isHealthyAttendance ? (
                    <span className="text-emerald-700 font-semibold flex items-center sm:justify-end gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Frequência Regular (Acima de 75%)
                    </span>
                  ) : (
                    <span className="text-rose-600 font-semibold flex items-center sm:justify-end gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Abaixo do Mínimo Exigido (75%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHealthyAttendance ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(Math.max(metrics.attendanceRate, 0), 100)}%` }}
              />
            </div>
          </div>

          {/* Portal Navigation Tabs */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Visão Completa
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('boletim')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'boletim' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Boletim de Notas</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('frequencia')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'frequencia'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Frequência</span>
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* BOLETIM DE NOTAS SECTION                                  */}
        {/* ========================================================= */}
        {showBoletim && reportCard && (
          <section className="space-y-4" aria-label="Boletim de Notas do Aluno">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Award className="w-4 h-4 text-slate-700" />
                    <span>Boletim Acadêmico de Notas</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Acompanhamento completo das tabelas de avaliação, provas, atividades práticas e médias
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-medium text-slate-600">
                    Avaliações avaliadas:{' '}
                    <strong className="text-slate-900">
                      {reportCard.evaluatedAssessments}/{reportCard.totalAssessments}
                    </strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-medium text-slate-600">
                    Média mínima:{' '}
                    <strong className="text-slate-900">{formatGrade(reportCard.passingGrade)}</strong>
                  </span>
                </div>
              </div>

              {/* Category Summary Strip inside Boletim */}
              {reportCard.byCategory.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                    Desempenho por Tipo de Avaliação
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {reportCard.byCategory.map((cat) => (
                      <div
                        key={cat.category}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900">{cat.category}</div>
                          <div className="text-[10px] text-slate-500">
                            {cat.evaluatedItems}/{cat.totalItems} avaliada(s)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-slate-900">{formatGrade(cat.average)}</div>
                          <div className="text-[10px] text-slate-400">média</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grade Tables Detail */}
              {reportCard.tables.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/60 text-center text-xs text-slate-500">
                  Nenhuma tabela de notas publicada para esta matrícula até o momento.
                </div>
              ) : (
                <div className="space-y-4">
                  {reportCard.tables.map((table) => (
                    <div
                      key={table.id}
                      className="rounded-xl border border-slate-200 overflow-hidden bg-white"
                    >
                      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900">{table.name}</h3>
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-semibold text-slate-600">
                              {calculationModeLabel(table.calculationMode)}
                            </span>
                            {(table.startDate || table.endDate) && (
                              <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-500">
                                {table.startDate && table.endDate
                                  ? `${formatDisplayDate(table.startDate)} a ${formatDisplayDate(table.endDate)}`
                                  : table.startDate
                                  ? `Início: ${formatDisplayDate(table.startDate)}`
                                  : `Fim: ${formatDisplayDate(table.endDate!)}`}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {table.courseName} • {table.className}
                            {table.teacherName ? ` • Prof. ${table.teacherName}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                              Média da Etapa
                            </div>
                            <div className="text-base font-black text-slate-900">
                              {formatGrade(table.average)}{' '}
                              <span className="text-[10px] font-normal text-slate-400">
                                (mín. {formatGrade(table.passingGrade)})
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${gradeBadgeClasses(
                              table.status,
                            )}`}
                          >
                            {table.statusLabel}
                          </span>
                        </div>
                      </div>

                      {table.items.length === 0 ? (
                        <div className="p-4 text-xs text-slate-400 text-center">
                          Nenhuma avaliação cadastrada nesta etapa.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50/40 text-[11px] font-semibold text-slate-500">
                                <th className="py-2.5 px-4">Avaliação</th>
                                <th className="py-2.5 px-3">Tipo</th>
                                <th className="py-2.5 px-3">Data</th>
                                <th className="py-2.5 px-3 text-center">Peso / Valor</th>
                                <th className="py-2.5 px-4 text-center">Nota Obtida</th>
                                <th className="py-2.5 px-4">Observações do Professor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {table.items.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/60">
                                  <td className="py-2.5 px-4 font-semibold text-slate-900">{item.name}</td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                                      {item.category}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-500">
                                    {item.evaluationDate ? formatDisplayDate(item.evaluationDate) : '—'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-slate-500">
                                    Máx: {formatGrade(item.maxScore)}
                                    {table.calculationMode === 'weighted' ? ` (Peso ${formatGrade(item.weight)})` : ''}
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-bold text-slate-900">
                                    {item.score !== null ? (
                                      <span className="inline-flex items-baseline gap-1">
                                        <span>{formatGrade(item.score)}</span>
                                        <span className="text-[10px] text-slate-400 font-normal">
                                          / {formatGrade(item.maxScore)}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-medium text-slate-400">Pendente</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-600">
                                    {item.remarks ? (
                                      <span className="inline-flex items-center gap-1 text-slate-700">
                                        <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>{item.remarks}</span>
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* FREQUÊNCIA SECTION                                        */}
        {/* ========================================================= */}
        {showFrequencia && (
          <>
            {/* Metrics Grid */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                  <span>Total de Aulas</span>
                  <BookOpen className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-xl font-bold text-slate-900 tracking-tight">
                  {metrics.totalLessons}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-0.5">aulas registradas</div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between text-emerald-700 text-xs font-medium mb-1">
                  <span>Presenças</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold text-emerald-700 tracking-tight">
                  {metrics.present}
                </div>
                <div className="text-[10px] text-emerald-600/80 font-medium mt-0.5">aulas comparecidas</div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between text-rose-700 text-xs font-medium mb-1">
                  <span>Faltas</span>
                  <XCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-xl font-bold text-rose-700 tracking-tight">
                  {metrics.absent}
                </div>
                <div className="text-[10px] text-rose-600/80 font-medium mt-0.5">ausências sem reposição</div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between text-sky-700 text-xs font-medium mb-1">
                  <span>Outros Lançamentos</span>
                  <Clock className="w-4 h-4 text-sky-500" />
                </div>
                <div className="text-xl font-bold text-slate-800 tracking-tight">
                  {metrics.justified + metrics.delayed + metrics.replacement}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {metrics.justified}J • {metrics.delayed}A • {metrics.replacement}R
                </div>
              </div>
            </section>

            {/* Monthly Evolution Card */}
            {monthlyEvolution.length > 0 && (
              <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-slate-500" />
                      Evolução Mensal da Frequência
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Acompanhamento do aproveitamento mês a mês
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {monthlyEvolution.map((m) => (
                    <div
                      key={m.month}
                      className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-800">{m.label}</span>
                        <span
                          className={`text-xs font-extrabold ${
                            m.rate >= 75 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {m.rate.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${m.rate >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(m.rate, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                        <span>{m.present} presenças</span>
                        <span>{m.total} aulas no mês</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Detailed Attendance History */}
            <section className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              {/* Header & Filter Bar */}
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-slate-500" />
                    Histórico Detalhado de Aulas
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Lista de todos os registros de presença efetuados pelos professores
                  </p>
                </div>

                {/* Filter Pills and Search */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[160px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchHistory}
                      onChange={(e) => setSearchHistory(e.target.value)}
                      placeholder="Filtrar por data/turma..."
                      className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-950 placeholder:text-slate-400"
                    />
                  </div>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-950 cursor-pointer"
                  >
                    <option value="all">Todos os status</option>
                    <option value="P">Presenças (P e RC)</option>
                    <option value="F">Faltas (F)</option>
                    <option value="J">Justificadas (J)</option>
                    <option value="A">Atrasos (A)</option>
                    <option value="R">Reposições Pendentes (R)</option>
                  </select>
                </div>
              </div>

              {/* History List/Table */}
              {filteredHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-medium">
                  Nenhum registro de frequência localizado com os filtros selecionados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                        <th className="py-3 px-4">Data</th>
                        <th className="py-3 px-4">Turma / Curso</th>
                        <th className="py-3 px-4">Situação</th>
                        <th className="py-3 px-4">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredHistory.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            {formatDisplayDate(row.date)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{row.className}</div>
                            <div className="text-[10px] text-slate-400">{row.courseName}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <StatusBadge status={row.status} label={row.statusLabel} />
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                            {row.notes || (row.completedAt ? `Reposição realizada em ${formatDisplayDate(row.completedAt.slice(0, 10))}` : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* LGPD and Privacy Notice Banner */}
        <footer className="py-6 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Transparência Acadêmica & Proteção de Dados (LGPD)</span>
        </footer>
      </main>
    </div>
  );
}

function formatDisplayDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate || '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === 'P') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
        <CheckCircle2 className="w-3 h-3" />
        Presente
      </span>
    );
  }
  if (status === 'RC') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-bold">
        <CheckCircle2 className="w-3 h-3" />
        Reposição Concluída
      </span>
    );
  }
  if (status === 'F') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
        <XCircle className="w-3 h-3" />
        Falta
      </span>
    );
  }
  if (status === 'J') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
        <Clock className="w-3 h-3" />
        Justificada
      </span>
    );
  }
  if (status === 'A') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
        <Clock className="w-3 h-3" />
        Atraso
      </span>
    );
  }
  if (status === 'R') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
        <AlertCircle className="w-3 h-3" />
        Reposição Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
      {label || status}
    </span>
  );
}
