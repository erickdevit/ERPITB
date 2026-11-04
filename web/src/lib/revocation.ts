import type { Entity, LocalRecord } from '../types';

export type EntitySnapshot = Partial<Record<Entity, LocalRecord[]>>;

export interface RevocationTarget { entity: Entity; id: string }

const current = (record: LocalRecord) => !record.deleted_at;

export function classRevocationTargets(snapshot: EntitySnapshot, accountId: string, classId: string): RevocationTarget[] {
  const accessibleClasses = new Set((snapshot.class_teachers ?? [])
    .filter((assignment) => current(assignment) && assignment.user_id === accountId && assignment.class_id !== classId)
    .map((assignment) => String(assignment.class_id)));
  const removedStudentIds = new Set((snapshot.enrollments ?? [])
    .filter((enrollment) => current(enrollment) && enrollment.class_id === classId)
    .map((enrollment) => String(enrollment.student_id)));
  const retainedStudentIds = new Set((snapshot.enrollments ?? [])
    .filter((enrollment) => current(enrollment) && accessibleClasses.has(String(enrollment.class_id)))
    .map((enrollment) => String(enrollment.student_id)));
  const targets: RevocationTarget[] = [];
  const addByClass = (entity: Entity) => {
    for (const record of snapshot[entity] ?? []) if (record.class_id === classId) targets.push({ entity, id: record.id });
  };
  for (const item of snapshot.classes ?? []) if (item.id === classId) targets.push({ entity: 'classes', id: item.id });
  for (const entity of ['class_teachers', 'enrollments', 'attendance_records', 'class_notes', 'replacements', 'grade_tables', 'grade_items', 'student_grades'] as Entity[]) addByClass(entity);
  for (const student of snapshot.students ?? []) {
    if (removedStudentIds.has(student.id) && !retainedStudentIds.has(student.id)) targets.push({ entity: 'students', id: student.id });
  }
  return targets;
}
