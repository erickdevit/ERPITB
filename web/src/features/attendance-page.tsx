import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Edit3,
  Lock,
  MessageSquare,
  Save,
  Search,
} from 'lucide-react';
import { useApp } from '../app-context';
import { DateField, PageDialog, SelectField } from '../components';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import {
  attendanceCallAccess,
  buildAttendanceDraftRows,
  replacementDraftError,
  saveAttendanceCall,
  toggleAttendanceStatus,
  type AttendanceDraftRow,
  type EditableAttendanceStatus,
} from './attendance-model';

const statusConfig: Record<
  EditableAttendanceStatus,
  { label: string; activeBg: string; activeText: string; hoverBg: string }
> = {
  P: {
    label: 'Presente',
    activeBg: 'bg-emerald-600',
    activeText: 'text-white',
    hoverBg: 'hover:bg-emerald-50 hover:text-emerald-700',
  },
  F: {
    label: 'Falta',
    activeBg: 'bg-rose-600',
    activeText: 'text-white',
    hoverBg: 'hover:bg-rose-50 hover:text-rose-700',
  },
  J: {
    label: 'Justificada',
    activeBg: 'bg-sky-600',
    activeText: 'text-white',
    hoverBg: 'hover:bg-sky-50 hover:text-sky-700',
  },
  A: {
    label: 'Atraso',
    activeBg: 'bg-amber-500',
    activeText: 'text-white',
    hoverBg: 'hover:bg-amber-50 hover:text-amber-700',
  },
  R: {
    label: 'Reposição',
    activeBg: 'bg-purple-600',
    activeText: 'text-white',
    hoverBg: 'hover:bg-purple-50 hover:text-purple-700',
  },
};

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

interface ReplacementDialogState {
  rowIndex: number;
  date: string;
  time: string;
  notes: string;
  error?: string;
}

