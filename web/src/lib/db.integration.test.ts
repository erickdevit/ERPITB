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

  it('persists a multi-entity workflow with one queued operation per record', async () => {
    const store = await LocalStore.open(session(`account-${crypto.randomUUID()}`)); opened.push(store);
    await store.mutateBatch([
      { entity: 'attendance_records', data: { id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'R', recorded_by_user_id: store.accountId } },
      { entity: 'replacements', data: { id: 'replacement-1', attendance_record_id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', attendance_date: '2026-08-15', scheduled_date: '2026-08-20', scheduled_time: '09:30', recorded_by_user_id: store.accountId } },
    ]);

    expect(await store.get('attendance_records', 'attendance-1')).toMatchObject({ status: 'R', sync_status: 'PENDING' });
    expect(await store.get('replacements', 'replacement-1')).toMatchObject({ attendance_record_id: 'attendance-1', sync_status: 'PENDING' });
    expect((await store.pending()).map((operation) => `${operation.entity}:${operation.id}`).sort()).toEqual([
      'attendance_records:attendance-1', 'replacements:replacement-1',
    ]);
  });

  it('rejects duplicate targets before changing local state', async () => {
    const store = await LocalStore.open(session(`account-${crypto.randomUUID()}`)); opened.push(store);
    await expect(store.mutateBatch([
      { entity: 'courses', data: { id: 'course-1', code: 'A', name: 'Primeiro', active: 1 } },
      { entity: 'courses', data: { id: 'course-1', code: 'B', name: 'Segundo', active: 1 } },
    ])).rejects.toThrow('mais de uma alteração');
    await expect(store.get('courses', 'course-1')).resolves.toBeUndefined();
    await expect(store.pending()).resolves.toEqual([]);
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

  it('allows an offline login only with the verifier created after an online login', async () => {
    const accountId = `account-${crypto.randomUUID()}`;
    const onlineSession = session(accountId);
    const store = await LocalStore.open(onlineSession); opened.push(store);
    await store.saveOfflineVerifier(onlineSession.email, 'Senha segura 123!', onlineSession);
    await store.clearSession();

    await expect(LocalStore.openOffline(onlineSession.email.toUpperCase(), 'Senha incorreta')).resolves.toBeNull();
    const restored = await LocalStore.openOffline(onlineSession.email, 'Senha segura 123!');

    expect(restored?.session).toMatchObject({ id: accountId, offline: true, accessToken: '', refreshToken: '' });
  });
});
