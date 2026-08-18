import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GraduationCap,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  BookOpen,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  ArrowLeft,
  CalendarDays,
  Search,
  Filter,
} from 'lucide-react';

interface PublicStudentPayload {
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
}

export function PublicStudentPortal() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<PublicStudentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
          <h2 className="text-lg font-bold text-slate-900 mb-2">Consulta Pública de Frequência</h2>
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

  const { student, metrics, classes, monthlyEvolution } = data;
  const isHealthyAttendance = metrics.attendanceRate >= 75;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
            ITB
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                Instituto Transforma Brasil
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                <ShieldCheck className="w-3 h-3" />
                Consulta Pública Oficial
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Portal do Aluno • Histórico de Frequência
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200/80 transition-all border border-slate-200 shadow-2xs cursor-pointer"
            title="Copiar link desta página"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'Link Copiado!' : 'Copiar Link'}</span>
          </button>
        </div>
      </header>

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

            {/* Attendance Rate Big Badge */}
            <div className="sm:text-right shrink-0 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
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
        </section>

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

        {/* LGPD and Privacy Notice Banner */}
        <footer className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 text-center text-[11px] text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700 mb-1 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Transparência Acadêmica & Proteção de Dados (LGPD)
          </p>
          <p>
            Este link público é gerado com criptografia em repouso e destina-se exclusivamente ao
            acompanhamento acadêmico pelo próprio estudante e responsáveis. Dados cadastrais sensíveis
            (como CPF, telefones e endereços) não são exibidos nesta consulta pública.
          </p>
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
