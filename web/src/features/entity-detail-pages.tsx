import React, { useMemo } from 'react';
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
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { shiftLabel } from './classes-model';

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
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {text(classRecord, 'name')}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {text(course, 'name')} · {shiftLabel(text(classRecord, 'shift'))}{' '}
              {text(classRecord, 'week_day') ? `· ${text(classRecord, 'week_day')}` : ''}
              {lab ? ` · Lab: ${text(lab, 'name')}` : ''}
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
              <span className="text-xs text-slate-400 font-medium">
                Matrícula {text(st, 'registration_number') || '—'}
              </span>
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
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const classes = useEntity('classes');
  const attendance = useEntity('attendance_records');
  const classTeachers = useEntity('class_teachers');
  const gradeTables = useEntity('grade_tables');
  const gradeItems = useEntity('grade_items');
  const studentGrades = useEntity('student_grades');

  const student = (students.items ?? []).find((s) => s.id === studentId);
  const ownEnrollments = useMemo(
    () => (enrollments.items ?? []).filter((e) => !e.deleted_at && e.student_id === studentId),
    [enrollments.items, studentId],
  );

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
    <div className="flex flex-col gap-5 text-left">
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

        {regNumber && (
          <Link
            to={`/matricula/${encodeURIComponent(regNumber)}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <span>Abrir Boletim Público</span>
          </Link>
        )}
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

      <AnalyticsCard
        attendance={attendance.items ?? []}
        classes={classes.items ?? []}
        students={students.items ?? []}
        enrollments={enrollments.items ?? []}
        classTeachers={classTeachers.items ?? []}
        filter={{ studentId }}
      />
    </div>
  );
}
