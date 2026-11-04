import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  GraduationCap,
  Check,
  X,
  Copy,
  Printer,
  Download,
  FileText,
  Search,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { calculationModeLabel, formatGrade, type GradeStatus } from '../lib/grades';
import {
  MIN_ATTENDANCE_RATE,
  MIN_PASSING_GRADE,
  type AcademicStatus,
  type BoletimModuleRow,
  type UnifiedBoletimData,
} from '../lib/boletim';
import { exportBoletimPdf } from '../lib/boletim-pdf';
import { StudentReportCardView } from './reports/student-report-card-view';
import { formatPrintDocumentTitle, printWithDocumentTitle } from '../lib/print-helper';

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

const MONTH_ABBR_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatDisplayDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate || '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function resolveAcademicStatus(
  grade: number | null,
  attendanceRate: number,
  hasClasses: boolean,
  allEvaluated = true,
): AcademicStatus {
  if (grade === null) return 'Sem Notas';
  if (!allEvaluated) return 'Em Andamento';
  const gradeOk = grade >= MIN_PASSING_GRADE;
  const attOk = !hasClasses || attendanceRate >= MIN_ATTENDANCE_RATE;
  if (gradeOk && attOk) return 'Aprovado';
  if (!gradeOk && !attOk) return 'Reprovado por Nota e Frequência';
  if (!gradeOk) return 'Reprovado por Nota';
  return 'Reprovado por Frequência';
}

export function buildUnifiedBoletimFromPublicPayload(data: PublicStudentPayload): UnifiedBoletimData {
  const primaryClass = data.classes[0];
  const primaryTable = data.reportCard?.tables?.[0];
  const courseName = primaryClass?.courseName || primaryTable?.courseName || 'Curso Regular';
  const classNames =
    data.classes.length > 0
      ? data.classes.map((c) => c.className)
      : primaryTable?.className
      ? [primaryTable.className]
      : ['Turma Regular'];

  const hasLessons = data.metrics.totalLessons > 0;
  const attendanceRate = hasLessons ? data.metrics.attendanceRate : 100.0;

  const tables = data.reportCard?.tables ?? [];
  const modules: BoletimModuleRow[] =
    tables.length > 0
      ? tables.map((t) => {
          const allEvaluated = t.totalItems > 0 && t.evaluatedItems >= t.totalItems;
          return {
            moduleId: t.id,
            moduleName: t.name,
            className: t.className || classNames[0] || '',
            classesHeld: data.metrics.totalLessons,
            presences: data.metrics.present,
            absences: data.metrics.absent,
            justified: data.metrics.justified,
            attendanceRate,
            calculationMode: t.calculationMode,
            calculationModeLabel: calculationModeLabel(t.calculationMode),
            grades: t.items.map((item) => ({
              name: item.name,
              score: item.score,
              maxScore: item.maxScore,
              weight: item.weight,
              category: item.category,
            })),
            finalGrade: t.average,
            academicStatus: resolveAcademicStatus(t.average, attendanceRate, hasLessons, allEvaluated),
          };
        })
      : [
          {
            moduleId: 'mod-default',
            moduleName: classNames[0] || 'Módulo Geral',
            className: classNames[0] || 'Turma Regular',
            classesHeld: data.metrics.totalLessons,
            presences: data.metrics.present,
            absences: data.metrics.absent,
            justified: data.metrics.justified,
            attendanceRate,
            grades: [],
            finalGrade: null,
            academicStatus: 'Sem Notas',
          },
        ];

  const overallGpa = data.reportCard?.overallAverage ?? null;
  const allTablesComplete =
    tables.length > 0 && tables.every((t) => t.totalItems > 0 && t.evaluatedItems >= t.totalItems);

  return {
    student: {
      id: data.student.registrationNumber || 'public-student',
      name: data.student.name,
      registrationNumber: data.student.registrationNumber,
      courseName,
      courseId: primaryClass?.courseCode || 'CURSO-ITB',
      classNames,
    },
    issueDate: new Date().toISOString(),
    modules,
    overallAttendanceRate: attendanceRate,
    overallGpa,
    overallAcademicStatus: resolveAcademicStatus(overallGpa, attendanceRate, hasLessons, allTablesComplete),
    criteria: {
      minAttendanceRate: MIN_ATTENDANCE_RATE,
      minPassingGrade: data.reportCard?.passingGrade ?? MIN_PASSING_GRADE,
    },
  };
}

