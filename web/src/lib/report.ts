import type { LocalRecord } from '../types';

export const attendanceStatuses = ['P', 'F', 'J', 'A', 'R'] as const;

export type AttendanceStatusCode = (typeof attendanceStatuses)[number];

export type ReportSummary = {
  records: number;
  students: number;
  present: number;
  absences: number;
  attendanceRate: number;
  byStatus: Record<AttendanceStatusCode, number>;
};

export function summarizeReport(records: LocalRecord[]): ReportSummary {
  const byStatus: Record<AttendanceStatusCode, number> = { P: 0, F: 0, J: 0, A: 0, R: 0 };
  for (const record of records) {
    const status = String(record.status ?? '') as AttendanceStatusCode;
    if (status in byStatus) byStatus[status] += 1;
  }
  const present = byStatus.P;
  return {
    records: records.length,
    students: new Set(records.map((record) => String(record.student_id ?? ''))).size,
    present,
    absences: byStatus.F,
    attendanceRate: records.length ? Math.round(present * 1000 / records.length) / 10 : 0,
    byStatus,
  };
}
