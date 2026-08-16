import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Check,
} from 'lucide-react';
import { useApp } from '../app-context';
import { DateField, PageDialog, Section, SelectField } from '../components';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');

export function ReplacementsPage({
  today = todayInSaoPaulo(),
  history = false,
}: {
  today?: string;
  history?: boolean;
}) {
  const { store, sync, session } = useApp();
  const replacements = useEntity('replacements', true);
  const students = useEntity('students');
  const classes = useEntity('classes');

  const [search, setSearch] = useState('');
  const [completeItem, setCompleteItem] = useState<LocalRecord>();
  const [scheduleDate, setScheduleDate] = useState(formatDate(today));
  const [scheduleTime, setScheduleTime] = useState('14:00');
  const [notes, setNotes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string>();

  const rows = useMemo(() => {
    return replacements.items
      .filter((item) => {
        if (item.deleted_at) return false;
        const isCompleted = Boolean(item.completed_at || item.status === 'completed');
        if (history ? !isCompleted : isCompleted) return false;

        const student = students.items.find((s) => s.id === item.student_id);
        const cls = classes.items.find((c) => c.id === item.class_id);
        const term = search.trim().toLocaleLowerCase('pt-BR');
        if (!term) return true;

        const studentName = text(student, 'name').toLocaleLowerCase('pt-BR');
        const className = text(cls, 'name').toLocaleLowerCase('pt-BR');
        return studentName.includes(term) || className.includes(term);
      })
      .map((item) => {
        const student = students.items.find((s) => s.id === item.student_id);
        const cls = classes.items.find((c) => c.id === item.class_id);
        return {
          ...item,
          studentName: text(student, 'name'),
          registrationNumber: text(student, 'registration_number'),
          className: text(cls, 'name'),
        };
      });
  }, [replacements.items, students.items, classes.items, history, search]);

  const openSchedule = (item: LocalRecord) => {
    setCompleteItem(item);
    setScheduleDate(formatDate(text(item, 'scheduled_date') || today));
    setScheduleTime(text(item, 'scheduled_time') || '14:00');
    setNotes(text(item, 'notes') || '');
    setFormError(undefined);
    setDialogOpen(true);
  };

  const markCompleted = async (item: LocalRecord) => {
    if (!window.confirm(`Deseja concluir a reposição de "${text(item, 'studentName')}"?`)) return;
    try {
      const attendanceId = text(item, 'attendance_record_id');
      const now = new Date().toISOString();

      if (store.mutateBatch) {
        await store.mutateBatch([
          ...(attendanceId
            ? [{ entity: 'attendance_records' as const, data: { id: attendanceId, status: 'RC' } }]
            : []),
          {
            entity: 'replacements' as const,
            data: { id: item.id, completed_at: now, completed_by: session.id },
          },
        ]);
      } else {
        await store.mutate('replacements', {
          id: item.id,
          completed_at: now,
          completed_by: session.id,
        });
      }

      await replacements.reload();
      void sync();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao concluir reposição.');
    }
  };

  const saveSchedule = async () => {
    if (!completeItem) return;
    try {
      const parsedDate = parseBrazilDate(scheduleDate, { allowFuture: true }) ?? '';
      await store.mutate('replacements', {
        id: completeItem.id,
        scheduled_date: parsedDate,
        scheduled_time: scheduleTime,
        notes: notes.trim() || null,
      });
      await replacements.reload();
      setDialogOpen(false);
      void sync();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao agendar.');
    }
  };

  return (
    <div className="flex flex-col gap-3.5 text-left">
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col gap-1.5 max-w-md">
          <label htmlFor="search-replacements" className="text-xs font-medium text-slate-700">
            Buscar reposição
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="search-replacements"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por aluno ou turma..."
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <th className="py-3 px-4">Aluno</th>
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-4">Data e Horário</th>
                <th className="py-3 px-4">Observações</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{row.studentName}</p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Matrícula: {row.registrationNumber || 'não informada'}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-semibold">{row.className}</td>
                  <td className="py-3 px-4 text-slate-500 font-semibold">
                    {formatDate(text(row, 'scheduled_date'))} às {text(row, 'scheduled_time') || '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                    {text(row, 'notes') || 'Sem observações'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {!history && (
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => openSchedule(row)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Agendar
                        </button>
                        <button
                          type="button"
                          onClick={() => void markCompleted(row)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                        >
                          Concluir
                        </button>
                      </div>
                    )}
                    {history && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Concluída
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma reposição {history ? 'no histórico' : 'em aberto'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule Dialog */}
      <PageDialog
        open={dialogOpen}
        title="Reagendar reposição"
        onClose={() => setDialogOpen(false)}
        onSave={saveSchedule}
        saveText="Salvar agendamento"
      >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {formError}
          </div>
        )}

        <DateField
          label="Data da reposição"
          value={scheduleDate}
          allowFuture
          required
          onChange={setScheduleDate}
        />

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="rep-page-time" className="text-xs font-semibold text-slate-700">
            Horário da reposição
          </label>
          <input
            id="rep-page-time"
            type="time"
            required
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="rep-page-notes" className="text-xs font-semibold text-slate-700">
            Observações / Conteúdo a ser reposto
          </label>
          <textarea
            id="rep-page-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes sobre a reposição..."
            className="w-full p-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
          />
        </div>
      </PageDialog>
    </div>
  );
}
