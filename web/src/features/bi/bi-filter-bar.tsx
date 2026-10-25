import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DateField, SelectField } from '../../components';
import { formatDate, parseBrazilDate } from '../../lib/date';
import type { LocalRecord } from '../../types';
import type { BiFilters } from './model';

const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');

export function BiFilterBar({
  filters,
  onChange,
  courses = [],
  classes = [],
  teachers = [],
  onReset,
}: {
  filters: BiFilters;
  onChange: (next: BiFilters) => void;
  courses?: LocalRecord[];
  classes?: LocalRecord[];
  teachers?: LocalRecord[];
  onReset: () => void;
}) {
  const safeCourses = courses ?? [];
  const safeClasses = classes ?? [];
  const safeTeachers = teachers ?? [];
  const availableClasses = safeClasses.filter(
    (item) => !filters.courseId || item.course_id === filters.courseId,
  );

  const updateDate = (field: 'from' | 'to', value: string) => {
    try {
      const parsed = parseBrazilDate(value, { allowFuture: true });
      if (parsed) onChange({ ...filters, [field]: parsed });
    } catch {
      /* DateField keeps the last valid value. */
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs text-left print:hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-2.5 items-end">
        <div>
          <DateField
            label="Data inicial"
            value={formatDate(filters.from)}
            onChange={(value) => updateDate('from', value)}
            allowFuture
          />
        </div>

        <div>
          <DateField
            label="Data final"
            value={formatDate(filters.to)}
            onChange={(value) => updateDate('to', value)}
            allowFuture
          />
        </div>

        <div>
          <SelectField
            label="Curso"
            value={filters.courseId ?? ''}
            onChange={(courseId) =>
              onChange({ ...filters, courseId: courseId || undefined, classId: undefined })
            }
            options={[
              { value: '', label: 'Todos os cursos' },
              ...safeCourses
                .filter((item) => !item.deleted_at)
                .map((item) => ({ value: item.id, label: text(item, 'name') })),
            ]}
          />
        </div>

        <div>
          <SelectField
            label="Turma"
            value={filters.classId ?? ''}
            onChange={(classId) => onChange({ ...filters, classId: classId || undefined })}
            options={[
              { value: '', label: 'Todas as turmas' },
              ...availableClasses
                .filter((item) => !item.deleted_at)
                .map((item) => ({ value: item.id, label: text(item, 'name') })),
            ]}
          />
        </div>

        <div>
          <SelectField
            label="Professor"
            value={filters.teacherId ?? ''}
            onChange={(teacherId) => onChange({ ...filters, teacherId: teacherId || undefined })}
            options={[
              { value: '', label: 'Todos os professores' },
              ...safeTeachers.map((item) => ({
                value: item.id,
                label: text(item, 'name') || `Professor ${item.id.slice(0, 8)}`,
              })),
            ]}
          />
        </div>

        <div>
          <SelectField
            label="Turno"
            value={filters.shift ?? ''}
            onChange={(shift) => onChange({ ...filters, shift: shift || undefined })}
            options={[
              { value: '', label: 'Todos os turnos' },
              { value: 'manha', label: 'Manhã' },
              { value: 'tarde', label: 'Tarde' },
              { value: 'noite', label: 'Noite' },
            ]}
          />
        </div>

        <div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium rounded-lg transition-colors cursor-pointer w-full h-[38px]"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Restaurar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
