import { describe, expect, it } from 'vitest';
import { classRevocationTargets } from './revocation';

describe('classRevocationTargets', () => {
  it('purges the revoked class and its exclusive student data', () => {
    const targets = classRevocationTargets({
      classes: [{ id: 'class-a' }, { id: 'class-b' }],
      class_teachers: [{ id: 'teacher-a', class_id: 'class-a', user_id: 'teacher-1' }, { id: 'teacher-b', class_id: 'class-b', user_id: 'teacher-1' }],
      enrollments: [{ id: 'enrollment-a', class_id: 'class-a', student_id: 'student-a' }],
      students: [{ id: 'student-a' }],
      attendance_records: [{ id: 'attendance-a', class_id: 'class-a', student_id: 'student-a' }],
    }, 'teacher-1', 'class-a');

    expect(targets).toEqual(expect.arrayContaining([
      { entity: 'classes', id: 'class-a' },
      { entity: 'students', id: 'student-a' },
      { entity: 'attendance_records', id: 'attendance-a' },
    ]));
    expect(targets).not.toContainEqual({ entity: 'classes', id: 'class-b' });
  });

  it('keeps a student who is also enrolled in another accessible class', () => {
    const targets = classRevocationTargets({
      class_teachers: [{ id: 'teacher-a', class_id: 'class-a', user_id: 'teacher-1' }, { id: 'teacher-b', class_id: 'class-b', user_id: 'teacher-1' }],
      enrollments: [
        { id: 'enrollment-a', class_id: 'class-a', student_id: 'student-shared' },
        { id: 'enrollment-b', class_id: 'class-b', student_id: 'student-shared' },
      ],
      students: [{ id: 'student-shared' }],
    }, 'teacher-1', 'class-a');

    expect(targets).not.toContainEqual({ entity: 'students', id: 'student-shared' });
    expect(targets).toContainEqual({ entity: 'enrollments', id: 'enrollment-a' });
    expect(targets).not.toContainEqual({ entity: 'enrollments', id: 'enrollment-b' });
  });
});
