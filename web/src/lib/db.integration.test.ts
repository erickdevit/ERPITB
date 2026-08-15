import { afterEach, describe, expect, it } from 'vitest';
import { LocalStore } from './db';
import type { UserSession } from '../types';

const opened: LocalStore[] = [];
const session = (id: string): UserSession => ({
  id, name: 'Professor', email: `${id}@example.invalid`, role: 'professor', accessToken: 'access', refreshToken: 'refresh',
});

afterEach(async () => {
  for (const store of opened.splice(0)) await store.clear();
});

describe('LocalStore integration', () => {
  it('encrypts, persists and reads an offline mutation', async () => {
    const store = await LocalStore.open(session(`account-${crypto.randomUUID()}`)); opened.push(store);
    await store.mutate('courses', { id: 'course-1', code: 'WEB', name: 'Web', active: 1 });

    await expect(store.list('courses')).resolves.toEqual([expect.objectContaining({ id: 'course-1', name: 'Web', sync_status: 'PENDING' })]);
    await expect(store.pending()).resolves.toEqual([expect.objectContaining({ entity: 'courses', id: 'course-1' })]);
  });

  it('purges revoked class data while retaining a student shared with another accessible class', async () => {
    const accountId = `teacher-${crypto.randomUUID()}`;
    const store = await LocalStore.open(session(accountId)); opened.push(store);
    await store.mutate('classes', { id: 'class-a', name: 'A', course_id: 'course-1', shift: 'manha', active: 1 });
    await store.mutate('classes', { id: 'class-b', name: 'B', course_id: 'course-1', shift: 'manha', active: 1 });
    await store.mutate('class_teachers', { id: 'assignment-a', class_id: 'class-a', user_id: accountId });
    await store.mutate('class_teachers', { id: 'assignment-b', class_id: 'class-b', user_id: accountId });
    await store.mutate('students', { id: 'student-shared', name: 'Ana', registration_number: '1', active: 1 });
    await store.mutate('students', { id: 'student-exclusive', name: 'Bia', registration_number: '2', active: 1 });
    await store.mutate('enrollments', { id: 'enrollment-a-shared', class_id: 'class-a', student_id: 'student-shared', status: 'ativa' });
    await store.mutate('enrollments', { id: 'enrollment-b-shared', class_id: 'class-b', student_id: 'student-shared', status: 'ativa' });
    await store.mutate('enrollments', { id: 'enrollment-a-exclusive', class_id: 'class-a', student_id: 'student-exclusive', status: 'ativa' });

    await store.putRemote('class_teachers', { id: 'assignment-a', class_id: 'class-a', user_id: accountId }, 'delete');

    expect((await store.list('classes')).map((item) => item.id)).toEqual(['class-b']);
    expect((await store.list('students')).map((item) => item.id)).toEqual(['student-shared']);
    expect((await store.list('enrollments')).map((item) => item.id)).toEqual(['enrollment-b-shared']);
    expect((await store.pending()).some((operation) => operation.data.class_id === 'class-a')).toBe(false);
  });
});
