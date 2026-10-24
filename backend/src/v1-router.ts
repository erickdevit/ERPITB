import { AppError, json, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission } from './rbac';
import { sha256Hex } from './crypto';
import { checkIdempotency, saveIdempotency } from './idempotency';
import { handleEventsStream } from './events-service';
import {
  createCashEntry,
  createFee,
  getFinancialContact,
  listCashTransactions,
  listFees,
  recordPayment,
  reverseCashEntry,
  saveFinancialContact,
  updateFee,
} from './finance';
import { getBranding, resetBranding, updateBranding } from './branding';
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from './apikeys';
import { countDistinctClassLessons, ensureClassSession, listClassSessions } from './sessions-service';
import { getAnalyticsData } from './analytics-service';
import { generateReportData } from './reports-service';
import {
  listLaboratories,
  createLaboratory,
  getLaboratory,
  updateLaboratory,
  deleteEntity,
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  listClasses,
  createClass,
  getClass,
  updateClass,
  listClassTeachers,
  assignTeacher,
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  listStudents,
  createStudent,
  getStudent,
  updateStudent,
  inactivateStudent,
  listEnrollments,
  getEnrollment,
  updateEnrollment,
  deleteEnrollment,
  enrollStudent,
  listAttendance,
  saveAttendance,
  dashboard,
  listConflicts,
  resolveConflict,
  listAudit,
} from './data';
import {
  listGradeTables,
  getGradeTable,
  createGradeTable,
  updateGradeTable,
  deleteGradeTable,
  listGradeItems,
  getGradeItem,
  createGradeItem,
  updateGradeItem,
  deleteGradeItem,
  listStudentGrades,
  saveStudentGrades,
} from './grades-service';
import {
  listReplacements,
  getReplacement,
  createReplacement,
  updateReplacement,
  completeReplacement,
} from './replacements-service';
import type { AttendanceStatus, AuthUser, Env } from './types';

/**
 * Executes a mutation with Idempotency Key validation and cached replay.
 */
async function withIdempotency(
  request: Request,
  env: Env,
  user: AuthUser,
  path: string,
  handler: () => Promise<unknown>
): Promise<unknown> {
  const idempotencyKey = request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key');
  if (!idempotencyKey) {
    return handler();
  }

  const cloned = request.clone();
  const bodyText = await cloned.text();
  const requestHash = await sha256Hex(bodyText);

  const cached = await checkIdempotency(idempotencyKey, user, path, requestHash, env);
  if (cached) {
    return cached;
  }

  const result = await handler();
  let statusCode = request.method === 'POST' ? 201 : 200;
  let responseJson = '';

  if (result instanceof Response) {
    statusCode = result.status;
    responseJson = await result.clone().text();
  } else {
    responseJson = JSON.stringify(result);
  }

  await saveIdempotency(idempotencyKey, user, path, requestHash, statusCode, responseJson, env);

  if (result instanceof Response) {
    return result;
  }

  return new Response(responseJson, {
    status: statusCode,
    headers: {
      'content-type': 'application/json',
    },
  });
}