export function AttendancePage({ today = todayInSaoPaulo() }: { today?: string }) {
  const { store, sync, session } = useApp();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const attendance = useEntity('attendance_records', true);
  const classNotes = useEntity('class_notes', true);
  const replacements = useEntity('replacements', true);

  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(formatDate(today));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AttendanceDraftRow[]>([]);
  const [generalNotes, setGeneralNotes] = useState('');
  const [showGeneralNotes, setShowGeneralNotes] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [replacementDialog, setReplacementDialog] = useState<ReplacementDialogState>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string }>();

  const loading =
    classes.loading ||
    courses.loading ||
    students.loading ||
    enrollments.loading ||
    attendance.loading ||
    classNotes.loading ||
    replacements.loading;

  const canonicalDate = useMemo(() => {
    try {
      return parseBrazilDate(date, { allowFuture: true }) ?? '';
    } catch {
      return '';
    }
  }, [date]);

  useEffect(() => {
    if (!classId && classes.items.length) setClassId(classes.items[0]!.id);
  }, [classId, classes.items]);

  const existingClassNote = classNotes.items.find(
    (item) => !item.deleted_at && item.class_id === classId && item.date === canonicalDate,
  );
  const existingCall = attendance.items.some(
    (item) => !item.deleted_at && item.class_id === classId && item.date === canonicalDate,
  );
  const access = attendanceCallAccess(session.role, canonicalDate, today, existingCall);

  useEffect(() => {
    if (loading || !classId || !canonicalDate) {
      setRows([]);
      setGeneralNotes('');
      return;
    }
    setRows(
      buildAttendanceDraftRows({
        classId,
        date: canonicalDate,
        students: students.items,
        enrollments: enrollments.items,
        attendance: attendance.items,
        replacements: replacements.items,
      }),
    );
    const existingText = text(existingClassNote, 'notes');
    setGeneralNotes(existingText);
    if (existingText.trim()) setShowGeneralNotes(true);
    setExpandedNotes(new Set());
  }, [attendance.items, canonicalDate, classId, enrollments.items, existingClassNote, loading, replacements.items, students.items]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return rows;
    return rows.filter((row) =>
      `${text(row.student, 'name')} ${text(row.student, 'registration_number')}`
        .toLocaleLowerCase('pt-BR')
        .includes(term),
    );
  }, [rows, search]);

  const classOptions = classes.items.map((item) => {
    const course = courses.items.find((candidate) => candidate.id === item.course_id);
    const courseName = text(course, 'name');
    return { value: item.id, label: `${text(item, 'name')}${courseName ? ` • ${courseName}` : ''}` };
  });

  const updateRow = (index: number, update: (row: AttendanceDraftRow) => AttendanceDraftRow) => {
    setRows((current) => current.map((row, currentIndex) => (currentIndex === index ? update(row) : row)));
  };

  const openReplacement = (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    const fallbackDate = addDays(today, 1);
    setReplacementDialog({
      rowIndex,
      date: formatDate(row.replacement?.scheduledDate || fallbackDate),
      time: row.replacement?.scheduledTime || '14:00',
      notes: row.replacement?.notes || '',
    });
  };

  const selectStatus = (rowIndex: number, status: EditableAttendanceStatus) => {
    const row = rows[rowIndex];
    if (!row || !access.editable) return;
    if (status === 'R' && row.status !== 'R') {
      openReplacement(rowIndex);
      return;
    }
    updateRow(rowIndex, (current) => toggleAttendanceStatus(current, status));
  };

  const confirmReplacement = () => {
    if (!replacementDialog) return;
    let scheduledDate = '';
    try {
      scheduledDate = parseBrazilDate(replacementDialog.date, { allowFuture: true }) ?? '';
    } catch (error) {
      setReplacementDialog({
        ...replacementDialog,
        error: error instanceof Error ? error.message : 'Data inválida.',
      });
      return;
    }
    const replacement = { scheduledDate, scheduledTime: replacementDialog.time, notes: replacementDialog.notes };
    const error = replacementDraftError(replacement);
    if (error) {
      setReplacementDialog({ ...replacementDialog, error });
      return;
    }
    updateRow(replacementDialog.rowIndex, (row) => ({ ...row, status: 'R', replacement, statusChanged: true }));
    setExpandedNotes((current) => new Set(current).add(rows[replacementDialog.rowIndex]!.student.id));
    setReplacementDialog(undefined);
  };

  const save = async () => {
    if (!access.editable || !classId || !canonicalDate || saving) return;
    setSaving(true);
    setNotice(undefined);
    try {
      await saveAttendanceCall({
        store,
        classId,
        date: canonicalDate,
        userId: session.id,
        rows,
        generalNotes,
        existingClassNote,
      });
      await Promise.all([attendance.reload(), classNotes.reload(), replacements.reload()]);
      setNotice({
        severity: 'success',
        message: 'Chamada salva neste dispositivo. A sincronização seguirá em segundo plano.',
      });
      void sync();
    } catch (error) {
      setNotice({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível salvar a chamada.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Unified Single-Row Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-end gap-2.5">
          {/* Turma */}
          <div className="flex-1 min-w-[180px]">
            <SelectField label="Turma" value={classId} onChange={setClassId} options={classOptions} />
          </div>

          {/* Data */}
          <div className="w-full md:w-40">
            <DateField label="Data da chamada" value={date} onChange={setDate} required />
          </div>

          {/* Busca aluno */}
          <div className="flex-1 min-w-[180px] flex flex-col gap-1.5 text-left">
            <label htmlFor="search-student" className="text-xs font-semibold text-slate-700">
              Buscar aluno na chamada
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="search-student"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou matrícula"
                className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Action buttons (Obs. da turma toggle + Salvar chamada) */}
          <div className="flex items-center gap-2 pt-1 md:pt-0 self-stretch md:self-auto justify-end">
            <button
              type="button"
              aria-label="Observação da turma"
              aria-expanded={showGeneralNotes}
              onClick={() => setShowGeneralNotes((prev) => !prev)}
              title="Anotação geral da turma nesta chamada"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer h-[38px] ${
                generalNotes.trim() || showGeneralNotes
                  ? 'bg-sky-50 border-sky-200 text-sky-700'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Obs. da turma</span>
              {generalNotes.trim() && <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />}
            </button>

            <button
              type="button"
              disabled={!access.editable || !rows.length || saving}
              onClick={() => void save()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer shrink-0 h-[38px]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Salvando…' : 'Salvar chamada'}</span>
            </button>
          </div>
        </div>

        {/* Expandable General Class Notes Drawer */}
        <div className={`mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-left ${showGeneralNotes ? 'block' : 'hidden'}`}>
          <div className="flex items-center justify-between">
            <label htmlFor="general-notes" className="text-xs font-semibold text-slate-700">
              Observação geral da turma nesta chamada
            </label>
            <span className="text-[11px] text-slate-400 font-medium">{generalNotes.length}/2000</span>
          </div>
          <textarea
            id="general-notes"
            rows={2}
            maxLength={2000}
            disabled={!access.editable}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Anotações sobre a aula ou ocorrências gerais da turma..."
            className="w-full p-2.5 text-xs sm:text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Read-only Alert */}
      {!access.editable && classId && canonicalDate && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-800" role="alert">
          <Lock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <strong>Somente leitura.</strong> {access.message}
          </div>
        </div>
      )}

      {classId && canonicalDate && (
        <>
          {/* Empty States */}
          {!loading && rows.length === 0 && (
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs sm:text-sm text-sky-800 text-left">
              A turma selecionada não possui matrículas ativas.
            </div>
          )}

          {!loading && rows.length > 0 && visibleRows.length === 0 && (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs sm:text-sm text-slate-600 text-left">
              Nenhum aluno corresponde à busca.
            </div>
          )}

          {/* High-Density Student Calling Cards */}
          <div className="flex flex-col gap-2">
            {visibleRows.map((row) => {
              const rowIndex = rows.findIndex((candidate) => candidate.student.id === row.student.id);
              const noteOpen = expandedNotes.has(row.student.id);

              return (
                <div
                  key={row.student.id}
                  className={`bg-white border rounded-xl p-2.5 sm:p-3 shadow-2xs transition-all ${
                    row.status === 'P'
                      ? 'border-l-4 border-l-emerald-500 border-slate-200'
                      : row.status === 'F'
                      ? 'border-l-4 border-l-rose-500 border-slate-200'
                      : row.status === 'J'
                      ? 'border-l-4 border-l-sky-500 border-slate-200'
                      : row.status === 'A'
                      ? 'border-l-4 border-l-amber-500 border-slate-200'
                      : row.status === 'R'
                      ? 'border-l-4 border-l-purple-500 border-slate-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    {/* Student Info */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                        {text(row.student, 'name').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {text(row.student, 'name')}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium truncate">
                          Matrícula {text(row.student, 'registration_number') || 'não informada'}
                        </p>
                      </div>
                    </div>

                    {/* Calling Controls */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                      {/* Segmented Pill Group */}
                      <div className="inline-flex p-0.5 bg-slate-100 rounded-lg gap-0.5 border border-slate-200">
                        {(['P', 'F', 'J', 'A', 'R'] as EditableAttendanceStatus[]).map((statusKey) => {
                          const selected = row.status === statusKey;
                          const cfg = statusConfig[statusKey];
                          return (
                            <button
                              key={statusKey}
                              type="button"
                              disabled={!access.editable}
                              aria-pressed={selected}
                              onClick={() => selectStatus(rowIndex, statusKey)}
                              className={`w-7 h-7 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                                selected
                                  ? `${cfg.activeBg} ${cfg.activeText} shadow-xs scale-105`
                                  : `text-slate-600 ${cfg.hoverBg}`
                              } disabled:opacity-50`}
                            >
                              {statusKey}
                            </button>
                          );
                        })}
                      </div>

                      {/* Replacement Schedule Tag */}
                      {row.status === 'R' && (
                        <button
                          type="button"
                          onClick={access.editable ? () => openReplacement(rowIndex) : undefined}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors cursor-pointer"
                        >
                          <Calendar className="w-3 h-3" />
                          <span>
                            {row.replacement
                              ? `${formatDate(row.replacement.scheduledDate)} às ${row.replacement.scheduledTime}`
                              : 'Definir data/hora'}
                          </span>
                        </button>
                      )}

                      {/* Student Note Toggle Button */}
                      <button
                        type="button"
                        aria-label={`Anotação de ${text(row.student, 'name')}`}
                        onClick={() =>
                          setExpandedNotes((current) => {
                            const next = new Set(current);
                            if (next.has(row.student.id)) next.delete(row.student.id);
                            else next.add(row.student.id);
                            return next;
                          })
                        }
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          row.notes.trim()
                            ? 'bg-sky-50 border-sky-200 text-sky-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Student Note Expandable Box */}
                  {noteOpen && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col gap-1 text-left">
                      <label htmlFor={`note-${row.student.id}`} className="text-xs font-semibold text-slate-700">
                        Anotação do aluno
                      </label>
                      <textarea
                        id={`note-${row.student.id}`}
                        rows={2}
                        maxLength={1000}
                        disabled={!access.editable || !row.status}
                        value={row.notes}
                        onChange={(e) =>
                          updateRow(rowIndex, (current) => ({ ...current, notes: e.target.value }))
                        }
                        placeholder={
                          row.status
                            ? 'Adicione uma observação individual...'
                            : 'Selecione uma situação para registrar uma anotação.'
                        }
                        className="w-full p-2 text-xs sm:text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-400 placeholder:text-slate-400"
                      />
                      <span className="text-[11px] text-slate-400 text-right">
                        {row.status ? `${row.notes.length}/1000` : 'Selecione uma situação para registrar uma anotação.'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Replacement Modal via PageDialog */}
      <PageDialog
        open={Boolean(replacementDialog)}
        title="Agendar reposição"
        onClose={() => setReplacementDialog(undefined)}
        onSave={confirmReplacement}
        saveText="Confirmar reposição"
      >
        {replacementDialog?.error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {replacementDialog.error}
          </div>
        )}

        <DateField
          label="Data da reposição"
          value={replacementDialog?.date ?? ''}
          allowFuture
          required
          onChange={(value) =>
            setReplacementDialog((cur) => (cur ? { ...cur, date: value, error: undefined } : cur))
          }
        />

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="rep-time" className="text-xs font-semibold text-slate-700">
            Horário da reposição
          </label>
          <input
            id="rep-time"
            type="time"
            required
            value={replacementDialog?.time ?? ''}
            onChange={(e) =>
              setReplacementDialog((cur) => (cur ? { ...cur, time: e.target.value, error: undefined } : cur))
            }
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="rep-notes" className="text-xs font-semibold text-slate-700">
            Observação da reposição
          </label>
          <textarea
            id="rep-notes"
            rows={3}
            maxLength={1000}
            value={replacementDialog?.notes ?? ''}
            placeholder="Motivo ou conteúdo a ser reposto"
            onChange={(e) =>
              setReplacementDialog((cur) => (cur ? { ...cur, notes: e.target.value, error: undefined } : cur))
            }
            className="w-full p-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
          />
        </div>
      </PageDialog>

      {/* Save Notice Toast */}
      {notice && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-md p-4 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-3 ${
            notice.severity === 'success'
              ? 'bg-emerald-950 text-emerald-100 border border-emerald-800'
              : 'bg-rose-950 text-rose-100 border border-rose-800'
          }`}
        >
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  );
}
