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
  const [directory, setDirectory] = useState<LocalRecord[]>([
    { id: session.id, name: session.name, role: session.role, active: 1 },
  ]);

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

  const loading =
    attendance.loading ||
    classes.loading ||
    students.loading ||
    enrollments.loading ||
    classTeachers.loading ||
    courses.loading ||
    laboratories.loading ||
    replacements.loading;

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
      filters,
      today,
    ],
  );

  return {
    data,
    loading,
    directory: directory ?? [],
    options: {
      courses: courses.items ?? [],
      classes: classes.items ?? [],
    },
  };
}
