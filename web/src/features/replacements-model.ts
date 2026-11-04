import { latestAttendance } from '../lib/attendance';
import type { LocalRecord } from '../types';

const text = (record: LocalRecord | undefined, key: string) => String(record?.[key] ?? '');
const timestamp = (record: LocalRecord) => Date.parse(text(record, 'updated_at') || text(record, 'created_at')) || 0;

export interface ReplacementView {
  id: string;
  attendance: LocalRecord;
  schedule?: LocalRecord;
  studentName: string;
  registrationNumber: string;
  className: string;
  attendanceDate: string;
  scheduledDate: string;
  scheduledTime: string;
  completedAt: string;
  notes: string;
  completed: boolean;
}

export function buildReplacementViews(input: {
  attendance: LocalRecord[];
  replacements: LocalRecord[];
  students: LocalRecord[];
  classes: LocalRecord[];
}): ReplacementView[] {
  const classIds = new Set(input.classes.filter((item) => !item.deleted_at).map((item) => item.id));
  const schedules = new Map<string, LocalRecord>();
  for (const item of [...input.replacements].filter((record) => !record.deleted_at).sort((left, right) => timestamp(right) - timestamp(left))) {
    const attendanceId = text(item, 'attendance_record_id');
    if (attendanceId && !schedules.has(attendanceId)) schedules.set(attendanceId, item);
  }
  return latestAttendance(input.attendance)
    .filter((record) => !record.deleted_at && (record.status === 'R' || record.status === 'RC') && classIds.has(text(record, 'class_id')))
    .map((attendance) => {
      const schedule = schedules.get(attendance.id);
      const student = input.students.find((item) => item.id === attendance.student_id);
      const classRecord = input.classes.find((item) => item.id === attendance.class_id);
      const completedAt = text(schedule, 'completed_at') || text(attendance, 'completed_at');
      return {
        id: attendance.id,
        attendance,
        schedule,
        studentName: text(student, 'name') || 'Aluno não informado',
        registrationNumber: text(student, 'registration_number') || '—',
        className: text(classRecord, 'name') || 'Turma não informada',
        attendanceDate: text(attendance, 'date'),
        scheduledDate: text(schedule, 'scheduled_date'),
        scheduledTime: text(schedule, 'scheduled_time'),
        completedAt,
        notes: text(schedule, 'notes') || text(attendance, 'notes'),
        completed: attendance.status === 'RC' || Boolean(completedAt),
      };
    })
    .sort((left, right) => right.attendanceDate.localeCompare(left.attendanceDate) || left.studentName.localeCompare(right.studentName, 'pt-BR'));
}

export function filterReplacementViews(rows: ReplacementView[], input: {
  history: boolean;
  query: string;
  classId: string;
  from: string;
  to: string;
}): ReplacementView[] {
  const query = input.query.trim().toLocaleLowerCase('pt-BR');
  return rows.filter((row) => row.completed === input.history
    && (!input.classId || row.attendance.class_id === input.classId)
    && (!input.from || row.attendanceDate >= input.from)
    && (!input.to || row.attendanceDate <= input.to)
    && (!query || `${row.studentName} ${row.registrationNumber} ${row.className}`.toLocaleLowerCase('pt-BR').includes(query)));
}