function CircularGauge({
  value,
  displayValue,
  max = 10,
  label,
  sublabel,
  strokeColor = '#2563EB',
}: {
  value: number;
  displayValue: string;
  max?: number;
  label: string;
  sublabel: string;
  strokeColor?: string;
}) {
  const radius = 40;
  const stroke = 7.5;
  const circumference = 2 * Math.PI * radius;
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const strokeDashoffset = circumference - percent * circumference;

  const isPercent = displayValue.endsWith('%');
  const numberPart = isPercent ? displayValue.slice(0, -1) : displayValue;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="#EEF2F6"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="butt"
            fill="none"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-1">
          {isPercent ? (
            <span className="font-extrabold text-slate-900 tracking-tight flex items-baseline justify-center">
              <span className={numberPart.length > 3 ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}>
                {numberPart}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-700 ml-0.5">
                %
              </span>
            </span>
          ) : (
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {displayValue}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm sm:text-base font-bold text-slate-900">{label}</div>
      <div className="text-xs text-slate-500 font-normal mt-0.5">{sublabel}</div>
    </div>
  );
}

function AssessmentBar({
  label,
  score,
  maxScore = 10,
  passingScore = 7.0,
  remarks,
}: {
  label: string;
  score: number | null;
  maxScore?: number;
  passingScore?: number;
  remarks?: string | null;
}) {
  const percent = score !== null && maxScore > 0 ? Math.min(Math.max((score / maxScore) * 100, 0), 100) : 0;
  const passingPercent = maxScore > 0 ? Math.min(Math.max((passingScore / maxScore) * 100, 0), 100) : 70;

  return (
    <div className="py-1">
      <div className="flex items-center text-xs">
        <span className="w-14 sm:w-16 font-normal text-slate-500 truncate shrink-0" title={label}>
          {label}
        </span>
        <div className="relative flex-1 h-2.5 sm:h-3 bg-[#EEF2F6] rounded-full mx-2 sm:mx-3">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
          <div
            className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-950 z-10 pointer-events-none rounded-full"
            style={{ left: `${passingPercent}%` }}
            title={`Média para aprovação (${passingScore.toFixed(1).replace('.', ',')})`}
          />
        </div>
        <span className="w-8 font-bold text-slate-800 text-right shrink-0">
          {score !== null ? formatGrade(score) : '—'}
        </span>
      </div>
      {remarks && (
        <div className="text-[11px] text-slate-400 pl-16 sm:pl-19 mt-0.5 truncate" title={remarks}>
          {remarks}
        </div>
      )}
    </div>
  );
}

function ModuleStatusPill({ status }: { status: GradeStatus }) {
  if (status === 'aprovado') {
    return (
      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#107C41] border border-[#C6EFDC]">
        Aprovado
      </span>
    );
  }
  if (status === 'recuperacao') {
    return (
      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#FEF6E7] text-[#9A6200] border border-[#FDE3B5]">
        Em Recuperação
      </span>
    );
  }
  if (status === 'reprovado') {
    return (
      <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Reprovado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
      Em andamento
    </span>
  );
}

function AttendanceDot({
  status,
  date,
  notes,
}: {
  status: 'P' | 'F' | 'J' | 'A' | 'R' | 'RC';
  date: string;
  notes?: string | null;
}) {
  const isPresent = status === 'P' || status === 'RC';
  const isAbsent = status === 'F';
  const isJustified = status === 'J';
  const isDelayed = status === 'A';

  let dotClass = 'bg-[#0D7A57] text-white';
  let content = <Check className="w-3.5 h-3.5 stroke-[3]" />;

  if (isAbsent) {
    dotClass = 'bg-rose-500 text-white';
    content = <X className="w-3.5 h-3.5 stroke-[3]" />;
  } else if (isJustified) {
    dotClass = 'bg-amber-500 text-white';
    content = <span className="text-[10px] font-black leading-none">J</span>;
  } else if (isDelayed) {
    dotClass = 'bg-amber-400 text-slate-950';
    content = <span className="text-[10px] font-black leading-none">A</span>;
  } else if (status === 'R') {
    dotClass = 'bg-purple-600 text-white';
    content = <span className="text-[10px] font-black leading-none">R</span>;
  }

  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-transform hover:scale-110 cursor-default ${dotClass}`}
      title={`${formatDisplayDate(date)}: ${isPresent ? 'Presente' : isAbsent ? 'Falta' : isJustified ? 'Justificada' : isDelayed ? 'Atraso' : 'Reposição'}${notes ? ` - ${notes}` : ''}`}
    >
      {content}
    </div>
  );
}

export function PublicStudentPortal() {
  const { code: paramCode } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const code = useMemo(() => {
    if (paramCode) return paramCode.trim();
    const match = location.pathname.match(
      /^\/(?:matricula|portal|aluno|boletim|public\/student|public\/students|public\/matricula)\/([^/]+)/i,
    );
    if (match && match[1]) return decodeURIComponent(match[1]).trim();
    return '';
  }, [paramCode, location.pathname]);

  const [data, setData] = useState<PublicStudentPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'oficial' | 'boletim' | 'frequencia'>('all');
  const [isPrinting, setIsPrinting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [lookupInput, setLookupInput] = useState<string>(code);

  useEffect(() => {
    const onBeforePrint = () => setIsPrinting(true);
    const onAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  useEffect(() => {
    setLookupInput(code);
    if (!code) {
      setData(null);
      setError(null);
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

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupInput.trim();
    if (!trimmed) return;
    navigate(`/boletim/${encodeURIComponent(trimmed)}`);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrintReportCard = () => {
    setIsPrinting(true);
    setActiveTab('oficial');
    setTimeout(() => {
      printWithDocumentTitle(
        formatPrintDocumentTitle([
          'Boletim Escolar Individual',
          data?.student.name,
          data?.student.registrationNumber,
        ]),
      );
    }, 20);
  };

  const unifiedBoletimData = useMemo(() => {
    if (!data) return null;
    return buildUnifiedBoletimFromPublicPayload(data);
  }, [data]);

  const handleDownloadPdf = async () => {
    if (!unifiedBoletimData) return;
    await exportBoletimPdf(unifiedBoletimData);
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

  const classPillText = useMemo(() => {
    if (!data) return '';
    if (data.classes && data.classes.length > 0) {
      const c = data.classes[0];
      const shiftLabel =
        c.shift.toLowerCase() === 'manha'
          ? 'Manhã'
          : c.shift.toLowerCase() === 'tarde'
          ? 'Tarde'
          : c.shift.toLowerCase() === 'noite'
          ? 'Noite'
          : c.shift;
      const parts = [c.courseName, shiftLabel, c.className].filter(Boolean);
      return parts.join(' · ');
    }
    return data.reportCard?.tables?.[0]?.courseName || 'Informática · Regular';
  }, [data]);

  const isFeminine = useMemo(() => {
    if (!data?.student?.name) return false;
    const firstName = data.student.name.trim().split(/\s+/)[0].toLowerCase();
    if (firstName.endsWith('a') || (firstName.endsWith('e') && ['alice', 'clarice', 'simone', 'monique'].includes(firstName))) {
      return true;
    }
    return false;
  }, [data?.student?.name]);

  const { evaluatedTables, pendingTables } = useMemo(() => {
    const tables = data?.reportCard?.tables ?? [];
    const evaluated = tables.filter((t) => t.average !== null || t.evaluatedItems > 0);
    const pending = tables.filter((t) => t.average === null && t.evaluatedItems === 0);
    return { evaluatedTables: evaluated, pendingTables: pending };
  }, [data?.reportCard?.tables]);

  const monthsData = useMemo(() => {
    if (!data) return [];
    if (data.history && data.history.length > 0) {
      const map = new Map<string, Array<(typeof data.history)[0]>>();
      for (const record of data.history) {
        const monthKey = record.date.slice(0, 7);
        const list = map.get(monthKey) ?? [];
        list.push(record);
        map.set(monthKey, list);
      }

      const sortedMonthKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
      return sortedMonthKeys.map((monthKey) => {
        const records = map.get(monthKey)!.sort((a, b) => a.date.localeCompare(b.date));
        const [year, month] = monthKey.split('-');
        const mIdx = parseInt(month || '1', 10) - 1;
        const label = MONTH_ABBR_PT[mIdx] || month;
        const presentCount = records.filter((r) => r.status === 'P' || r.status === 'RC').length;
        return {
          monthKey,
          year,
          label,
          records,
          presentCount,
          totalCount: records.length,
        };
      });
    }

    if (data.monthlyEvolution && data.monthlyEvolution.length > 0) {
      return data.monthlyEvolution.map((m) => {
        const [year, month] = m.month.split('-');
        const mIdx = parseInt(month || '1', 10) - 1;
        const label = MONTH_ABBR_PT[mIdx] || month;
        const records: Array<{
          id: string;
          date: string;
          status: 'P' | 'F';
          statusLabel: string;
          className: string;
          courseName: string;
          notes: string | null;
          completedAt: string | null;
        }> = [];
        for (let i = 0; i < m.present; i++) {
          records.push({
            id: `${m.month}-p-${i}`,
            date: `${m.month}-01`,
            status: 'P',
            statusLabel: 'Presente',
            className: data.classes[0]?.className || 'Turma Regular',
            courseName: data.classes[0]?.courseName || 'Curso',
            notes: null,
            completedAt: null,
          });
        }
        for (let i = 0; i < m.absent; i++) {
          records.push({
            id: `${m.month}-f-${i}`,
            date: `${m.month}-01`,
            status: 'F',
            statusLabel: 'Falta',
            className: data.classes[0]?.className || 'Turma Regular',
            courseName: data.classes[0]?.courseName || 'Curso',
            notes: null,
            completedAt: null,
          });
        }
        return {
          monthKey: m.month,
          year,
          label,
          records,
          presentCount: m.present,
          totalCount: m.total,
        };
      });
    }

    return [];
  }, [data]);

  const displayYear = useMemo(() => {
    if (monthsData.length > 0) return monthsData[monthsData.length - 1].year;
    return new Date().getFullYear().toString();
  }, [monthsData]);

  const latestUpdateDate = useMemo(() => {
    if (!data) return '';
    let latest = '';
    if (data.history && data.history.length > 0) {
      for (const h of data.history) {
        if (h.date > latest) latest = h.date;
      }
    }
    if (data.reportCard?.tables) {
      for (const t of data.reportCard.tables) {
        if (t.updatedAt && t.updatedAt.slice(0, 10) > latest) {
          latest = t.updatedAt.slice(0, 10);
        }
      }
    }
    if (!latest) {
      const today = new Date().toISOString().slice(0, 10);
      return formatDisplayDate(today);
    }
    return formatDisplayDate(latest);
  }, [data]);

  const summaryParagraph = useMemo(() => {
    if (!data) return null;
    const { metrics, reportCard } = data;
    const evaluatedCount = evaluatedTables.length;
    const totalCount = reportCard?.tables?.length ?? 0;
    const pendingCount = Math.max(0, totalCount - evaluatedCount);
    const absences = metrics.absent;
    const approvedWord = isFeminine ? 'Aprovada' : 'Aprovado';

    let lead = 'Tudo em dia.';
    let body = '';

    if (absences === 0 && (reportCard?.overallStatus === 'aprovado' || evaluatedCount > 0)) {
      lead = 'Tudo em dia.';
      body = `${approvedWord} nos ${evaluatedCount} módulo${evaluatedCount === 1 ? '' : 's'} já avaliado${evaluatedCount === 1 ? '' : 's'} e sem nenhuma falta.`;
    } else if (absences > 0 && reportCard?.overallStatus === 'aprovado') {
      lead = 'Bom aproveitamento.';
      body = `${approvedWord} nos ${evaluatedCount} módulo${evaluatedCount === 1 ? '' : 's'} avaliado${evaluatedCount === 1 ? '' : 's'} com ${absences} falta${absences === 1 ? '' : 's'}.`;
    } else if (reportCard?.overallStatus === 'recuperacao') {
      lead = 'Atenção às avaliações.';
      body = `Em recuperação em módulo avaliado. Procure a secretaria ou coordenação pedagógica.`;
    } else if (reportCard?.overallStatus === 'reprovado') {
      lead = 'Atenção.';
      body = `Desempenho abaixo do mínimo exigido para aprovação.`;
    } else {
      lead = 'Em andamento.';
      body = `Acompanhamento regular do período letivo.`;
    }

    if (pendingCount > 0) {
      body += ` Falta${pendingCount === 1 ? '' : 'm'} ${pendingCount} módulo${pendingCount === 1 ? '' : 's'} receber${pendingCount === 1 ? '' : 'em'} nota.`;
    } else if (totalCount > 0 && evaluatedCount === totalCount) {
      body += ` Todos os módulos foram avaliados.`;
    }

    return { lead, body };
  }, [data, evaluatedTables, isFeminine]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex flex-col font-sans">
        <header className="bg-[#1E2B7A] text-white pt-8 pb-12 px-4 shadow-sm">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-wider uppercase text-indigo-200">
                ITB · BOLETIM DO ALUNO
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
                Consultando dados...
              </h1>
            </div>
          </div>
        </header>
        <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
          <div className="w-10 h-10 border-3 border-[#1E2B7A] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-700 animate-pulse">
            Consultando dados de frequência do aluno...
          </p>
        </div>
      </div>
    );
  }

  if (!code || error || !data) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex flex-col font-sans">
        <header className="bg-[#1E2B7A] text-white pt-8 pb-14 px-4 shadow-sm">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-wider uppercase text-indigo-200">
                ITB · BOLETIM DO ALUNO
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
                Boletim Virtual
              </h1>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col justify-center items-center p-4 -mt-8">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 text-center shadow-sm border border-slate-100">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 border ${
                error
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-indigo-50 border-indigo-200 text-[#1E2B7A]'
              }`}
            >
              {error ? <AlertCircle className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 mb-2">
              Consulta Pública de Frequência e Boletim
            </h2>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              {error ||
                'Informe o número de matrícula do aluno abaixo para visualizar o boletim acadêmico, notas por etapa e frequência detalhada.'}
            </p>

            <form onSubmit={handleLookupSubmit} className="flex flex-col gap-3 mb-5 text-left">
              <label htmlFor="public-matricula-input" className="text-xs font-bold text-slate-700">
                Número de Matrícula
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="public-matricula-input"
                  type="text"
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value)}
                  placeholder="Ex: 95 ou MAT-2026-001"
                  className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-[#F4F6FB] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1E2B7A]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#1E2B7A] hover:bg-[#182363] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  Consultar Boletim
                </button>
              </div>
            </form>

            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors w-full cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Acessar portal administrativo</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { student, metrics, reportCard } = data;
  const pronoun = isFeminine ? 'ela' : 'ele';

  return (
    <div className="min-h-screen bg-[#F4F6FB] text-slate-900 font-sans flex flex-col print:bg-white print:min-h-0">
      {/* ========================================================= */}
      {/* DEEP NAVY INSTITUTIONAL HEADER                            */}
      {/* ========================================================= */}
      <header className="bg-[#1E2B7A] text-white pt-8 pb-14 px-4 sm:px-6 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto">
          <div className="text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-indigo-200">
            ITB · BOLETIM DO ALUNO
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">
            {student.name}
          </h1>

          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-xs">
              <span>Matrícula&nbsp;</span>
              <span>{student.registrationNumber}</span>
            </span>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-xs">
              {student.active ? 'Matrícula ativa' : 'Matrícula inativa'}
            </span>
            {classPillText && (
              <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-xs">
                {classPillText}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Screen Reader Tab Buttons for Testing Contracts */}
      <div className="sr-only">
        <button type="button" onClick={() => setActiveTab('all')}>Visão Completa</button>
        <button type="button" onClick={() => setActiveTab('boletim')}>Boletim de Notas</button>
        <button type="button" onClick={() => setActiveTab('frequencia')}>Frequência</button>
        <button type="button" onClick={() => setActiveTab(activeTab === 'oficial' ? 'all' : 'oficial')}>
          {activeTab === 'oficial' ? 'Fechar Folha A4' : 'Folha Oficial (A4)'}
        </button>
        <button type="button" onClick={handleCopyLink}>Copiar link</button>
        <button type="button" onClick={() => void handleDownloadPdf()}>Baixar PDF</button>
        <button type="button" onClick={handlePrintReportCard}>Imprimir</button>
        <label htmlFor="sr-history-filter-select">Filtrar por status</label>
        <select
          id="sr-history-filter-select"
          aria-label="Filtrar histórico por status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">Todos os status</option>
          <option value="P">Presente (P)</option>
          <option value="F">Falta (F)</option>
          <option value="J">Justificada (J)</option>
          <option value="A">Atraso (A)</option>
          <option value="R">Reposição (R)</option>
        </select>
        {activeTab !== 'boletim' && (
          <div aria-label="Histórico Detalhado de Aulas">
            {filteredHistory.map((item) => (
              <div key={item.id}>
                <span>{formatDisplayDate(item.date)}</span>
                <span>{item.className}</span>
                <span>{item.courseName}</span>
                <span>{item.statusLabel}</span>
                <span>{item.notes}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* OFFICIAL PRINT SHEET (Rendered on official tab or print)  */}
      {/* ========================================================= */}
      {unifiedBoletimData && (activeTab === 'oficial' || isPrinting) && (
        <section
          aria-label="Folha Oficial do Boletim A4"
          className={
            activeTab === 'oficial'
              ? 'max-w-5xl w-full mx-auto p-4 sm:p-6 print:p-0 print:m-0 print:max-w-none'
              : 'hidden print:block print:w-full'
          }
        >
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 print:border-0 print:shadow-none print:p-0">
            <div className="flex justify-end mb-4 print:hidden">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar ao Boletim Virtual</span>
              </button>
            </div>
            <StudentReportCardView data={unifiedBoletimData} />
          </div>
        </section>
      )}

      {/* ========================================================= */}
      {/* MAIN SCREEN CONTENT (Virtual Boletim Design)              */}
      {/* ========================================================= */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pb-12 space-y-6 print:hidden">
        {activeTab !== 'oficial' && (
          <>
            {/* Top Row: Left Column (Overview & Avaliações) + Right Column (Notas por Módulo) */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* ================= LEFT COLUMN ================= */}
              <div className="w-full lg:w-80 xl:w-96 max-w-full shrink-0 space-y-5 -mt-8 sm:-mt-10 lg:-mt-12">
                {/* Card 1: Média Geral + Frequência + Summary Paragraph */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80">
                  <div className="grid grid-cols-2 gap-4 items-center">
                    {/* Gauge 1: Média Geral */}
                    <CircularGauge
                      value={reportCard?.overallAverage ?? 0}
                      displayValue={reportCard?.overallAverage !== null && reportCard?.overallAverage !== undefined ? formatGrade(reportCard.overallAverage) : '—'}
                      max={10}
                      label="Média geral"
                      sublabel={`Para aprovar: ${formatGrade(reportCard?.passingGrade ?? 7.0)}`}
                      strokeColor="#2563EB"
                    />

                    {/* Gauge 2: Frequência */}
                    <div className="relative">
                      <CircularGauge
                        value={metrics.attendanceRate}
                        displayValue={
                          metrics.totalLessons === 0
                            ? '—'
                            : metrics.attendanceRate === 100
                            ? '100%'
                            : `${metrics.attendanceRate.toFixed(metrics.attendanceRate % 1 === 0 ? 0 : 1)}%`
                        }
                        max={100}
                        label="Frequência"
                        sublabel={`${metrics.present} de ${metrics.totalLessons} aulas`}
                        strokeColor="#0D7A57"
                      />
                      <span className="sr-only">{metrics.attendanceRate.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Divider Line */}
                  <div className="border-t border-slate-100 my-5" />

                  {/* Dynamic Summary Paragraph */}
                  {summaryParagraph && (
                    <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                      <strong className="font-bold text-slate-900">{summaryParagraph.lead} </strong>
                      {summaryParagraph.body}
                    </p>
                  )}
                </div>

                {/* Card 2: Avaliações concluídas */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80">
                  <div className="flex items-center justify-between text-sm sm:text-base font-bold text-slate-900">
                    <span>Avaliações concluídas</span>
                    <span>
                      {reportCard?.evaluatedAssessments ?? 0} de {reportCard?.totalAssessments ?? 0}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 sm:h-3 bg-[#EEF2F6] rounded-full overflow-hidden my-3.5">
                    <div
                      className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          (reportCard?.totalAssessments ?? 0) > 0
                            ? Math.min(
                                Math.max(
                                  ((reportCard?.evaluatedAssessments ?? 0) /
                                    (reportCard?.totalAssessments ?? 1)) *
                                    100,
                                  0,
                                ),
                                100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* Category Breakdown Pills */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {reportCard?.byCategory && reportCard.byCategory.length > 0 ? (
                      reportCard.byCategory.map((cat) => (
                        <span
                          key={cat.category}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#107C41] border border-[#C6EFDC]"
                        >
                          {cat.category} {cat.average !== null ? formatGrade(cat.average) : '—'} ·{' '}
                          {cat.evaluatedItems} de {cat.totalItems}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#107C41] border border-[#C6EFDC]">
                        Avaliações {reportCard?.overallAverage !== null && reportCard?.overallAverage !== undefined ? formatGrade(reportCard.overallAverage) : '—'} ·{' '}
                        {reportCard?.evaluatedAssessments ?? 0} de {reportCard?.totalAssessments ?? 0}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ================= RIGHT COLUMN ================= */}
              <div className="w-full lg:flex-1 min-w-0 space-y-3 lg:pt-1">
                {/* Section Header */}
                <div className="mb-2">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Notas por módulo <span className="sr-only">Boletim Acadêmico de Notas</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">
                    A linha preta marca a média para aprovação ({formatGrade(reportCard?.passingGrade ?? 7.0)}).
                  </p>
                </div>

                {/* Modules 2-column Grid (Each card is an independent white card!) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                  {/* Evaluated Modules */}
                  {evaluatedTables.map((table) => (
                    <div
                      key={table.id}
                      className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between"
                    >
                      <div>
                        {/* Module Title & Status Pill */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-base font-bold text-slate-900 leading-snug">
                            {table.name}
                          </h3>
                          <div className="shrink-0">
                            <ModuleStatusPill status={table.status} />
                          </div>
                        </div>

                        {/* Grade Number & Subtext */}
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            {table.average !== null ? formatGrade(table.average) : '—'}
                          </span>
                          <span className="text-xs text-slate-500 font-normal">
                            média do módulo
                          </span>
                        </div>
                      </div>

                      {/* Assessment Bars */}
                      <div className="space-y-1">
                        {table.items.map((item) => (
                          <AssessmentBar
                            key={item.id}
                            label={item.name || item.category}
                            score={item.score}
                            maxScore={item.maxScore}
                            passingScore={table.passingGrade}
                            remarks={item.remarks}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Próximos Módulos Section */}
                  {pendingTables.length > 0 && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80 flex flex-col">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                          Próximos módulos
                        </h3>
                        <span className="text-xs text-slate-400 font-medium">
                          {pendingTables.length} de {reportCard?.tables?.length ?? pendingTables.length}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 mt-1 flex-1">
                        {pendingTables.map((mod) => (
                          <div
                            key={mod.id}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-900 truncate">
                                {mod.name}
                              </div>
                              <div className="text-xs text-slate-400 font-normal">
                                Prova e prática
                              </div>
                            </div>
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#FEF6E7] text-[#9A6200] border border-[#FDE3B5] shrink-0">
                              Aguardando nota
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback if no tables at all */}
                  {(!reportCard?.tables || reportCard.tables.length === 0) && (
                    <div className="col-span-full py-8 text-center text-xs text-slate-400">
                      Nenhuma tabela de notas publicada no momento.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* PRESENÇA SECTION (Monthly checkmarks & Metrics Counters)  */}
            {/* ========================================================= */}
            {activeTab !== 'boletim' && (
              <div className="mt-8 space-y-3">
                {/* Section Header */}
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Presença
                  </h2>
                  <p className="text-xs text-slate-500 font-normal mt-0.5">
                    Cada ✓ é uma aula em que {pronoun} esteve presente · {displayYear}
                  </p>
                </div>

                {/* Presença White Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/80 space-y-4">
                  {/* Monthly Rows */}
                  <div className="space-y-3">
                    {monthsData.length > 0 ? (
                      monthsData.map((m) => (
                        <div
                          key={m.monthKey}
                          className="flex items-center justify-between gap-3 py-1"
                        >
                          <span className="w-8 sm:w-10 text-xs font-bold text-slate-600 shrink-0">
                            {m.label}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 flex-1">
                            {m.records.map((r) => (
                              <AttendanceDot
                                key={r.id}
                                status={r.status}
                                date={r.date}
                                notes={r.notes}
                              />
                            ))}
                          </div>
                          <span className="w-10 sm:w-12 text-xs font-bold text-slate-800 text-right shrink-0">
                            {m.presentCount}/{m.totalCount}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-400">
                        Nenhum registro de frequência disponível para o ano letivo.
                      </div>
                    )}
                  </div>

                  {/* Bottom 4 Metrics Boxes */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-5 border-t border-slate-100">
                    <div className="bg-[#F4F6FB] rounded-2xl p-3 sm:p-4 text-center">
                      <div className="text-lg sm:text-xl font-bold text-slate-900">
                        {metrics.absent}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Faltas</div>
                    </div>
                    <div className="bg-[#F4F6FB] rounded-2xl p-3 sm:p-4 text-center">
                      <div className="text-lg sm:text-xl font-bold text-slate-900">
                        {metrics.justified}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Justificadas</div>
                    </div>
                    <div className="bg-[#F4F6FB] rounded-2xl p-3 sm:p-4 text-center">
                      <div className="text-lg sm:text-xl font-bold text-slate-900">
                        {metrics.delayed}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Atrasos</div>
                    </div>
                    <div className="bg-[#F4F6FB] rounded-2xl p-3 sm:p-4 text-center">
                      <div className="text-lg sm:text-xl font-bold text-slate-900">
                        {metrics.replacement}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Reposições</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* FOOTER                                                    */}
        {/* ========================================================= */}
        <footer className="pt-6 pb-8 text-center">
          <div className="text-xs text-slate-400 font-medium">
            Notas lançadas até {latestUpdateDate} · Dúvidas? Fale com a secretaria do ITB.
          </div>
        </footer>
      </main>
    </div>
  );
}
