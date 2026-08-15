import type { LocalRecord } from '../types';

export const attendanceKey = (record: Record<string, unknown>) =>
  `${String(record.class_id)}:${String(record.student_id)}:${String(record.date)}`;

const changedAt = (record: LocalRecord) => String(record.updated_at ?? record.created_at ?? '');

/** Keeps one current status for a student, class, and date. */
export function latestAttendance(records: LocalRecord[]): LocalRecord[] {
  const latest = new Map<string, LocalRecord>();
  for (const record of records) {
    const key = attendanceKey(record);
    const previous = latest.get(key);
    if (!previous || changedAt(record) >= changedAt(previous)) latest.set(key, record);
  }
  return [...latest.values()];
}