export async function handleV1Route(request: Request, env: Env, user: AuthUser, url: URL): Promise<unknown | undefined> {
  const method = request.method;
  const path = url.pathname.startsWith('/api/v1') ? url.pathname.slice(4) : url.pathname;

  // Real-Time SSE Stream (F5)
  if (path === '/v1/events' && method === 'GET') return handleEventsStream(request, env, user);

  // Dashboard & Operational
  if (path === '/v1/dashboard' && method === 'GET') return dashboard(url, env, user);
  if (path === '/v1/conflicts' && method === 'GET') return listConflicts(env, user);
  const conflictResolveMatch = path.match(/^\/v1\/conflicts\/([^/]+)\/resolve$/);
  if (conflictResolveMatch && method === 'POST') return resolveConflict(request, env, user, conflictResolveMatch[1]!);
  if (path === '/v1/audit' && method === 'GET') return listAudit(url, env, user);

  // 1. Finance Endpoints
  if (path === '/v1/finance/fees' && method === 'GET') return listFees(env, user, url);
  if (path === '/v1/finance/fees' && method === 'POST') return createFee(request, env, user);
  const feeMatch = path.match(/^\/v1\/finance\/fees\/([^/]+)$/);
  if (feeMatch && method === 'PATCH') return updateFee(request, env, user, feeMatch[1]!);
  const feePaymentMatch = path.match(/^\/v1\/finance\/fees\/([^/]+)\/payments$/);
  if (feePaymentMatch && method === 'POST') {
    return withIdempotency(request, env, user, path, () => recordPayment(request, env, user, feePaymentMatch[1]!));
  }

  if (path === '/v1/finance/cash' && method === 'GET') return listCashTransactions(env, user, url);
  if (path === '/v1/finance/cash/entries' && method === 'POST') return withIdempotency(request, env, user, path, () => createCashEntry(request, env, user));
  const cashReversalMatch = path.match(/^\/v1\/finance\/cash\/entries\/([^/]+)\/reversal$/);
  if (cashReversalMatch && method === 'POST') return withIdempotency(request, env, user, path, () => reverseCashEntry(request, env, user, cashReversalMatch[1]!));

  const contactMatch = path.match(/^\/v1\/finance\/contacts\/([^/]+)$/);
  if (contactMatch && method === 'GET') return getFinancialContact(env, user, contactMatch[1]!);
  if (contactMatch && method === 'PUT') return saveFinancialContact(request, env, user, contactMatch[1]!);

  // 2. Branding Endpoints
  if (path === '/v1/admin/branding' && method === 'GET') return getBranding(env);
  if (path === '/v1/admin/branding' && method === 'PUT') return updateBranding(request, env, user);
  if (path === '/v1/admin/branding/reset' && method === 'POST') return resetBranding(env, user);

  // 3. API Keys Endpoints
  if (path === '/v1/admin/api-keys' && method === 'GET') return listApiKeys(env, user);
  if (path === '/v1/admin/api-keys' && method === 'POST') return createApiKey(request, env, user);
  const apiKeyRevokeMatch = path.match(/^\/v1\/admin\/api-keys\/([^/]+)\/revoke$/);
  if (apiKeyRevokeMatch && method === 'POST') return revokeApiKey(env, user, apiKeyRevokeMatch[1]!);
  const apiKeyRotateMatch = path.match(/^\/v1\/admin\/api-keys\/([^/]+)\/rotate$/);
  if (apiKeyRotateMatch && method === 'POST') return rotateApiKey(env, user, apiKeyRotateMatch[1]!);

  // 4. Analytics & Reports
  if (path === '/v1/analytics' && method === 'GET') return getAnalyticsData(env, user, url);
  if (path === '/v1/reports' && method === 'GET') return generateReportData(env, user, url);

  // 5. Laboratories Endpoints
  if (path === '/v1/laboratories' && method === 'GET') return listLaboratories(env, user);
  if (path === '/v1/laboratories' && method === 'POST') return createLaboratory(request, env, user);
  const labMatch = path.match(/^\/v1\/laboratories\/([^/]+)$/);
  if (labMatch && method === 'GET') return getLaboratory(env, user, labMatch[1]!);
  if (labMatch && method === 'PATCH') return updateLaboratory(request, env, user, labMatch[1]!);
  if (labMatch && method === 'DELETE') return deleteEntity(env, user, 'laboratories', labMatch[1]!);

  // 6. Courses Endpoints
  if (path === '/v1/courses' && method === 'GET') return listCourses(env, user);
  if (path === '/v1/courses' && method === 'POST') return createCourse(request, env, user);
  const courseMatch = path.match(/^\/v1\/courses\/([^/]+)$/);
  if (courseMatch && method === 'GET') return getCourse(env, user, courseMatch[1]!);
  if (courseMatch && method === 'PATCH') return updateCourse(request, env, user, courseMatch[1]!);
  if (courseMatch && method === 'DELETE') return deleteEntity(env, user, 'courses', courseMatch[1]!);

  // 7. Classes Endpoints
  if (path === '/v1/classes' && method === 'GET') return listClasses(env, user);
  if (path === '/v1/classes' && method === 'POST') return createClass(request, env, user);
  const classMatch = path.match(/^\/v1\/classes\/([^/]+)$/);
  if (classMatch && method === 'GET') return getClass(env, user, classMatch[1]!);
  if (classMatch && method === 'PATCH') return updateClass(request, env, user, classMatch[1]!);
  if (classMatch && method === 'DELETE') return deleteEntity(env, user, 'classes', classMatch[1]!);

  const sessionListMatch = path.match(/^\/v1\/classes\/([^/]+)\/sessions$/);
  if (sessionListMatch && method === 'GET') return listClassSessions(env, user, sessionListMatch[1]!);

  const teacherListMatch = path.match(/^\/v1\/classes\/([^/]+)\/teachers$/);
  if (teacherListMatch && method === 'GET') return listClassTeachers(env, user, teacherListMatch[1]!);
  if (teacherListMatch && method === 'POST') return assignTeacher(request, env, user, teacherListMatch[1]!);

  const classEnrollmentMatch = path.match(/^\/v1\/classes\/([^/]+)\/enrollments$/);
  if (classEnrollmentMatch && method === 'POST') return enrollStudent(request, env, user, classEnrollmentMatch[1]!);

  // 8. Users Endpoints
  if (path === '/v1/users' && method === 'GET') return listUsers(url, env, user);
  if (path === '/v1/users' && method === 'POST') return createUser(request, env, user);
  const userMatch = path.match(/^\/v1\/users\/([^/]+)$/);
  if (userMatch && method === 'GET') return getUser(env, user, userMatch[1]!);
  if (userMatch && method === 'PATCH') return updateUser(request, env, user, userMatch[1]!);
  if (userMatch && method === 'DELETE') return deleteUser(env, user, userMatch[1]!);

  // 9. Students Endpoints
  if (path === '/v1/students' && method === 'GET') return listStudents(url, env, user);
  if (path === '/v1/students' && method === 'POST') return createStudent(request, env, user);
  const studentMatch = path.match(/^\/v1\/students\/([^/]+)$/);
  if (studentMatch && method === 'GET') return getStudent(env, user, studentMatch[1]!);
  if (studentMatch && method === 'PATCH') return updateStudent(request, env, user, studentMatch[1]!);
  if (studentMatch && method === 'DELETE') return inactivateStudent(env, user, studentMatch[1]!, request);

  const lockMatch = path.match(/^\/v1\/students\/([^/]+)\/lock$/);
  if (lockMatch && method === 'POST') {
    requirePermission(user, 'students:write');
    const studentId = lockMatch[1]!;
    const timestamp = nowIso();
    const result = await env.DB.prepare(`
      UPDATE enrollments
         SET status = 'trancada', updated_at = ?
       WHERE student_id = ? AND status = 'ativa' AND deleted_at IS NULL
    `).bind(timestamp, studentId).run();

    if (result.meta.changes === 0) {
      throw new AppError(404, 'Nenhuma matrícula ativa encontrada para trancar.', 'NOT_FOUND');
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at)
      VALUES (?, ?, 'LOCK_ENROLLMENT', 'enrollments', ?, '{}', ?)
    `).bind(uuid(), user.id, studentId, timestamp).run();

    return { ok: true, message: 'Matrícula trancada com sucesso. O aluno não aparecerá nas próximas chamadas.' };
  }

  // 10. Enrollments Endpoints
  if (path === '/v1/enrollments' && method === 'GET') return listEnrollments(env, user, url);
  if (path === '/v1/enrollments' && method === 'POST') {
    const clone = request.clone();
    const body = await readJson<Record<string, unknown>>(clone as unknown as Request);
    const classId = requireString(body.classId, 'classId', { max: 36 });
    return enrollStudent(request, env, user, classId);
  }
  const enrollmentMatch = path.match(/^\/v1\/enrollments\/([^/]+)$/);
  if (enrollmentMatch && method === 'GET') return getEnrollment(env, user, enrollmentMatch[1]!);
  if (enrollmentMatch && method === 'PATCH') return updateEnrollment(request, env, user, enrollmentMatch[1]!);
  if (enrollmentMatch && method === 'DELETE') return deleteEnrollment(request, env, user, enrollmentMatch[1]!);

  // 11. Attendance Endpoints
  if (path === '/v1/attendance' && method === 'GET') return listAttendance(url, env, user);
  if (path === '/v1/attendance' && method === 'POST') {
    return withIdempotency(request, env, user, path, () => saveAttendance(request, env, user));
  }
  if (path === '/v1/attendance/batch' && (method === 'PUT' || method === 'POST')) {
    return withIdempotency(request, env, user, path, () => saveAttendance(request, env, user));
  }

  // 12. Grade Tables Endpoints
  if (path === '/v1/grade-tables' && method === 'GET') return listGradeTables(env, user, url);
  if (path === '/v1/grade-tables' && method === 'POST') return createGradeTable(request, env, user);
  const gradeTableMatch = path.match(/^\/v1\/grade-tables\/([^/]+)$/);
  if (gradeTableMatch && method === 'GET') return getGradeTable(env, user, gradeTableMatch[1]!);
  if (gradeTableMatch && method === 'PATCH') return updateGradeTable(request, env, user, gradeTableMatch[1]!);
  if (gradeTableMatch && method === 'DELETE') return deleteGradeTable(request, env, user, gradeTableMatch[1]!);

  // 13. Grade Items Endpoints
  if (path === '/v1/grade-items' && method === 'GET') return listGradeItems(env, user, url);
  if (path === '/v1/grade-items' && method === 'POST') return createGradeItem(request, env, user);
  const gradeItemMatch = path.match(/^\/v1\/grade-items\/([^/]+)$/);
  if (gradeItemMatch && method === 'GET') return getGradeItem(env, user, gradeItemMatch[1]!);
  if (gradeItemMatch && method === 'PATCH') return updateGradeItem(request, env, user, gradeItemMatch[1]!);
  if (gradeItemMatch && method === 'DELETE') return deleteGradeItem(request, env, user, gradeItemMatch[1]!);

  // 14. Student Grades Endpoints
  if (path === '/v1/student-grades' && method === 'GET') return listStudentGrades(env, user, url);
  if (path === '/v1/student-grades' && method === 'POST') return saveStudentGrades(request, env, user);

  // 15. Replacements Endpoints
  if (path === '/v1/replacements' && method === 'GET') return listReplacements(env, user, url);
  if (path === '/v1/replacements' && method === 'POST') return createReplacement(request, env, user);
  const replacementMatch = path.match(/^\/v1\/replacements\/([^/]+)$/);
  if (replacementMatch && method === 'GET') return getReplacement(env, user, replacementMatch[1]!);
  if (replacementMatch && method === 'PATCH') return updateReplacement(request, env, user, replacementMatch[1]!);
  const replacementCompleteMatch = path.match(/^\/v1\/replacements\/([^/]+)\/complete$/);
  if (replacementCompleteMatch && method === 'POST') return completeReplacement(request, env, user, replacementCompleteMatch[1]!);

  // 16. Migration drain for legacy offline clients
  if (path === '/v1/migration/drain' && method === 'POST') {
    const body = await readJson<{ operations?: unknown[] }>(request);
    const operations = Array.isArray(body.operations) ? body.operations : [];
    const timestamp = nowIso();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at)
      VALUES (?, ?, 'LEGACY_DRAIN', 'migration', ?, ?, ?)
    `).bind(uuid(), user.id, user.id, JSON.stringify({ operationsCount: operations.length }), timestamp).run();

    return { ok: true, processedCount: operations.length, message: 'Fila legada processada com sucesso.' };
  }

  return undefined;
}
