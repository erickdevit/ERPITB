import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import { useEntity } from '../../lib/use-entity';
import type { LocalRecord } from '../../types';
import { canManage } from '../../types';
import type { ReportFilters } from './model';
import { buildReportView } from './model';

export function useReportData(filters: ReportFilters) {
  const { api, session } = useApp();
  const attendance = useEntity('attendance_records', true);
  const classes = useEntity('classes', true);
  const classNotes = useEntity('class_notes', true);
  const classTeachers = useEntity('class_teachers', true);
  const courses = useEntity('courses', true);
  const enrollments = useEntity('enrollments', true);
  const students = useEntity('students', true);
  const gradeTables = useEntity('grade_tables', true);
  const gradeItems = useEntity('grade_items', true);
  const studentGrades = useEntity('student_grades', true);
  const [directory, setDirectory] = useState<LocalRecord[]>([{ id: session.id, name: session.name, role: session.role, active: 1 }]);
  const [directoryError, setDirectoryError] = useState('');
  const [serverReport, setServerReport] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!canManage(session.role)) return;
    let active = true;
    setDirectoryError('');
    void api.get<{ items: LocalRecord[] }>('/users?role=professor&active=true')
      .then((result) => { if (active && Array.isArray(result?.items)) setDirectory(result.items); })
      .catch((error: unknown) => { if (active) setDirectoryError(error instanceof Error ? error.message : 'Não foi possível carregar a lista de professores.'); });
    return () => { active = false; };
  }, [api, session.role]);

  const effectiveFilters = useMemo<ReportFilters>(() => ({
    ...filters,
    teacherId: canManage(session.role) ? filters.teacherId : session.id,
  }), [filters, session.id, session.role]);

  useEffect(() => {
    if (typeof api.getReport !== 'function') return;
    let active = true;
    const params: Record<string, string> = { from: effectiveFilters.from, to: effectiveFilters.to };
    if (effectiveFilters.classId) params.classId = effectiveFilters.classId;
    if (effectiveFilters.courseId) params.courseId = effectiveFilters.courseId;
    if (effectiveFilters.teacherId) params.teacherId = effectiveFilters.teacherId;
    void api
      .getReport(params)
      .then((res: unknown) => {
        if (active && res && typeof res === 'object') {
          setServerReport(res as Record<string, unknown>);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, effectiveFilters.classId, effectiveFilters.courseId, effectiveFilters.from, effectiveFilters.teacherId, effectiveFilters.to]);

  const input = useMemo(() => ({
    attendance: attendance.items ?? [],
    classes: classes.items ?? [],
    classNotes: classNotes.items ?? [],
    classTeachers: classTeachers.items ?? [],
    courses: courses.items ?? [],
    directory: directory ?? [],
    enrollments: enrollments.items ?? [],
    students: students.items ?? [],
    gradeTables: gradeTables.items ?? [],
    gradeItems: gradeItems.items ?? [],
    studentGrades: studentGrades.items ?? [],
  }), [
    attendance.items,
    classes.items,
    classNotes.items,
    classTeachers.items,
    courses.items,
    directory,
    enrollments.items,
    students.items,
    gradeTables.items,
    gradeItems.items,
    studentGrades.items,
  ]);

  const view = useMemo(() => buildReportView(input, effectiveFilters), [effectiveFilters, input]);
  const loading =
    attendance.loading ||
    classes.loading ||
    classNotes.loading ||
    classTeachers.loading ||
    courses.loading ||
    enrollments.loading ||
    students.loading ||
    gradeTables.loading ||
    gradeItems.loading ||
    studentGrades.loading;

  return {
    view,
    serverReport,
    loading,
    directory,
    directoryError,
    options: {
      classes: classes.items ?? [],
      classTeachers: classTeachers.items ?? [],
      courses: courses.items ?? [],
      enrollments: enrollments.items ?? [],
      students: students.items ?? [],
    },
  };
}
