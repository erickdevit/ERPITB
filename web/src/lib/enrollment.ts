import type { LocalRecord } from '../types';

export interface EnrollmentMovePlan {
  remove: LocalRecord[];
  target?: LocalRecord;
  unchanged: boolean;
}

const isCurrent = (enrollment: LocalRecord) => !enrollment.deleted_at && enrollment.status === 'ativa';

export function planEnrollmentMove(enrollments: LocalRecord[], studentId: string, targetClassId: string): EnrollmentMovePlan {
  const studentEnrollments = enrollments.filter((enrollment) => enrollment.student_id === studentId);
  const current = studentEnrollments.filter(isCurrent);
  const currentTarget = current.find((enrollment) => enrollment.class_id === targetClassId);
  const remove = current.filter((enrollment) => enrollment.id !== currentTarget?.id);

  if (currentTarget && remove.length === 0) return { remove: [], target: currentTarget, unchanged: true };

  const archivedTarget = studentEnrollments.find((enrollment) => enrollment.class_id === targetClassId);
  return { remove, target: currentTarget ?? archivedTarget, unchanged: false };
}

export function activeEnrollmentFor(enrollments: LocalRecord[], studentId: string): LocalRecord | undefined {
  return enrollments
    .filter((enrollment) => enrollment.student_id === studentId && isCurrent(enrollment))
    .sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')))[0];
}
