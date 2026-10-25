import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import { useEntity } from '../../lib/use-entity';
import type { LocalRecord } from '../../types';
import { canManage } from '../../types';
import { buildBiDataset, type BiFilters } from './model';

export function useBiData(filters: BiFilters, today: string) {
  const { api, session } = useApp();
  const attendance = useEntity('attendance_records', true);
  const classes = useEntity('classes', true);
  const students = useEntity('students', true);
  const enrollments = useEntity('enrollments', true);
  const classTeachers = useEntity('class_teachers', true);
  const courses = useEntity('courses', true);
  const laboratories = useEntity('laboratories', true);
  const replacements = useEntity('replacements', true);
  const gradeTables = useEntity('grade_tables', true);
  const gradeItems = useEntity('grade_items', true);
  const studentGrades = useEntity('student_grades', true);
  const [directory, setDirectory] = useState<LocalRecord[]>([
    { id: session.id, name: session.name, role: session.role, active: 1 },
  ]);
  const [serverAnalytics, setServerAnalytics] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!canManage(session.role)) return;
    let active = true;
    void api
      .get<{ items: LocalRecord[] }>('/users?role=professor&active=true')
      .then((result) => {
        if (active && Array.isArray(result?.items)) setDirectory(result.items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, session.role]);

  useEffect(() => {
    if (typeof api.getAnalytics !== 'function') return;
    let active = true;
    const params: Record<string, string> = { from: filters.from, to: filters.to };
    if (filters.classId) params.classId = filters.classId;
    if (filters.courseId) params.courseId = filters.courseId;
    if (filters.teacherId) params.teacherId = filters.teacherId;
    void api
      .getAnalytics(params)
      .then((res) => {
        if (active && res && typeof res === 'object') {
          setServerAnalytics(res as Record<string, unknown>);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, filters.classId, filters.courseId, filters.from, filters.teacherId, filters.to]);

  const loading =
    attendance.loading ||
    classes.loading ||
    students.loading ||
    enrollments.loading ||
    classTeachers.loading ||
    courses.loading ||
    laboratories.loading ||
    replacements.loading ||
    gradeTables.loading ||
    gradeItems.loading ||
    studentGrades.loading;

  const data = useMemo(
    () =>
      buildBiDataset(
        {
          attendance: attendance.items ?? [],
          classes: classes.items ?? [],
          students: students.items ?? [],
          enrollments: enrollments.items ?? [],
          classTeachers: classTeachers.items ?? [],
          courses: courses.items ?? [],
          laboratories: laboratories.items ?? [],
          replacements: replacements.items ?? [],
          directory: directory ?? [],
          gradeTables: gradeTables.items ?? [],
          gradeItems: gradeItems.items ?? [],
          studentGrades: studentGrades.items ?? [],
        },
        filters,
        today,
      ),
    [
      attendance.items,
      classes.items,
      students.items,
      enrollments.items,
      classTeachers.items,
      courses.items,
      laboratories.items,
      replacements.items,
      directory,
      gradeTables.items,
      gradeItems.items,
      studentGrades.items,
      filters,
      today,
    ],
  );

  return {
    data,
    serverAnalytics,
    loading,
    directory: directory ?? [],
    options: {
      courses: courses.items ?? [],
      classes: classes.items ?? [],
    },
  };
}
