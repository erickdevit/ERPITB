import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FlaskConical,
  GraduationCap,
  Users,
  BookOpen,
  UserCheck,
  TrendingUp,
  AlertCircle,
  FileText,
  Printer,
  X,
  CheckCircle2,
  XCircle,
  MessageSquare,
  CalendarDays,
  RotateCcw,
  Search,
  FileSpreadsheet,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildUnifiedBoletimData } from '../lib/boletim';
import { StudentReportCardView } from './reports/student-report-card-view';
import { StudentBoletimSpreadsheetView } from './reports/student-boletim-spreadsheet-view';
import {
  CartesianGrid,
  Cell,
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
import { Section } from '../components';
import { buildAnalytics } from '../lib/analytics';
import { formatDate } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import { cleanClassName, extractClassNumber, formatClassDisplayName, shiftLabel } from './classes-model';

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');

const statusColors = {
  P: '#10B981',
  F: '#F43F5E',
  J: '#0284C7',
  A: '#F59E0B',
  R: '#8B5CF6',
};

function AnalyticsCard({
  attendance,
  classes,
  students,
  enrollments,
  classTeachers,
  filter,
}: {
  attendance: LocalRecord[];
  classes: LocalRecord[];
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classTeachers: LocalRecord[];
  filter?: { classId?: string; studentId?: string };
}) {
  const filteredAttendance = useMemo(() => {
    return (attendance ?? []).filter((item) => {
      if (item.deleted_at) return false;
      if (filter?.classId && item.class_id !== filter.classId) return false;
      if (filter?.studentId && item.student_id !== filter.studentId) return false;
      return true;
    });
  }, [attendance, filter]);

  const analytics = useMemo(() => {
    return buildAnalytics(
      {
        attendance: filteredAttendance,
        classes,
        students,
        enrollments,
        classTeachers,
      },
      {
        from: '2000-01-01',
        to: '2100-12-31',
        classId: filter?.classId,
        studentId: filter?.studentId,
      },
    );
  }, [filteredAttendance, classes, students, enrollments, classTeachers, filter]);

  const distribution = [
    { key: 'P', name: 'Presenças', value: analytics.present },
    { key: 'F', name: 'Faltas', value: analytics.absent },
    { key: 'J', name: 'Justificadas', value: analytics.justified },
    { key: 'A', name: 'Atrasos', value: analytics.delayed },
    { key: 'R', name: 'Reposições', value: analytics.replacements },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-left">
      <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Evolução da Frequência</h3>
        <p className="text-xs text-slate-500 mb-4">Taxa de presença ao longo do tempo</p>
        <div className="w-full h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.evolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
              <Tooltip labelFormatter={(val) => formatDate(String(val))} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Line type="monotone" dataKey="rate" name="Frequência" stroke="#2563EB" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Distribuição das Marcações</h3>
        <p className="text-xs text-slate-500 mb-4">Total de registros por situação</p>
        <div className="w-full h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {distribution.map((entry) => (
                  <Cell key={entry.key} fill={statusColors[entry.key as keyof typeof statusColors]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


export function StudentAttendanceHistoryCard({
  attendance,
  classes,
  studentId,
  loading = false,
}: {
  attendance: LocalRecord[];
  classes: LocalRecord[];
  studentId?: string;
  loading?: boolean;
}) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(15);

  const studentRecords = useMemo(() => {
    if (!studentId) return [];
    return (attendance ?? [])
      .filter((r) => !r.deleted_at && r.student_id === studentId)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [attendance, studentId]);

  const classMap = useMemo(() => {
    return new Map((classes ?? []).map((c) => [c.id, c]));
  }, [classes]);

  const totals = useMemo(() => {
    const present = studentRecords.filter((r) => r.status === 'P' || r.status === 'RC').length;
    const absent = studentRecords.filter((r) => r.status === 'F').length;
    const justified = studentRecords.filter((r) => r.status === 'J').length;
    const delayed = studentRecords.filter((r) => r.status === 'A').length;
    const replacements = studentRecords.filter((r) => r.status === 'R' || r.status === 'RC').length;
    const total = studentRecords.length;
    const rate = total > 0 ? (present / total) * 100 : 0;
    return { present, absent, justified, delayed, replacements, total, rate };
  }, [studentRecords]);

  const filteredRecords = useMemo(() => {
    let list = studentRecords;
    if (filterStatus === 'P') list = list.filter((r) => r.status === 'P' || r.status === 'RC');
    else if (filterStatus === 'F') list = list.filter((r) => r.status === 'F');
    else if (filterStatus === 'J') list = list.filter((r) => r.status === 'J');
    else if (filterStatus === 'A') list = list.filter((r) => r.status === 'A');
    else if (filterStatus === 'R') list = list.filter((r) => r.status === 'R' || r.status === 'RC');

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((r) => {
        const cls = classMap.get(String(r.class_id));
        const className = String(cls?.name || '').toLowerCase();
        const dateStr = formatDate(String(r.date || '')).toLowerCase();
        const notes = String(r.notes || '').toLowerCase();
        return className.includes(q) || dateStr.includes(q) || notes.includes(q);
      });
    }
    return list;
  }, [studentRecords, filterStatus, searchTerm, classMap]);

  const displayedRecords = filteredRecords.slice(0, visibleCount);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'P':
      case 'RC':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{status === 'RC' ? 'Reposição Concluída' : 'Presente'}</span>
          </span>
        );
      case 'F':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Falta</span>
          </span>
        );
      case 'J':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <FileText className="w-3.5 h-3.5 text-sky-600" />
            <span>Justificada</span>
          </span>
        );
      case 'A':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Atraso</span>
          </span>
        );
      case 'R':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
            <span>Reposição Pendente</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
            {status || '—'}
          </span>
        );
    }
  };

  const getDayOfWeek = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return '';
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
      {/* Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-700" />
            <span>Detalhamento de Frequência do Aluno ({totals.total} aulas)</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Listagem completa de presenças, faltas, atrasos e justificativas
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Taxa Geral
            </div>
            <div className="text-base font-black text-slate-900">
              {totals.total > 0 ? `${totals.rate.toFixed(1).replace('.', ',')}%` : '—'}
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
              totals.total === 0
                ? 'bg-slate-50 text-slate-600 border-slate-200'
                : totals.rate >= 75
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {totals.total === 0
              ? 'Sem Aulas'
              : totals.rate >= 75
              ? 'Frequência Regular'
              : 'Risco de Reprovação (<75%)'}
          </span>
        </div>
      </div>

      {/* Quick Status KPI Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Total Aulas</div>
          <div className="text-base font-extrabold mt-0.5">{totals.total}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('P')}
          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'P'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-emerald-50/60 hover:bg-emerald-100/60 text-emerald-800 border-emerald-200'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Presenças</div>
          <div className="text-base font-extrabold mt-0.5">{totals.present}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('F')}
          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'F'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-rose-50/60 hover:bg-rose-100/60 text-rose-800 border-rose-200'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Faltas</div>
          <div className="text-base font-extrabold mt-0.5">{totals.absent}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('J')}
          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'J'
              ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
              : 'bg-sky-50/60 hover:bg-sky-100/60 text-sky-800 border-sky-200'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Justificadas</div>
          <div className="text-base font-extrabold mt-0.5">{totals.justified}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('A')}
          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'A'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-amber-50/60 hover:bg-amber-100/60 text-amber-800 border-amber-200'
          }`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Atrasos</div>
          <div className="text-base font-extrabold mt-0.5">{totals.delayed}</div>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por data, turma ou anotação..."
          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 text-xs text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-950 placeholder:text-slate-400"
        />
      </div>

      {/* Attendance Records Table */}
      {studentRecords.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50/60 rounded-xl border border-slate-200/60">
          Nenhuma chamada registrada para este aluno até o momento.
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-xs font-medium bg-slate-50/60 rounded-xl border border-slate-200/60">
          Nenhum registro encontrado para o filtro selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/90">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-4">Data da Aula</th>
                <th className="py-2.5 px-4">Turma</th>
                <th className="py-2.5 px-4">Situação</th>
                <th className="py-2.5 px-4">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {displayedRecords.map((record) => {
                const cls = classMap.get(String(record.class_id));
                const dayName = getDayOfWeek(String(record.date || ''));
                return (
                  <tr key={String(record.id)} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {formatDate(String(record.date || ''))}
                      </div>
                      {dayName && (
                        <div className="text-[10px] text-slate-400 capitalize">{dayName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {cls ? (
                        <Link
                          to={`/turmas/${cls.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                        >
                          {String(cls.name || 'Turma')}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {getStatusBadge(String(record.status || ''))}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {record.notes ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{String(record.notes)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination / Expand control */}
      {filteredRecords.length > 15 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Exibindo <strong>{Math.min(visibleCount, filteredRecords.length)}</strong> de{' '}
            <strong>{filteredRecords.length}</strong> chamadas filtradas
          </span>
          <div className="flex items-center gap-2">
            {visibleCount < filteredRecords.length ? (
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 25)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer text-xs"
              >
                Carregar mais (+25)
              </button>
            ) : null}
            {visibleCount > 15 && (
              <button
                type="button"
                onClick={() => setVisibleCount(15)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-medium cursor-pointer text-xs"
              >
                Recolher
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const courses = useEntity('courses');
  const classes = useEntity('classes');
  const attendance = useEntity('attendance_records');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const classTeachers = useEntity('class_teachers');

  const course = (courses.items ?? []).find((c) => c.id === courseId);
  const ownClasses = useMemo(() => (classes.items ?? []).filter((c) => !c.deleted_at && c.course_id === courseId), [classes.items, courseId]);

  if (!course && !courses.loading) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl">
        Curso não encontrado.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-left">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/cursos')}
          className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            {text(course, 'name')}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Código {text(course, 'code') || 'não informado'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Turmas vinculadas a este curso ({ownClasses.length})</h2>
        <div className="divide-y divide-slate-100">
          {ownClasses.map((cls) => (
            <div key={cls.id} className="py-2.5 flex items-center justify-between">
              <Link to={`/turmas/${cls.id}`} className="font-bold text-xs sm:text-sm text-slate-900 hover:text-blue-600 hover:underline">
                {text(cls, 'name')}
              </Link>
              <span className="text-xs text-slate-500 font-medium">
                {shiftLabel(text(cls, 'shift'))} {text(cls, 'week_day') ? `· ${text(cls, 'week_day')}` : ''}
              </span>
            </div>
          ))}
          {!ownClasses.length && (
            <p className="text-xs text-slate-400 py-3">Nenhuma turma cadastrada para este curso.</p>
          )}
        </div>
      </div>

      <AnalyticsCard
        attendance={attendance.items ?? []}
        classes={classes.items ?? []}
        students={students.items ?? []}
        enrollments={enrollments.items ?? []}
        classTeachers={classTeachers.items ?? []}
      />
    </div>
  );
}

export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const laboratories = useEntity('laboratories');
  const enrollments = useEntity('enrollments');
  const students = useEntity('students');
  const attendance = useEntity('attendance_records');
  const classTeachers = useEntity('class_teachers');
  const gradeTables = useEntity('grade_tables');

  const classRecord = (classes.items ?? []).find((c) => c.id === classId);
  const course = (courses.items ?? []).find((c) => c.id === classRecord?.course_id);
  const lab = (laboratories.items ?? []).find((l) => l.id === classRecord?.laboratory_id);

  const ownEnrollments = useMemo(
    () =>
      (enrollments.items ?? []).filter(
        (e) => !e.deleted_at && e.class_id === classId && (e.status === 'active' || e.status === 'ativa'),
      ),
    [enrollments.items, classId],
  );

  const enrolledStudents = useMemo(() => {
    return (ownEnrollments ?? []).map((enr) => {
      const student = (students.items ?? []).find((s) => s.id === enr.student_id);
      return { ...student, enrollmentId: enr.id };
    });
  }, [ownEnrollments, students.items]);

  const classGradeTables = useMemo(
    () => (gradeTables.items ?? []).filter((t) => !t.deleted_at && t.class_id === classId),
    [gradeTables.items, classId],
  );

  if (!classRecord && !classes.loading) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl">
        Turma não encontrada.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/turmas')}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              {(classRecord?.class_number !== undefined && classRecord?.class_number !== null) || extractClassNumber(text(classRecord, 'name')) ? (
                <span className="px-2 py-0.5 text-xs font-mono font-black rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  #{String(classRecord?.class_number ?? extractClassNumber(text(classRecord, 'name'))).padStart(2, '0')}
                </span>
              ) : null}
              <span>{cleanClassName(text(classRecord, 'name'))}</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {text(course, 'name')} · {shiftLabel(text(classRecord, 'shift'))}{' '}
              {text(classRecord, 'week_day') ? `· ${text(classRecord, 'week_day')}` : ''}
              {lab ? ` · Lab: ${text(lab, 'name')}` : ''}
              {(text(classRecord, 'start_date') || text(classRecord, 'startDate') || text(classRecord, 'end_date') || text(classRecord, 'endDate')) ? (
                ` · Período: ${formatDate(text(classRecord, 'start_date') || text(classRecord, 'startDate')) || '—'} a ${formatDate(text(classRecord, 'end_date') || text(classRecord, 'endDate')) || '—'}`
              ) : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/notas?classId=${classId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-xs sm:text-sm font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <span>Gerenciar notas ({classGradeTables.length})</span>
          </Link>
          <Link
            to="/frequencia"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition-colors"
          >
            <span>Fazer chamada</span>
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Alunos Matriculados ({enrolledStudents.length})</h2>
        <div className="divide-y divide-slate-100">
          {enrolledStudents.map((st) => (
            <div key={st.id} className="py-2.5 flex items-center justify-between">
              <Link to={`/alunos/${st.id}`} className="font-bold text-xs sm:text-sm text-slate-900 hover:text-blue-600 hover:underline">
                {text(st, 'name')}
              </Link>
            </div>
          ))}
          {!enrolledStudents.length && (
            <p className="text-xs text-slate-400 py-3">Nenhum aluno ativo matriculado nesta turma.</p>
          )}
        </div>
      </div>

      <AnalyticsCard
        attendance={attendance.items}
        classes={classes.items}
        students={students.items}
        enrollments={enrollments.items}
        classTeachers={classTeachers.items}
        filter={{ classId }}
      />
    </div>
  );
}

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { branding, api } = useApp();
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const classes = useEntity('classes');
  const attendance = useEntity('attendance_records');
  const classTeachers = useEntity('class_teachers');
  const gradeTables = useEntity('grade_tables');
  const gradeItems = useEntity('grade_items');
  const studentGrades = useEntity('student_grades');
  const courses = useEntity('courses');

  const [studentAttendance, setStudentAttendance] = useState<LocalRecord[] | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [boletimChooserOpen, setBoletimChooserOpen] = useState(false);
  const [boletimViewerOpen, setBoletimViewerOpen] = useState(false);
  const [boletimFormat, setBoletimFormat] = useState<'standard' | 'spreadsheet'>('standard');

  useEffect(() => {
    if (!studentId) return;
    setAttendanceLoading(true);
    api.get<{ items: LocalRecord[] }>(`/v1/attendance?studentId=${encodeURIComponent(studentId)}`)
      .then((res) => {
        if (Array.isArray(res?.items)) {
          setStudentAttendance(res.items);
        }
      })
      .catch((err) => {
        console.warn('Falha ao carregar registros de frequência do aluno:', err);
      })
      .finally(() => {
        setAttendanceLoading(false);
      });
  }, [api, studentId]);

  const effectiveAttendance = useMemo(() => {
    if (studentAttendance !== null) {
      return studentAttendance;
    }
    return (attendance.items ?? []).filter((a) => !a.deleted_at && a.student_id === studentId);
  }, [studentAttendance, attendance.items, studentId]);

  const student = (students.items ?? []).find((s) => s.id === studentId);
  const ownEnrollments = useMemo(
    () => (enrollments.items ?? []).filter((e) => !e.deleted_at && e.student_id === studentId),
    [enrollments.items, studentId],
  );

  const boletimData = useMemo(() => {
    if (!studentId) return null;
    return buildUnifiedBoletimData({
      studentId,
      students: students.items ?? [],
      enrollments: enrollments.items ?? [],
      classes: classes.items ?? [],
      courses: courses.items ?? [],
      attendanceRecords: effectiveAttendance,
      gradeTables: gradeTables.items ?? [],
      gradeItems: gradeItems.items ?? [],
      studentGrades: studentGrades.items ?? [],
    });
  }, [
    studentId,
    students.items,
    enrollments.items,
    classes.items,
    courses.items,
    effectiveAttendance,
    gradeTables.items,
    gradeItems.items,
    studentGrades.items,
  ]);

  const studentGradeRows = useMemo(() => {
    const grades = (studentGrades.items ?? []).filter((g) => !g.deleted_at && g.student_id === studentId);
    const itemMap = new Map((gradeItems.items ?? []).filter((i) => !i.deleted_at).map((i) => [i.id, i]));
    const tableMap = new Map((gradeTables.items ?? []).filter((t) => !t.deleted_at).map((t) => [t.id, t]));
    return grades
      .map((g) => {
        const item = itemMap.get(String(g.grade_item_id));
        const table = tableMap.get(String(g.grade_table_id));
        if (!item || !table) return null;
        return {
          id: g.id,
          tableName: text(table, 'name'),
          itemName: text(item, 'name'),
          category: text(item, 'category'),
          score: g.score !== null && g.score !== undefined ? Number(g.score) : null,
          maxScore: Number(item.max_score ?? 10),
          remarks: text(g, 'remarks'),
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
  }, [studentGrades.items, gradeItems.items, gradeTables.items, studentId]);

  if (!student && !students.loading) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-2xl">
        Aluno não encontrado.
      </div>
    );
  }

  const regNumber = text(student, 'registration_number');

  return (
    <>
      <div className="flex flex-col gap-5 text-left print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/alunos')}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {text(student, 'name')}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Matrícula {regNumber || 'não informada'} · Contato:{' '}
                {text(student, 'contact') || 'não informado'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBoletimChooserOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Emitir Boletim</span>
            </button>

            <button
              type="button"
              onClick={() => setBoletimChooserOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              aria-label="Imprimir Boletim"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Imprimir</span>
            </button>

            {regNumber && (
              <Link
                to={`/matricula/${encodeURIComponent(regNumber)}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
              >
                <span>Abrir Boletim Público</span>
              </Link>
            )}
          </div>
        </div>

      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Histórico de Matrículas</h2>
        <div className="divide-y divide-slate-100">
          {(ownEnrollments ?? []).map((enr) => {
            const cls = (classes.items ?? []).find((c) => c.id === enr.class_id);
            const isActive = enr.status === 'active' || enr.status === 'ativa';
            return (
              <div key={enr.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <Link
                    to={`/turmas/${enr.class_id}`}
                    className="font-bold text-xs sm:text-sm text-slate-900 hover:text-blue-600 hover:underline"
                  >
                    {text(cls, 'name') || 'Turma removida'}
                  </Link>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Data: {formatDate(text(enr, 'registration_date') || text(enr, 'created_at').slice(0, 10))}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>
            );
          })}
          {!ownEnrollments?.length && (
            <p className="text-xs text-slate-400 py-3">Nenhuma matrícula registrada.</p>
          )}
        </div>
      </div>

      {/* Resumo de Avaliações e Notas do Aluno */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3">
          Avaliações e Notas Lançadas ({studentGradeRows.length})
        </h2>
        {studentGradeRows.length > 0 ? (
          <div className="divide-y divide-slate-100 text-xs">
            {studentGradeRows.map((row) => (
              <div key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {row.itemName}{' '}
                    <span className="text-slate-400 font-normal">({row.tableName})</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tipo: {row.category}
                    {row.remarks ? ` · Obs.: ${row.remarks}` : ''}
                  </div>
                </div>
                <div className="font-bold text-slate-900">
                  {row.score !== null ? `${row.score.toLocaleString('pt-BR')} / ${row.maxScore}` : 'Pendente'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-2">Nenhuma nota lançada para este aluno até o momento.</p>
        )}
      </div>

      {/* Detalhamento de Frequência do Aluno com Listagem de Presenças e Faltas */}
      <StudentAttendanceHistoryCard
        attendance={effectiveAttendance}
        classes={classes.items ?? []}
        studentId={studentId}
        loading={attendanceLoading}
      />

      <AnalyticsCard
        attendance={effectiveAttendance}
        classes={classes.items ?? []}
        students={students.items ?? []}
        enrollments={enrollments.items ?? []}
        classTeachers={classTeachers.items ?? []}
        filter={{ studentId }}
      />
    </div>

    {/* Print-only View (Matches Selected Format) */}
    {!boletimViewerOpen && boletimData && (
      <div className="hidden print:block print:w-full">
        {boletimFormat === 'spreadsheet' ? (
          <StudentBoletimSpreadsheetView
            data={boletimData}
            logoUrl={branding?.loginLogoUrl}
            watermarkLogoUrl={branding?.printWatermarkLogoUrl}
            watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
          />
        ) : (
          <StudentReportCardView
            data={boletimData}
            logoUrl={branding?.loginLogoUrl}
            watermarkLogoUrl={branding?.printWatermarkLogoUrl}
            watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
          />
        )}
      </div>
    )}

    {/* Modal de Escolha do Tipo de Boletim (Padrão Oficial vs Versão Planilha) */}
    {boletimChooserOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
          onClick={() => setBoletimChooserOpen(false)}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Escolher tipo de boletim"
          className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-5 sm:p-6 z-10 transition-all text-left"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-100 font-bold">
                <Printer className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Emissão de Boletim Individual
                </h2>
                <p className="text-xs text-slate-500">
                  Selecione o formato de documento desejado para {text(student, 'name') || 'o aluno'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBoletimChooserOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Format Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
            {/* Option 1: Padrão Oficial */}
            <button
              type="button"
              onClick={() => setBoletimFormat('standard')}
              className={`text-left rounded-xl p-4 border-2 transition-all flex flex-col justify-between cursor-pointer ${
                boletimFormat === 'standard'
                  ? 'border-sky-600 bg-sky-50/50 shadow-xs ring-2 ring-sky-500/20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                    <FileText className="w-4 h-4" />
                  </div>
                  {boletimFormat === 'standard' ? (
                    <CheckCircle2 className="w-5 h-5 text-sky-600" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-300" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Padrão Oficial</h3>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100/80 text-sky-800">
                    Com QR Code de Validação
                  </span>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Layout institucional completo em blocos com notas por disciplina, resumo de frequência e autenticação digital.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-400">
                Recomendado para entrega oficial
              </div>
            </button>

            {/* Option 2: Versão Planilha */}
            <button
              type="button"
              onClick={() => setBoletimFormat('spreadsheet')}
              className={`text-left rounded-xl p-4 border-2 transition-all flex flex-col justify-between cursor-pointer ${
                boletimFormat === 'spreadsheet'
                  ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-500/20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  {boletimFormat === 'spreadsheet' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-300" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Versão Planilha</h3>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100/80 text-emerald-800">
                    Grade Tabular da Turma
                  </span>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Layout tabular semelhante à planilha da turma: todas as avaliações em linhas, pesos, notas máximas e espelho de frequência.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-400">
                Ideal para conferência pedagógica
              </div>
            </button>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setBoletimChooserOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setBoletimChooserOpen(false);
                setBoletimViewerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <span>Visualizar e Imprimir</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de Visualização do Documento (Boletim Escolar) */}
    {boletimViewerOpen && boletimData && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 print:p-0">
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity print:hidden"
          onClick={() => setBoletimViewerOpen(false)}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Boletim Escolar de ${boletimData.student.name}`}
          className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 sm:p-6 z-10 transition-all text-left print:max-w-none print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 print:hidden">
            <div className="flex items-center gap-2">
              {boletimFormat === 'spreadsheet' ? (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              ) : (
                <FileText className="w-4 h-4 text-sky-600" />
              )}
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {boletimFormat === 'spreadsheet'
                  ? 'Boletim Escolar — Formato Planilha (Grade Tabular)'
                  : 'Boletim Escolar Oficial'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoletimFormat(boletimFormat === 'standard' ? 'spreadsheet' : 'standard')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                title="Alternar entre o formato oficial e o formato planilha"
              >
                {boletimFormat === 'standard' ? (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ver Versão Planilha</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-sky-600" />
                    <span>Ver Formato Padrão</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setBoletimViewerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {boletimFormat === 'spreadsheet' ? (
            <StudentBoletimSpreadsheetView
              data={boletimData}
              logoUrl={branding?.loginLogoUrl}
              watermarkLogoUrl={branding?.printWatermarkLogoUrl}
              watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
              onSwitchFormat={(fmt) => setBoletimFormat(fmt)}
            />
          ) : (
            <StudentReportCardView
              data={boletimData}
              logoUrl={branding?.loginLogoUrl}
              watermarkLogoUrl={branding?.printWatermarkLogoUrl}
              watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
              onSwitchFormat={(fmt) => setBoletimFormat(fmt)}
            />
          )}
        </div>
      </div>
    )}
  </>
);
}
