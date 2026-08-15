import { latestAttendance } from '../lib/attendance';
import type { LocalMutation } from '../lib/db';
import type { AttendanceStatus, LocalRecord, Role } from '../types';

export type EditableAttendanceStatus = Exclude<AttendanceStatus, 'RC'>;

export interface ReplacementDraft {
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
}

export interface AttendanceDraftRow {
  student: LocalRecord;
  status?: EditableAttendanceStatus;
  notes: string;
  existingAttendance?: LocalRecord;
  existingReplacement?: LocalRecord;
  replacement?: ReplacementDraft;
  statusChanged: boolean;
}

export interface CallAccess {
  editable: boolean;
  message?: string;
}

export interface AttendanceCallStore {
  findAttendance(classId: string, studentId: string, date: string, includeDeleted?: boolean): Promise<LocalRecord | undefined>;
  mutateBatch(mutations: LocalMutation[]): Promise<void>;
}

export interface SaveAttendanceCallInput {
  store: AttendanceCallStore;
  classId: string;
  date: string;
  userId: string;
  rows: AttendanceDraftRow[];
  generalNotes: string;
  existingClassNote?: LocalRecord;
  createId?: () => string;
}

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');
const isActive = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

function differenceInDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export function attendanceCallAccess(role: Role, date: string, today: string, existingCall: boolean): CallAccess {
  if (role !== 'professor') return { editable: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { editable: false, message: 'Selecione uma data válida para lançar a chamada.' };
  }
  const age = differenceInDays(date, today);
  if (age < 0) return { editable: false, message: 'Não é possível lançar frequência em uma data futura.' };
  if (age > 7) return { editable: false, message: 'Esta chamada está fora da janela de edição de sete dias.' };
  if (date !== today && !existingCall) {
    return { editable: false, message: 'Uma chamada nova só pode ser aberta no dia da aula. Nesta data não há chamada salva.' };
  }
  return { editable: true };
}

export function buildAttendanceDraftRows(input: {
  classId: string;
  date: string;
  students: LocalRecord[];
  enrollments: LocalRecord[];
  attendance: LocalRecord[];
  replacements: LocalRecord[];
}): AttendanceDraftRow[] {
  const activeStudentIds = new Set(input.enrollments
    .filter((item) => !item.deleted_at && item.class_id === input.classId && item.status === 'ativa')
    .map((item) => String(item.student_id)));
  const records = latestAttendance(input.attendance).filter((item) => !item.deleted_at
    && item.class_id === input.classId && item.date === input.date);
  const recordByStudent = new Map(records.map((item) => [String(item.student_id), item]));
  const replacementByAttendance = new Map(input.replacements
    .filter((item) => !item.deleted_at)
    .map((item) => [String(item.attendance_record_id), item]));

  return input.students
    .filter((student) => isActive(student) && activeStudentIds.has(student.id))
    .sort((left, right) => text(left, 'name').localeCompare(text(right, 'name'), 'pt-BR'))
    .map((student) => {
      const existingAttendance = recordByStudent.get(student.id);
      const persistedStatus = text(existingAttendance, 'status') as AttendanceStatus | '';
      const existingReplacement = existingAttendance ? replacementByAttendance.get(existingAttendance.id) : undefined;
      return {
        student,
        status: persistedStatus === 'RC' ? 'R' : (persistedStatus || 'P') as EditableAttendanceStatus,
        notes: text(existingAttendance, 'notes'),
        existingAttendance,
        existingReplacement,
        replacement: existingReplacement ? {
          scheduledDate: text(existingReplacement, 'scheduled_date'),
          scheduledTime: text(existingReplacement, 'scheduled_time'),
          notes: text(existingReplacement, 'notes'),
        } : undefined,
        statusChanged: false,
      };
    });
}

