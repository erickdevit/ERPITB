import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Search, User, X } from 'lucide-react';

export interface StudentOption {
  id: string;
  name: string;
  registrationNumber?: string;
  className?: string;
  active?: boolean | number;
}

export interface SearchableStudentSelectProps {
  value: string;
  onChange: (studentId: string, student?: StudentOption) => void;
  students: any[];
  enrollments?: any[];
  classes?: any[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  allowFreeText?: boolean;
  autoFocus?: boolean;
}

export function SearchableStudentSelect({
  value,
  onChange,
  students = [],
  enrollments = [],
  classes = [],
  placeholder = 'Buscar aluno por nome ou matrícula...',
  required = false,
  disabled = false,
  label,
  allowFreeText = false,
  autoFocus = false,
}: SearchableStudentSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Map student options with resolved class names
  const studentOptions: StudentOption[] = useMemo(() => {
    const classMap = new Map<string, string>();
    for (const c of classes) {
      if (c && c.id) {
        classMap.set(c.id, c.name || c.displayName || 'Turma');
      }
    }

    const studentClassMap = new Map<string, string>();
    for (const enr of enrollments) {
      if (
        enr &&
        enr.student_id &&
        !enr.deleted_at &&
        (enr.status === 'active' || enr.status === 'ativa' || !enr.status)
      ) {
        const cName = classMap.get(enr.class_id);
        if (cName) {
          studentClassMap.set(enr.student_id, cName);
        }
      }
    }

    return (students || [])
      .filter((s) => s && !s.deleted_at)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name || ''),
        registrationNumber: String(s.registration_number || s.registrationNumber || ''),
        className: studentClassMap.get(String(s.id)),
        active: s.active !== 0 && s.active !== false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [students, enrollments, classes]);

  // Selected student
  const selectedStudent = useMemo(() => {
    if (!value) return null;
    return studentOptions.find((s) => s.id === value || s.name === value) || null;
  }, [value, studentOptions]);

  // Filtered list
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return studentOptions.slice(0, 50);
    return studentOptions
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.registrationNumber?.toLowerCase().includes(q) ||
          s.className?.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [studentOptions, query]);

  // Handle outside click to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev,
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          const item = filteredOptions[highlightedIndex];
          handleSelect(item);
        } else if (allowFreeText && query.trim()) {
          onChange(query.trim());
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (student: StudentOption) => {
    onChange(student.id, student);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setIsOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-1 w-full text-left relative">
      {label && (
        <label htmlFor={inputId} className="font-semibold text-slate-700 text-xs">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {selectedStudent ? (
        <div
          data-testid="selected-student-card"
          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-sky-200 bg-sky-50/70 text-xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{selectedStudent.name}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                {selectedStudent.registrationNumber && (
                  <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    Matrícula: {selectedStudent.registrationNumber}
                  </span>
                )}
                {selectedStudent.className && (
                  <span className="truncate">Turma: {selectedStudent.className}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 border border-slate-200 bg-white transition-colors cursor-pointer shrink-0"
            title="Alterar aluno"
          >
            <X className="w-3.5 h-3.5" />
            <span>Trocar</span>
          </button>
        </div>
      ) : allowFreeText && value ? (
        <div
          data-testid="selected-custom-card"
          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{value}</p>
              <p className="text-[11px] text-slate-400">Favorecido avulso</p>
            </div>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200 bg-white transition-colors cursor-pointer shrink-0"
            title="Alterar favorecido"
          >
            <X className="w-3.5 h-3.5" />
            <span>Trocar</span>
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            required={required && !value}
            disabled={disabled}
            autoFocus={autoFocus}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
              if (allowFreeText) {
                onChange(e.target.value);
              }
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                if (allowFreeText) onChange('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isOpen && (
            <ul
              ref={listRef}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50 divide-y divide-slate-100 text-xs"
            >
              {allowFreeText && query.trim() && (
                <li
                  role="option"
                  aria-selected={false}
                  onMouseDown={() => {
                    onChange(query.trim());
                    setIsOpen(false);
                  }}
                  className="px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer flex items-center justify-between"
                >
                  <span>Usar texto avulso: "{query.trim()}"</span>
                  <span className="text-[11px] text-slate-400">Favorecido não cadastrado</span>
                </li>
              )}
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-4 text-center text-slate-400 text-xs">
                  Nenhum aluno encontrado{query ? ` para "${query}"` : ''}.
                </li>
              ) : (
                filteredOptions.map((student, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <li
                      key={student.id}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(student);
                      }}
                      className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-sky-50/80 text-sky-900' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{student.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                          {student.registrationNumber && (
                            <span className="font-mono">Matrícula: {student.registrationNumber}</span>
                          )}
                          {student.className && (
                            <span className="truncate">· Turma: {student.className}</span>
                          )}
                        </div>
                      </div>
                      {isHighlighted && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
