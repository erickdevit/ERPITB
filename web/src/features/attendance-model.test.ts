import { describe, expect, it, vi } from 'vitest';
import type { LocalRecord } from '../types';
import {
  attendanceCallAccess, buildAttendanceDraftRows, saveAttendanceCall, toggleAttendanceStatus,
  type AttendanceCallStore, type AttendanceDraftRow,
} from './attendance-model';

const student = (id: string, name: string): LocalRecord => ({ id, name, registration_number: `M-${id}`, active: 1 });

function storeMock() {
  return {
    findAttendance: vi.fn().mockResolvedValue(undefined),
    setAttendance: vi.fn(async (record: Record<string, unknown>) => ({ id: `attendance-${record.student_id}`, ...record })),
    clearAttendance: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn().mockResolvedValue(undefined),
  } satisfies AttendanceCallStore;
}

describe('attendanceCallAccess', () => {
  it('allows a professor to open a new call only today and edit an existing call for seven days', () => {
    expect(attendanceCallAccess('professor', '2026-08-15', '2026-08-15', false).editable).toBe(true);
    expect(attendanceCallAccess('professor', '2026-08-14', '2026-08-15', false)).toMatchObject({ editable: false });
    expect(attendanceCallAccess('professor', '2026-08-08', '2026-08-15', true).editable).toBe(true);
    expect(attendanceCallAccess('professor', '2026-08-07', '2026-08-15', true)).toMatchObject({ editable: false });
    expect(attendanceCallAccess('professor', '2026-08-16', '2026-08-15', false)).toMatchObject({ editable: false });
  });

  it('does not impose the professor-only window on management profiles', () => {
    expect(attendanceCallAccess('admin', '2025-01-01', '2026-08-15', false)).toEqual({ editable: true });
    expect(attendanceCallAccess('pedagogico', '2025-01-01', '2026-08-15', false)).toEqual({ editable: true });
  });
});

describe('attendance drafts', () => {
  it('loads only active enrollments, keeps the latest status and maps completed replacements without reopening them', () => {
    const result = buildAttendanceDraftRows({
      classId: 'class-1', date: '2026-08-15',
      students: [student('student-2', 'Bia'), student('student-1', 'Ana'), student('student-3', 'Caio')],
      enrollments: [
        { id: 'e1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' },
        { id: 'e2', class_id: 'class-1', student_id: 'student-2', status: 'ativa' },
        { id: 'e3', class_id: 'class-1', student_id: 'student-3', status: 'concluida' },
      ],
      attendance: [
        { id: 'old', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'F', updated_at: '2026-08-15T10:00:00Z' },
        { id: 'current', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'RC', notes: 'Concluída', completed_at: '2026-08-16T10:00:00Z', updated_at: '2026-08-16T10:00:00Z' },
      ],
      replacements: [{ id: 'replacement-1', attendance_record_id: 'current', scheduled_date: '2026-08-16', scheduled_time: '09:30', notes: 'Reforço', completed_at: '2026-08-16T10:00:00Z' }],
    });

    expect(result.map((row) => row.student.id)).toEqual(['student-1', 'student-2']);
    expect(result[0]).toMatchObject({ status: 'R', statusChanged: false, notes: 'Concluída', replacement: { scheduledDate: '2026-08-16', scheduledTime: '09:30', notes: 'Reforço' } });
    expect(result[1]).toMatchObject({ status: 'P', statusChanged: false });
  });

  it('deselects a status on the second click and removes a pending replacement from the draft', () => {
    const row: AttendanceDraftRow = { student: student('student-1', 'Ana'), status: 'R', notes: '', statusChanged: false, replacement: { scheduledDate: '2026-08-16', scheduledTime: '09:00', notes: '' } };
    expect(toggleAttendanceStatus(row, 'R')).toMatchObject({ status: undefined, replacement: undefined, statusChanged: true });
  });
});

describe('saveAttendanceCall', () => {
  it('validates the complete draft before making any local mutation', async () => {
    const store = storeMock();
    await expect(saveAttendanceCall({
      store, classId: 'class-1', date: '2026-08-15', userId: 'teacher-1', generalNotes: '',
      rows: [{ student: student('student-1', 'Ana'), status: 'R', notes: '', statusChanged: true }],
    })).rejects.toThrow('Ana: Informe a data e o horário da reposição.');
    expect(store.setAttendance).not.toHaveBeenCalled();
    expect(store.mutate).not.toHaveBeenCalled();
  });

  it('persists statuses, replacement metadata, removals and the general note as one logical batch', async () => {
    const store = storeMock();
    const oldAttendance = { id: 'attendance-old', class_id: 'class-1', student_id: 'student-2', date: '2026-08-15', status: 'F' };
    const oldReplacement = { id: 'replacement-old', attendance_record_id: 'attendance-old' };
    await saveAttendanceCall({
      store, classId: 'class-1', date: '2026-08-15', userId: 'teacher-1', generalNotes: '  Revisão geral  ', createId: () => 'generated-id',
      rows: [
        { student: student('student-1', 'Ana'), status: 'R', notes: '  conteúdo  ', statusChanged: true, replacement: { scheduledDate: '2026-08-20', scheduledTime: '09:30', notes: '  reforço  ' } },
        { student: student('student-2', 'Bia'), status: undefined, notes: '', statusChanged: true, existingAttendance: oldAttendance, existingReplacement: oldReplacement },
      ],
    });

    expect(store.setAttendance).toHaveBeenCalledWith(expect.objectContaining({ student_id: 'student-1', status: 'R', notes: 'conteúdo' }));
    expect(store.clearAttendance).toHaveBeenCalledWith('class-1', 'student-2', '2026-08-15');
    expect(store.mutate).toHaveBeenCalledWith('replacements', expect.objectContaining({
      id: 'generated-id', attendance_record_id: 'attendance-student-1', scheduled_date: '2026-08-20', scheduled_time: '09:30', notes: 'reforço',
    }));
    expect(store.mutate).toHaveBeenCalledWith('replacements', oldReplacement, 'delete');
    expect(store.mutate).toHaveBeenCalledWith('class_notes', expect.objectContaining({ notes: 'Revisão geral' }));
  });

  it('preserves RC and completion metadata when an already completed replacement is saved unchanged', async () => {
    const store = storeMock();
    const existingAttendance = { id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'RC', completed_at: '2026-08-20T10:00:00Z' };
    const existingReplacement = { id: 'replacement-1', attendance_record_id: 'attendance-1', completed_at: '2026-08-20T10:00:00Z' };
    await saveAttendanceCall({
      store, classId: 'class-1', date: '2026-08-15', userId: 'teacher-1', generalNotes: '',
      rows: [{
        student: student('student-1', 'Ana'), status: 'R', notes: '', statusChanged: false,
        existingAttendance, existingReplacement,
        replacement: { scheduledDate: '2026-08-20', scheduledTime: '09:30', notes: '' },
      }],
    });
    expect(store.setAttendance).toHaveBeenCalledWith(expect.objectContaining({ status: 'RC', completed_at: '2026-08-20T10:00:00Z' }));
    expect(store.mutate).toHaveBeenCalledWith('replacements', expect.objectContaining({ completed_at: '2026-08-20T10:00:00Z' }));
  });
});
