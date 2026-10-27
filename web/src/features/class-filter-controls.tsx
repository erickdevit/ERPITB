import React, { useMemo } from 'react';
import { SelectField } from '../components';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import {
  classShifts,
  classWeekDays,
  shiftLabel,
} from './classes-model';

export interface ClassFilterState {
  weekDay: string;
  shift: string;
  laboratoryId: string;
}

export const defaultClassFilterState: ClassFilterState = {
  weekDay: '',
  shift: '',
  laboratoryId: '',
};

export const shiftFilterOptions = [
  { value: '', label: 'Todos os turnos' },
  ...classShifts.map((s) => ({ value: s, label: shiftLabel(s) })),
];

export const weekDayFilterOptions = [
  { value: '', label: 'Todos os dias' },
  ...classWeekDays.map((d) => ({ value: d, label: d })),
];

export function filterClassesByAttributes<T extends Record<string, unknown>>(
  classes: T[],
  filters: { weekDay?: string; shift?: string; laboratoryId?: string },
): T[] {
  return classes.filter((c) => {
    if (filters.weekDay) {
      const day = String(c.week_day || c.weekDay || '').trim();
      if (day.toLowerCase() !== filters.weekDay.trim().toLowerCase()) return false;
    }
    if (filters.shift) {
      const shift = String(c.shift || '').trim();
      if (shift.toLowerCase() !== filters.shift.trim().toLowerCase()) return false;
    }
    if (filters.laboratoryId) {
      const labId = String(c.laboratory_id || c.laboratoryId || '').trim();
      if (labId !== filters.laboratoryId.trim()) return false;
    }
    return true;
  });
}

export interface ClassFilterFieldsProps {
  weekDay: string;
  onWeekDayChange: (val: string) => void;
  shift: string;
  onShiftChange: (val: string) => void;
  laboratoryId: string;
  onLaboratoryIdChange: (val: string) => void;
  laboratories?: LocalRecord[];
  compact?: boolean;
  className?: string;
}

export function ClassFilterFields({
  weekDay,
  onWeekDayChange,
  shift,
  onShiftChange,
  laboratoryId,
  onLaboratoryIdChange,
  laboratories: providedLabs,
  compact = false,
  className = '',
}: ClassFilterFieldsProps) {
  const labEntity = useEntity('laboratories');
  const labs = providedLabs ?? labEntity.items ?? [];

  const labOptions = useMemo(
    () => [
      { value: '', label: 'Todos os labs' },
      ...labs
        .filter((l) => !l.deleted_at && l.active !== 0 && l.active !== false)
        .map((l) => ({ value: String(l.id), label: String(l.name || 'Lab') }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    ],
    [labs],
  );

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <select
          aria-label="Filtrar por dia da semana"
          value={weekDay}
          onChange={(e) => onWeekDayChange(e.target.value)}
          className="px-2.5 py-1.5 min-h-[36px] text-xs font-semibold bg-white border border-slate-200 rounded-lg shadow-2xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 cursor-pointer"
        >
          {weekDayFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por turno"
          value={shift}
          onChange={(e) => onShiftChange(e.target.value)}
          className="px-2.5 py-1.5 min-h-[36px] text-xs font-semibold bg-white border border-slate-200 rounded-lg shadow-2xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 cursor-pointer"
        >
          {shiftFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por laboratório"
          value={laboratoryId}
          onChange={(e) => onLaboratoryIdChange(e.target.value)}
          className="px-2.5 py-1.5 min-h-[36px] text-xs font-semibold bg-white border border-slate-200 rounded-lg shadow-2xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 cursor-pointer max-w-[160px] truncate"
        >
          {labOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <SelectField
          label="Dia da semana"
          value={weekDay}
          onChange={onWeekDayChange}
          options={weekDayFilterOptions}
        />
      </div>

      <div className="w-full">
        <SelectField
          label="Turno"
          value={shift}
          onChange={onShiftChange}
          options={shiftFilterOptions}
        />
      </div>

      <div className="w-full">
        <SelectField
          label="Laboratório"
          value={laboratoryId}
          onChange={onLaboratoryIdChange}
          options={labOptions}
        />
      </div>
    </>
  );
}
