import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRightLeft,
  BookOpen,
  Calendar,
  Edit3,
  Lock,
  MessageSquare,
  Plus,
  Save,
  Search,
  UserCog,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { useApp } from '../app-context';
import { DateField, PageDialog, SelectField } from '../components';
import { SearchableStudentSelect } from './student-select';
import { ClassFilterFields, filterClassesByAttributes } from './class-filter-controls';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import { cleanClassName, extractClassNumber, formatClassDisplayName } from './classes-model';
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

interface QuickEditStudentState {
  studentId: string;
  name: string;
  registrationNumber: string;
  contact: string;
  error?: string;
}

interface QuickAddStudentState {
  mode: 'existing' | 'new';
  existingStudentId: string;
  name: string;
  registrationNumber: string;
  contact: string;
  error?: string;
}

interface TransferStudentDialogState {
  studentId: string;
  studentName: string;
  targetClassId: string;
  error?: string;
}

export function AttendancePage({ today = todayInSaoPaulo() }: { today?: string }) {
  const { store, api, sync, session } = useApp();
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
  const [quickEditStudent, setQuickEditStudent] = useState<QuickEditStudentState>();
  const [quickAddStudent, setQuickAddStudent] = useState<QuickAddStudentState>();
  const [transferStudentDialog, setTransferStudentDialog] = useState<TransferStudentDialogState>();
  const [confirmActionModal, setConfirmActionModal] = useState<{
    type: 'lock' | 'unlock' | 'archive';
    studentId: string;
    studentName: string;
  }>();
  const [taughtSessionsCount, setTaughtSessionsCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string }>();

  const [filterWeekDay, setFilterWeekDay] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterLabId, setFilterLabId] = useState('');

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

  const filteredClasses = useMemo(() => {
    return filterClassesByAttributes(classes.items ?? [], {
      weekDay: filterWeekDay,
      shift: filterShift,
      laboratoryId: filterLabId,
    });
  }, [classes.items, filterWeekDay, filterShift, filterLabId]);

  const classOptions = useMemo(() => {
    return filteredClasses
      .filter((c) => !c.deleted_at && (c.active !== 0 && c.active !== false || c.id === classId))
      .map((item) => {
        const rawName = text(item, 'name');
        const num = item.class_number !== undefined && item.class_number !== null
          ? Number(item.class_number)
          : extractClassNumber(rawName);
        const clean = cleanClassName(rawName);
        const course = courses.items.find((crs) => crs.id === item.course_id);
        const base = formatClassDisplayName(num, clean);
        return {
          value: item.id,
          classNumber: num,
          label: course ? `${base} — ${course.name}` : base,
        };
      })
      .sort((a, b) => {
        const numA = a.classNumber ?? 999999;
        const numB = b.classNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        return a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [filteredClasses, courses.items, classId]);

  useEffect(() => {
    if (classOptions.length > 0 && !classOptions.some((opt) => opt.value === classId)) {
      setClassId(classOptions[0]!.value);
    }
  }, [classId, classOptions]);

  // Load canonical taught class sessions count from server or distinct attendance dates
  useEffect(() => {
    if (!classId) {
      setTaughtSessionsCount(0);
      return;
    }
    const distinctDates = new Set(
      attendance.items
        .filter((item) => !item.deleted_at && item.class_id === classId && item.date)
        .map((item) => String(item.date)),
    );
    setTaughtSessionsCount(distinctDates.size);

    if (api && typeof api.getClassSessions === 'function') {
      void api
        .getClassSessions(classId)
        .then((res) => {
          const count =
            typeof (res as any)?.totalTaughtSessions === 'number'
              ? (res as any).totalTaughtSessions
              : typeof res?.total === 'number'
              ? res.total
              : 0;
          setTaughtSessionsCount(Math.max(count, distinctDates.size));
        })
        .catch(() => {});
    }
  }, [api, attendance.items, classId]);

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
      setTaughtSessionsCount((prev) => Math.max(prev, 1));
      setNotice({
        severity: 'success',
        message: 'Chamada registrada com sucesso no servidor.',
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

  const handleSaveQuickEditStudent = async () => {
    if (!quickEditStudent) return;
    if (!quickEditStudent.name.trim()) {
      setQuickEditStudent({ ...quickEditStudent, error: 'O nome do aluno é obrigatório.' });
      return;
    }
    try {
      const existing = students.items.find((s) => s.id === quickEditStudent.studentId);
      await store.mutateBatch([
        {
          entity: 'students',
          data: {
            ...(existing ?? {}),
            id: quickEditStudent.studentId,
            name: quickEditStudent.name.trim(),
            registration_number: quickEditStudent.registrationNumber.trim() || undefined,
            contact: quickEditStudent.contact.trim() || undefined,
          },
        },
      ]);
      await students.reload();
      setQuickEditStudent(undefined);
      setNotice({ severity: 'success', message: 'Cadastro do aluno atualizado com sucesso.' });
      void sync();
    } catch (error) {
      setQuickEditStudent({
        ...quickEditStudent,
        error: error instanceof Error ? error.message : 'Não foi possível atualizar o aluno.',
      });
    }
  };

  const handleQuickLockEnrollment = (studentId: string, studentName: string) => {
    if (!classId) return;
    setConfirmActionModal({ type: 'lock', studentId, studentName });
  };

  const handleQuickUnlockEnrollment = (studentId: string, studentName: string) => {
    if (!classId) return;
    setConfirmActionModal({ type: 'unlock', studentId, studentName });
  };

  const handleSafeArchiveStudent = (studentId: string, studentName: string) => {
    setConfirmActionModal({ type: 'archive', studentId, studentName });
  };

  const executeConfirmedStudentAction = async () => {
    if (!confirmActionModal) return;
    const { type, studentId, studentName } = confirmActionModal;
    setConfirmActionModal(undefined);

    if (type === 'lock') {
      if (!classId) return;
      try {
        if (api && typeof api.lockStudentEnrollment === 'function') {
          await api.lockStudentEnrollment(studentId, classId);
        } else {
          const enr = enrollments.items.find(
            (e) => !e.deleted_at && e.class_id === classId && e.student_id === studentId && e.status === 'ativa',
          );
          if (enr) {
            await store.mutateBatch([
              {
                entity: 'enrollments',
                data: { ...enr, status: 'trancada', left_at: canonicalDate || today },
              },
            ]);
          }
        }
        await Promise.all([enrollments.reload(), students.reload()]);
        setNotice({ severity: 'success', message: `Matrícula de ${studentName} trancada com sucesso.` });
        void sync();
      } catch (error) {
        setNotice({
          severity: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível trancar a matrícula.',
        });
      }
      return;
    }

    if (type === 'unlock') {
      if (!classId) return;
      try {
        if (api && typeof api.unlockStudentEnrollment === 'function') {
          await api.unlockStudentEnrollment(studentId, classId);
        } else {
          const enr = enrollments.items.find(
            (e) => !e.deleted_at && e.class_id === classId && e.student_id === studentId && e.status === 'trancada',
          );
          if (enr) {
            await store.mutateBatch([
              {
                entity: 'enrollments',
                data: { ...enr, status: 'ativa', left_at: null },
              },
            ]);
          }
        }
        await Promise.all([enrollments.reload(), students.reload()]);
        setNotice({ severity: 'success', message: `Matrícula de ${studentName} reativada com sucesso.` });
        void sync();
      } catch (error) {
        setNotice({
          severity: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível reativar a matrícula.',
        });
      }
      return;
    }

    try {
      const existing = students.items.find((s) => s.id === studentId);
      const batch: { entity: 'students' | 'enrollments'; data: Record<string, unknown> }[] = [
        {
          entity: 'students',
          data: {
            ...(existing ?? {}),
            id: studentId,
            name: existing?.name ?? studentName,
            active: 0,
          },
        },
      ];
      if (classId) {
        const enr = enrollments.items.find(
          (e) => !e.deleted_at && e.class_id === classId && e.student_id === studentId && e.status === 'ativa',
        );
        if (enr) {
          batch.push({
            entity: 'enrollments',
            data: { ...enr, status: 'trancada', left_at: canonicalDate || today },
          });
        }
      }
      await store.mutateBatch(batch as any);
      await Promise.all([students.reload(), enrollments.reload()]);
      setNotice({
        severity: 'success',
        message: `Cadastro de ${studentName} arquivado com preservação do histórico acadêmico e financeiro.`,
      });
      void sync();
    } catch (error) {
      setNotice({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível arquivar o cadastro do aluno.',
      });
    }
  };

  const handleOpenTransferDialog = (studentId: string, studentName: string) => {
    if (!classId) return;
    const defaultTarget = otherClasses[0]?.value ?? '';
    setTransferStudentDialog({
      studentId,
      studentName,
      targetClassId: defaultTarget,
    });
  };

  const executeTransferStudent = async () => {
    if (!transferStudentDialog || !classId) return;
    const { studentId, studentName, targetClassId } = transferStudentDialog;

    if (!targetClassId || targetClassId === classId) {
      setTransferStudentDialog((cur) =>
        cur ? { ...cur, error: 'Selecione uma turma de destino diferente da atual.' } : cur,
      );
      return;
    }

    const targetClassName =
      classes.items.find((c) => c.id === targetClassId)?.name ?? 'nova turma';

    try {
      if (api && typeof api.transferStudentEnrollment === 'function') {
        await api.transferStudentEnrollment(studentId, classId, targetClassId);
      } else if (store && typeof store.moveStudent === 'function') {
        await store.moveStudent(studentId, targetClassId);
      } else {
        const enrs = enrollments.items.filter((e) => !e.deleted_at && e.student_id === studentId);
        const originEnr = enrs.find((e) => e.class_id === classId);
        const targetEnr = enrs.find((e) => e.class_id === targetClassId);
        const mutations = [];
        if (originEnr) {
          mutations.push({
            entity: 'enrollments',
            data: { ...originEnr, status: 'concluida', left_at: canonicalDate || today },
            action: 'upsert' as const,
          });
        }
        mutations.push({
          entity: 'enrollments',
          data: {
            id: targetEnr?.id ?? crypto.randomUUID(),
            class_id: targetClassId,
            student_id: studentId,
            status: 'ativa',
            created_at: targetEnr?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          action: 'upsert' as const,
        });
        await store.mutateBatch(mutations as any);
      }

      setTransferStudentDialog(undefined);
      await Promise.all([enrollments.reload(), students.reload()]);
      setNotice({
        severity: 'success',
        message: `Aluno ${studentName} transferido com sucesso para a turma ${targetClassName}.`,
      });
      void sync();
    } catch (error) {
      setTransferStudentDialog((cur) =>
        cur
          ? {
              ...cur,
              error: error instanceof Error ? error.message : 'Não foi possível transferir o aluno de turma.',
            }
          : cur,
      );
    }
  };

  const handleConfirmQuickAddStudent = async () => {
    if (!quickAddStudent || !classId) return;
    try {
      let targetStudentId = quickAddStudent.existingStudentId;
      if (quickAddStudent.mode === 'new') {
        if (!quickAddStudent.name.trim()) {
          setQuickAddStudent({ ...quickAddStudent, error: 'Informe o nome completo do aluno.' });
          return;
        }
        targetStudentId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `std-${Date.now()}`;
        const regNum =
          quickAddStudent.registrationNumber.trim() ||
          `ITB-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        await store.mutateBatch([
          {
            entity: 'students',
            data: {
              id: targetStudentId,
              name: quickAddStudent.name.trim(),
              registration_number: regNum,
              contact: quickAddStudent.contact.trim() || null,
              active: 1,
            },
          },
        ]);
      } else if (!targetStudentId) {
        setQuickAddStudent({ ...quickAddStudent, error: 'Selecione um aluno para matricular.' });
        return;
      }

      const enrollmentId = `${classId}:${targetStudentId}`;
      await store.mutateBatch([
        {
          entity: 'enrollments',
          data: {
            id: enrollmentId,
            class_id: classId,
            student_id: targetStudentId,
            status: 'ativa',
            enrolled_at: canonicalDate || today,
          },
        },
      ]);
      await Promise.all([students.reload(), enrollments.reload()]);
      setQuickAddStudent(undefined);
      setNotice({ severity: 'success', message: 'Aluno incluído na turma com sucesso.' });
      void sync();
    } catch (error) {
      setQuickAddStudent({
        ...quickAddStudent,
        error: error instanceof Error ? error.message : 'Não foi possível incluir o aluno na turma.',
      });
    }
  };

  const unenrolledStudents = useMemo(() => {
    const enrolledIds = new Set(
      enrollments.items
        .filter((e) => !e.deleted_at && e.class_id === classId && e.status === 'ativa')
        .map((e) => String(e.student_id)),
    );
    return students.items.filter(
      (s) => !s.deleted_at && s.active !== 0 && s.active !== false && !enrolledIds.has(s.id),
    );
  }, [classId, enrollments.items, students.items]);

  const otherClasses = useMemo(() => {
    return classes.items
      .filter((c) => !c.deleted_at && c.id !== classId)
      .map((c) => {
        const rawName = text(c, 'name');
        const num = c.class_number !== undefined && c.class_number !== null
          ? Number(c.class_number)
          : extractClassNumber(rawName);
        const clean = cleanClassName(rawName);
        const course = courses.items.find((crs) => crs.id === c.course_id);
        const base = formatClassDisplayName(num, clean);
        return {
          value: String(c.id),
          classNumber: num,
          label: course ? `${base} — ${course.name}` : base,
        };
      })
      .sort((a, b) => {
        const numA = a.classNumber ?? 999999;
        const numB = b.classNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        return a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [classes.items, courses.items, classId]);

  return (
    <div className="flex flex-col gap-3">
      {/* Unified Single-Row Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs space-y-2.5">
        {/* Class Filters: Dia da semana, Turno, Lab */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pb-2.5 border-b border-slate-100">
          <ClassFilterFields
            weekDay={filterWeekDay}
            onWeekDayChange={setFilterWeekDay}
            shift={filterShift}
            onShiftChange={setFilterShift}
            laboratoryId={filterLabId}
            onLaboratoryIdChange={setFilterLabId}
          />
        </div>

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

          {/* Action buttons (Aulas ministradas badge + Obs. da turma toggle + Salvar chamada) */}
          <div className="flex items-center gap-2 pt-1 md:pt-0 self-stretch md:self-auto justify-end flex-wrap">
            {classId && (
              <span
                title="Total de aulas ministradas (sessões registradas) nesta turma"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 h-[38px]"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>{taughtSessionsCount} aula(s)</span>
              </span>
            )}
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
                  className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-2.5 sm:p-3 shadow-2xs transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    {/* Student Info */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 border border-slate-200">
                        {text(row.student, 'name').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {text(row.student, 'name')}
                          </p>
                          {row.enrollmentStatus === 'trancada' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              Trancada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Calling Controls */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                      {/* Segmented Pill Group */}
                      <div className="inline-flex p-0.5 bg-slate-100 rounded-lg gap-0.5 border border-slate-200">
                        {(['P', 'F', 'J', 'A', 'R'] as EditableAttendanceStatus[]).map((statusKey) => {
                          const selected = row.status === statusKey;
                          const cfg = statusConfig[statusKey];
                          const isLocked = row.enrollmentStatus === 'trancada';
                          return (
                            <button
                              key={statusKey}
                              type="button"
                              disabled={!access.editable || isLocked}
                              title={
                                isLocked
                                  ? 'Matrícula trancada nesta turma. Reative a matrícula para lançar frequência.'
                                  : undefined
                              }
                              aria-pressed={selected}
                              onClick={() => selectStatus(rowIndex, statusKey)}
                              className={`w-11 h-11 lg:w-9 lg:h-9 min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] rounded-md text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center ${
                                selected
                                  ? `${cfg.activeBg} ${cfg.activeText} shadow-xs scale-105`
                                  : `text-slate-600 ${cfg.hoverBg}`
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
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
                        className={`p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                          row.notes.trim()
                            ? 'bg-sky-50 border-sky-200 text-sky-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Edit3 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                      </button>

                      {/* Quick Edit Student Button */}
                      <button
                        type="button"
                        aria-label={`Editar cadastro de ${text(row.student, 'name')}`}
                        title="Editar dados do aluno rapidamente"
                        onClick={() =>
                          setQuickEditStudent({
                            studentId: row.student.id,
                            name: text(row.student, 'name'),
                            registrationNumber: text(row.student, 'registration_number'),
                            contact: text(row.student, 'contact'),
                          })
                        }
                        className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <UserCog className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                      </button>

                      {/* Quick Lock / Unlock Enrollment Button */}
                      {row.enrollmentStatus === 'trancada' ? (
                        <button
                          type="button"
                          aria-label={`Reativar matrícula de ${text(row.student, 'name')}`}
                          title="Reativar / Destrancar matrícula nesta turma"
                          onClick={() => handleQuickUnlockEnrollment(row.student.id, text(row.student, 'name'))}
                          className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 transition-colors cursor-pointer shadow-2xs"
                        >
                          <UserCheck className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Trancar matrícula de ${text(row.student, 'name')}`}
                          title="Trancar matrícula nesta turma"
                          onClick={() => handleQuickLockEnrollment(row.student.id, text(row.student, 'name'))}
                          className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 transition-colors cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                        </button>
                      )}

                      {/* Transfer Student to Another Class */}
                      <button
                        type="button"
                        aria-label={`Transferir ${text(row.student, 'name')} de turma`}
                        title="Mudar aluno de turma"
                        onClick={() => handleOpenTransferDialog(row.student.id, text(row.student, 'name'))}
                        className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-sky-700 hover:bg-sky-50 hover:border-sky-200 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                      </button>

                      {/* Safe Archive Student Button (no physical DELETE; preserves academic & financial history) */}
                      <button
                        type="button"
                        aria-label={`Arquivar cadastro de ${text(row.student, 'name')}`}
                        title="Excluir ou arquivar aluno com preservação de histórico acadêmico e financeiro"
                        onClick={() => handleSafeArchiveStudent(row.student.id, text(row.student, 'name'))}
                        className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[34px] lg:min-h-[34px] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition-colors cursor-pointer"
                      >
                        <Archive className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
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

          {/* Quick Add/Enroll Student '+' Pill Button Aligned Left with Student Names */}
          <div className="flex justify-start pt-1 pl-2.5 sm:pl-3">
            <button
              type="button"
              aria-label="Incluir aluno na turma"
              title="Incluir aluno na turma"
              onClick={() =>
                setQuickAddStudent({
                  mode: 'new',
                  existingStudentId: '',
                  name: '',
                  registrationNumber: '',
                  contact: '',
                })
              }
              className="inline-flex items-center justify-center h-9 px-4 rounded-full border border-slate-300 bg-white hover:bg-slate-950 hover:text-white hover:border-slate-950 text-slate-700 font-bold text-sm transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </>
      )}

      {/* Confirm Lock / Unlock / Archive Student Modal (Replaces Browser window.confirm) */}
      <PageDialog
        open={Boolean(confirmActionModal)}
        title={
          confirmActionModal?.type === 'lock'
            ? 'Trancar matrícula do aluno'
            : confirmActionModal?.type === 'unlock'
            ? 'Reativar matrícula do aluno'
            : 'Excluir / Arquivar aluno da turma'
        }
        onClose={() => setConfirmActionModal(undefined)}
        onSave={() => void executeConfirmedStudentAction()}
        saveText={
          confirmActionModal?.type === 'lock'
            ? 'Confirmar trancamento'
            : confirmActionModal?.type === 'unlock'
            ? 'Confirmar reativação'
            : 'Confirmar exclusão'
        }
      >
        {confirmActionModal?.type === 'lock' ? (
          <div className="space-y-3 text-left text-xs sm:text-sm text-slate-700">
            <p>
              Deseja trancar a matrícula de{' '}
              <strong className="text-slate-900">{confirmActionModal.studentName}</strong> nesta turma?
            </p>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              O histórico de presenças, notas e registros financeiros será integralmente preservado, e o aluno não
              aparecerá nas chamadas futuras desta turma.
            </div>
          </div>
        ) : confirmActionModal?.type === 'unlock' ? (
          <div className="space-y-3 text-left text-xs sm:text-sm text-slate-700">
            <p>
              Deseja reativar a matrícula de{' '}
              <strong className="text-slate-900">{confirmActionModal.studentName}</strong> nesta turma?
            </p>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              O aluno voltará a constar como ativo nesta turma e apto para novos lançamentos de frequência e notas.
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-left text-xs sm:text-sm text-slate-700">
            <p>
              Deseja excluir/arquivar o cadastro de{' '}
              <strong className="text-slate-900">{confirmActionModal?.studentName}</strong>?
            </p>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
              Por segurança e conformidade acadêmica/financeira, nenhum registro histórico é destruído fisicamente: a
              matrícula ativa é encerrada e o histórico de chamadas, notas e financeiro permanece preservado.
            </div>
          </div>
        )}
      </PageDialog>

      {/* Transfer Student Dialog */}
      <PageDialog
        open={Boolean(transferStudentDialog)}
        title="Transferir aluno de turma"
        onClose={() => setTransferStudentDialog(undefined)}
        onSave={() => void executeTransferStudent()}
        saveText="Confirmar transferência"
      >
        {transferStudentDialog && (
          <div className="space-y-4 text-left text-xs sm:text-sm text-slate-700">
            <p>
              Transferir o aluno <strong className="text-slate-900">{transferStudentDialog.studentName}</strong> da turma atual{' '}
              <span className="font-semibold text-slate-900">
                ({String(classes.items.find((c) => c.id === classId)?.name ?? 'Turma atual')})
              </span>{' '}
              para uma nova turma:
            </p>

            {transferStudentDialog.error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {transferStudentDialog.error}
              </div>
            )}

            {otherClasses.length > 0 ? (
              <SelectField
                label="Nova Turma de Destino"
                value={transferStudentDialog.targetClassId}
                required
                onChange={(val) =>
                  setTransferStudentDialog((cur) => (cur ? { ...cur, targetClassId: val, error: undefined } : cur))
                }
                options={otherClasses}
              />
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs">
                Nenhuma outra turma ativa encontrada para transferência.
              </div>
            )}

            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Preservação integral do histórico acadêmico:</p>
              <p>
                O histórico de presenças, faltas e notas obtidas nesta turma atual permanecerá 100% preservado. O aluno
                passará a constar como ativo na nova turma selecionada para as próximas chamadas.
              </p>
            </div>
          </div>
        )}
      </PageDialog>

      {/* Quick Edit Student Dialog */}
      <PageDialog
        open={Boolean(quickEditStudent)}
        title="Editar dados do aluno"
        onClose={() => setQuickEditStudent(undefined)}
        onSave={() => void handleSaveQuickEditStudent()}
        saveText="Salvar alterações"
      >
        {quickEditStudent?.error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {quickEditStudent.error}
          </div>
        )}
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="quick-edit-name" className="text-xs font-semibold text-slate-700">
            Nome completo <span className="text-rose-500">*</span>
          </label>
          <input
            id="quick-edit-name"
            type="text"
            value={quickEditStudent?.name ?? ''}
            onChange={(e) =>
              setQuickEditStudent((cur) => (cur ? { ...cur, name: e.target.value, error: undefined } : cur))
            }
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="quick-edit-reg" className="text-xs font-semibold text-slate-700">
            Matrícula / RA
          </label>
          <input
            id="quick-edit-reg"
            type="text"
            value={quickEditStudent?.registrationNumber ?? ''}
            onChange={(e) =>
              setQuickEditStudent((cur) =>
                cur ? { ...cur, registrationNumber: e.target.value, error: undefined } : cur,
              )
            }
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="quick-edit-contact" className="text-xs font-semibold text-slate-700">
            Telefone / Contato
          </label>
          <input
            id="quick-edit-contact"
            type="text"
            value={quickEditStudent?.contact ?? ''}
            onChange={(e) =>
              setQuickEditStudent((cur) => (cur ? { ...cur, contact: e.target.value, error: undefined } : cur))
            }
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
          />
        </div>
      </PageDialog>

      {/* Quick Add/Enroll Student Dialog */}
      <PageDialog
        open={Boolean(quickAddStudent)}
        title="Incluir aluno na turma"
        onClose={() => setQuickAddStudent(undefined)}
        onSave={() => void handleConfirmQuickAddStudent()}
        saveText="Confirmar inclusão"
      >
        {quickAddStudent?.error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {quickAddStudent.error}
          </div>
        )}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setQuickAddStudent((cur) => (cur ? { ...cur, mode: 'new', error: undefined } : cur))}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              quickAddStudent?.mode === 'new'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cadastrar novo aluno
          </button>
          <button
            type="button"
            onClick={() =>
              setQuickAddStudent((cur) => (cur ? { ...cur, mode: 'existing', error: undefined } : cur))
            }
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              quickAddStudent?.mode === 'existing'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Aluno já cadastrado
          </button>
        </div>

        {quickAddStudent?.mode === 'new' ? (
          <>
            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="quick-add-name" className="text-xs font-semibold text-slate-700">
                Nome completo <span className="text-rose-500">*</span>
              </label>
              <input
                id="quick-add-name"
                type="text"
                value={quickAddStudent?.name ?? ''}
                onChange={(e) =>
                  setQuickAddStudent((cur) => (cur ? { ...cur, name: e.target.value, error: undefined } : cur))
                }
                placeholder="Nome do aluno"
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="quick-add-reg" className="text-xs font-semibold text-slate-700">
                Matrícula / RA (opcional)
              </label>
              <input
                id="quick-add-reg"
                type="text"
                value={quickAddStudent?.registrationNumber ?? ''}
                onChange={(e) =>
                  setQuickAddStudent((cur) =>
                    cur ? { ...cur, registrationNumber: e.target.value, error: undefined } : cur,
                  )
                }
                placeholder="Gerado automaticamente se vazio"
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="quick-add-contact" className="text-xs font-semibold text-slate-700">
                Telefone / Contato
              </label>
              <input
                id="quick-add-contact"
                type="text"
                value={quickAddStudent?.contact ?? ''}
                onChange={(e) =>
                  setQuickAddStudent((cur) => (cur ? { ...cur, contact: e.target.value, error: undefined } : cur))
                }
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </>
        ) : (
          <SearchableStudentSelect
            label="Selecione o aluno"
            value={quickAddStudent?.existingStudentId ?? ''}
            onChange={(val) =>
              setQuickAddStudent((cur) => (cur ? { ...cur, existingStudentId: val, error: undefined } : cur))
            }
            students={unenrolledStudents}
            enrollments={enrollments.items}
            classes={classes.items}
            disabled={unenrolledStudents.length === 0}
            placeholder={unenrolledStudents.length > 0 ? 'Buscar por nome ou matrícula...' : 'Todos os alunos ativos já estão matriculados'}
          />
        )}
      </PageDialog>

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