export function replacementDraftError(replacement?: ReplacementDraft): string | undefined {
  if (!replacement) return 'Informe a data e o horário da reposição.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(replacement.scheduledDate)
    || Number.isNaN(Date.parse(`${replacement.scheduledDate}T00:00:00Z`))) return 'Informe uma data válida para a reposição.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(replacement.scheduledTime)) return 'Informe um horário válido para a reposição.';
  if (replacement.notes.length > 1000) return 'A observação da reposição deve ter no máximo 1000 caracteres.';
  return undefined;
}

export function toggleAttendanceStatus(row: AttendanceDraftRow, status: EditableAttendanceStatus): AttendanceDraftRow {
  if (row.status === status) return { ...row, status: undefined, replacement: undefined, statusChanged: true };
  return { ...row, status, replacement: status === 'R' ? row.replacement : undefined, statusChanged: true };
}

/**
 * Validates and plans the entire draft before writing, then persists records
 * and sync queue entries in one IndexedDB transaction.
 */
export async function saveAttendanceCall(input: SaveAttendanceCallInput): Promise<void> {
  if (!input.classId || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Turma e data são obrigatórias para salvar a chamada.');
  if (input.generalNotes.length > 2000) throw new Error('A observação geral deve ter no máximo 2000 caracteres.');
  for (const row of input.rows) {
    if (row.notes.length > 1000) throw new Error(`A anotação de ${text(row.student, 'name')} deve ter no máximo 1000 caracteres.`);
    if (row.status === 'R') {
      const error = replacementDraftError(row.replacement);
      if (error) throw new Error(`${text(row.student, 'name')}: ${error}`);
    }
  }

  const createId = input.createId ?? (() => crypto.randomUUID());
  const mutations: LocalMutation[] = [];
  for (const row of input.rows) {
    const studentId = row.student.id;
    const current = row.existingAttendance ?? await input.store.findAttendance(input.classId, studentId, input.date, true);
    if (!row.status) {
      if (current && !current.deleted_at) mutations.push({ entity: 'attendance_records', data: current, action: 'delete' });
      if (row.existingReplacement && !row.existingReplacement.deleted_at) {
        mutations.push({ entity: 'replacements', data: row.existingReplacement, action: 'delete' });
      }
      continue;
    }

    const status: AttendanceStatus = current?.status === 'RC' && row.status === 'R' && !row.statusChanged ? 'RC' : row.status;
    const attendanceId = current?.id ?? createId();
    mutations.push({ entity: 'attendance_records', data: {
      ...current,
      id: attendanceId,
      class_id: input.classId,
      student_id: studentId,
      date: input.date,
      status,
      notes: row.notes.trim() || null,
      completed_at: status === 'RC' ? current?.completed_at ?? null : null,
      recorded_by_user_id: input.userId,
    } });

    if (row.status === 'R') {
      const replacement = row.replacement!;
      mutations.push({ entity: 'replacements', data: {
        ...row.existingReplacement,
        id: row.existingReplacement?.id ?? createId(),
        attendance_record_id: attendanceId,
        class_id: input.classId,
        student_id: studentId,
        attendance_date: input.date,
        scheduled_date: replacement.scheduledDate,
        scheduled_time: replacement.scheduledTime,
        notes: replacement.notes.trim() || null,
        completed_at: status === 'RC' ? row.existingReplacement?.completed_at ?? current?.completed_at ?? null : null,
        recorded_by_user_id: input.userId,
      } });
    } else if (row.existingReplacement && !row.existingReplacement.deleted_at) {
      mutations.push({ entity: 'replacements', data: row.existingReplacement, action: 'delete' });
    }
  }

  const notes = input.generalNotes.trim();
  if (notes) {
    mutations.push({ entity: 'class_notes', data: {
      ...input.existingClassNote,
      id: input.existingClassNote?.id ?? createId(),
      class_id: input.classId,
      date: input.date,
      notes,
      recorded_by_user_id: input.userId,
    } });
  } else if (input.existingClassNote && !input.existingClassNote.deleted_at) {
    mutations.push({ entity: 'class_notes', data: input.existingClassNote, action: 'delete' });
  }
  await input.store.mutateBatch(mutations);
}
