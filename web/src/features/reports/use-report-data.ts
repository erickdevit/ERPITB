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
  const [directory, setDirectory] = useState<LocalRecord[]>([{ id: session.id, name: session.name, role: session.role, active: 1 }]);
  const [directoryError, setDirectoryError] = useState('');

  useEffect(() => {
    if (!canManage(session.role)) return;
    let active = true;
    setDirectoryError('');
    void api.get<{ items: LocalRecord[] }>('/users?role=professor&active=true')
      .then((result) => { if (active) setDirectory(result.items); })
      .catch((error: unknown) => { if (active) setDirectoryError(error instanceof Error ? error.message : 'Não foi possível carregar a lista de professores.'); });
    return () => { active = false; };
  }, [api, session.role]);

  const effectiveFilters = useMemo<ReportFilters>(() => ({
    ...filters,
    teacherId: canManage(session.role) ? filters.teacherId : session.id,
  }), [filters, session.id, session.role]);

  const input = useMemo(() => ({
    attendance: attendance.items,
    classes: classes.items,
    classNotes: classNotes.items,
    classTeachers: classTeachers.items,
    courses: courses.items,
    directory,
    enrollments: enrollments.items,
    students: students.items,
  }), [attendance.items, classes.items, classNotes.items, classTeachers.items, courses.items, directory, enrollments.items, students.items]);

  const view = useMemo(() => buildReportView(input, effectiveFilters), [effectiveFilters, input]);
  const loading = attendance.loading || classes.loading || classNotes.loading || classTeachers.loading || courses.loading || enrollments.loading || students.loading;

  return {
    view,
    loading,
    directory,
    directoryError,
    options: { classes: classes.items, classTeachers: classTeachers.items, courses: courses.items, enrollments: enrollments.items, students: students.items },
  };
}
