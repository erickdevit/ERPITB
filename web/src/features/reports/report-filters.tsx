import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DateField, SelectField } from '../../components';
import { formatDate, parseBrazilDate } from '../../lib/date';
import type { LocalRecord, Role } from '../../types';
import { canManage } from '../../types';
import type { ReportFilters, ReportType } from './model';
import { reportTypeOptions } from './model';

const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

export function ReportFiltersBar({
  filters,
  onChange,
  courses,
  classes,
  students,
  enrollments,
  classTeachers,
  teachers,
  role,
  onReset,
}: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  courses?: LocalRecord[];
  classes?: LocalRecord[];
  students?: LocalRecord[];
  enrollments?: LocalRecord[];
  classTeachers?: LocalRecord[];
  teachers?: LocalRecord[];
  role: Role;
  onReset: () => void;
}) {
  const safeClassTeachers = classTeachers ?? [];
  const safeClasses = classes ?? [];
  const safeCourses = courses ?? [];
  const safeEnrollments = enrollments ?? [];
  const safeStudents = students ?? [];
  const safeTeachers = teachers ?? [];

  const teacherClassIds = filters.teacherId
    ? new Set(
        safeClassTeachers
          .filter((item) => !item.deleted_at && item.user_id === filters.teacherId)
          .map((item) => item.class_id),
      )
    : undefined;
  const teacherClasses = safeClasses.filter((item) => active(item) && (!teacherClassIds || teacherClassIds.has(item.id)));
  const teacherCourseIds = new Set(teacherClasses.map((item) => item.course_id));
  const availableCourses = safeCourses.filter((item) => active(item) && (!teacherClassIds || teacherCourseIds.has(item.id)));
  const availableClasses = teacherClasses.filter((item) => !filters.courseId || item.course_id === filters.courseId);
  const studentIds = new Set(
    safeEnrollments
      .filter((item) => !item.deleted_at && item.status === 'ativa' && item.class_id === filters.classId)
      .map((item) => item.student_id),
  );
  const availableStudents = safeStudents
    .filter((item) => active(item) && studentIds.has(item.id))
    .sort((left, right) => text(left, 'name').localeCompare(text(right, 'name')));

  const showCourse = filters.type === 'course' || filters.type === 'dropoutRisk';
  const showClass = filters.type === 'classDiary' || filters.type === 'student' || filters.type === 'dropoutRisk';

  const changeType = (type: string) =>
    onChange({
      type: type as ReportType,
      from: filters.from,
      to: filters.to,
      teacherId: filters.teacherId,
    });

  const changeDate = (field: 'from' | 'to', value: string) => {
    try {
      const parsed = parseBrazilDate(value);
      if (parsed) onChange({ ...filters, [field]: parsed });
    } catch {
      // DateField mantém visualmente o último valor válido
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 items-end">
        <div className="lg:col-span-2">
          <SelectField
            label="Tipo de relatório"
            value={filters.type}
            onChange={changeType}
            options={reportTypeOptions}
          />
        </div>

        {canManage(role) && (
          <div>
            <SelectField
              label="Professor"
              value={filters.teacherId ?? ''}
              onChange={(teacherId) =>
                onChange({
                  ...filters,
                  teacherId: teacherId || undefined,
                  courseId: undefined,
                  classId: undefined,
                  studentId: undefined,
                })
              }
              options={[
                { value: '', label: 'Todos os professores' },
                ...safeTeachers.map((item) => ({
                  value: item.id,
                  label: text(item, 'name') || `Professor ${item.id.slice(0, 8)}`,
                })),
              ]}
            />
          </div>
        )}

        {showCourse && (
          <div>
            <SelectField
              label="Curso"
              value={filters.courseId ?? ''}
              onChange={(courseId) =>
                onChange({
                  ...filters,
                  courseId: courseId || undefined,
                  classId: undefined,
                  studentId: undefined,
                })
              }
              options={[
                { value: '', label: 'Selecione um curso' },
                ...availableCourses.map((c) => ({
                  value: c.id,
                  label: `${text(c, 'name')} (${text(c, 'code') || '—'})`,
                })),
              ]}
            />
          </div>
        )}

        {showClass && (
          <div>
            <SelectField
              label="Turma"
              value={filters.classId ?? ''}
              onChange={(classId) =>
                onChange({
                  ...filters,
                  classId: classId || undefined,
                  studentId: undefined,
                })
              }
              options={[
                { value: '', label: 'Selecione uma turma' },
                ...availableClasses.map((c) => ({ value: c.id, label: text(c, 'name') })),
              ]}
            />
          </div>
        )}

        {filters.type === 'student' && filters.classId && (
          <div>
            <SelectField
              label="Aluno"
              value={filters.studentId ?? ''}
              onChange={(studentId) => onChange({ ...filters, studentId: studentId || undefined })}
              options={[
                { value: '', label: 'Selecione um aluno' },
                ...availableStudents.map((s) => ({
                  value: s.id,
                  label: `${text(s, 'name')} (${text(s, 'registration_number') || '—'})`,
                })),
              ]}
            />
          </div>
        )}

        <div>
          <DateField
            label="Data inicial"
            value={formatDate(filters.from)}
            onChange={(val) => changeDate('from', val)}
            allowFuture
          />
        </div>

        <div>
          <DateField
            label="Data final"
            value={formatDate(filters.to)}
            onChange={(val) => changeDate('to', val)}
            allowFuture
          />
        </div>

        <div>
          <button
            type="button"
            onClick={onReset}
            className="w-full h-[38px] px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Redefinir filtros</span>
          </button>
        </div>
      </div>
    </div>
  );
}
