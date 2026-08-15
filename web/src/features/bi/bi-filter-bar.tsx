import React from 'react';
import { RotateCcw } from 'lucide-react';
import { DateField, SelectField } from '../../components';
import { formatDate, parseBrazilDate } from '../../lib/date';
import type { LocalRecord } from '../../types';
import type { BiFilters } from './model';

const text = (record: LocalRecord, field: string) => String(record[field] ?? '');

export function BiFilterBar({
  filters,
  onChange,
  courses,
  classes,
  teachers,
  onReset,
}: {
  filters: BiFilters;
  onChange: (next: BiFilters) => void;
  courses: LocalRecord[];
  classes: LocalRecord[];
  teachers: LocalRecord[];
  onReset: () => void;
}) {
  const availableClasses = classes.filter((item) => !filters.courseId || item.course_id === filters.courseId);
  const updateDate = (field: 'from' | 'to', value: string) => {
    try {
      const parsed = parseBrazilDate(value, { allowFuture: true });
      if (parsed) onChange({ ...filters, [field]: parsed });
    } catch {
      /* DateField keeps the last valid value. */
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
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
              ...courses
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
              ...teachers.map((item) => ({
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
              { value: 'integral', label: 'Integral' },
            ]}
          />
        </div>

        <div className="lg:col-span-2">
          <button
            type="button"
            onClick={onReset}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Redefinir filtros</span>
          </button>
        </div>
      </div>
    </div>
  );
}
