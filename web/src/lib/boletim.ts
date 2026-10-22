import type { LocalRecord } from '../types';
import { latestAttendance } from './attendance';
import {
  buildClassGradeSummary,
  calculationModeLabel,
  computeTableAverage,
  roundGrade,
  type CalculationMode,
  type GradeStatus,
} from './grades';

export const MIN_ATTENDANCE_RATE = 75.0;
export const MIN_PASSING_GRADE = 6.0;

export function formatDatePt(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatTablePeriod(startDate?: unknown, endDate?: unknown): string {
  const sd = typeof startDate === 'string' ? startDate.trim() : '';
  const ed = typeof endDate === 'string' ? endDate.trim() : '';
  if (sd && ed) return `${formatDatePt(sd)} a ${formatDatePt(ed)}`;
  if (sd) return `Início: ${formatDatePt(sd)}`;
  if (ed) return `Fim: ${formatDatePt(ed)}`;
  return '';
}

export interface BoletimStudentInfo {
  id: string;
  name: string;
  registrationNumber: string;
  courseName: string;
  courseId: string;
  classNames: string[];
}

export type AcademicStatus =
  | 'Aprovado'
  | 'Reprovado por Nota'
  | 'Reprovado por Frequência'
  | 'Reprovado por Nota e Frequência'
  | 'Em Andamento'
  | 'Sem Notas';

export interface BoletimModuleRow {
  moduleId: string;
  moduleName: string;
  className: string;
  classesHeld: number;
  presences: number;
  absences: number;
  justified: number;
  attendanceRate: number; // 0 to 100
  calculationMode?: CalculationMode;
  calculationModeLabel?: string;
  grades: { name: string; score: number | null; maxScore: number; weight?: number; category?: string }[];
  finalGrade: number | null; // 0 to 10 scale
  academicStatus: AcademicStatus;
}

export interface UnifiedBoletimData {
  student: BoletimStudentInfo;
  issueDate: string; // ISO date string or formatted date
  modules: BoletimModuleRow[];
  overallAttendanceRate: number; // 0 to 100
  overallGpa: number | null; // 0 to 10 scale
  overallAcademicStatus: AcademicStatus;
  criteria: {
    minAttendanceRate: number; // 75%
    minPassingGrade: number; // 6.0
  };
}

export interface ClassBoletimTableCol {
  id: string;
  name: string;
  calculationMode: CalculationMode;
  calculationModeLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  periodLabel?: string | null;
  passingGrade: number;
}

export interface ClassBoletimStudentRow {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  tableResults: Array<{
    tableId: string;
    average: number | null;
    evaluatedCount: number;
    totalItems: number;
    status: GradeStatus;
    statusLabel: string;
  }>;
  overallAverage: number | null;
  attendanceRate: number | null;
  attendanceRateLabel: string;
  overallStatus: GradeStatus;
  overallStatusLabel: string;
}

export interface ClassBoletimData {
  classId: string;
  className: string;
  courseName?: string;
  tables: ClassBoletimTableCol[];
  students: ClassBoletimStudentRow[];
  classAverage: number | null;
  approvedCount: number;
  totalStudents: number;
  issueDate?: string;
}

export function buildUnifiedBoletimData(params: {
  studentId: string;
  classId?: string;
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classes: LocalRecord[];
  courses: LocalRecord[];
  attendanceRecords: LocalRecord[];
  gradeTables: LocalRecord[];
  gradeItems: LocalRecord[];
  studentGrades: LocalRecord[];
}): UnifiedBoletimData | null {
  if (!params || !params.studentId || !Array.isArray(params.students)) {
    return null;
  }

  const student = (params.students ?? []).find(
    (s) => s.id === params.studentId && !s.deleted_at
  );
  if (!student) {
    return null;
  }

  const enrollments = (params.enrollments ?? []).filter((e) => !e.deleted_at);
  const allClasses = (params.classes ?? []).filter((c) => !c.deleted_at);
  const allCourses = (params.courses ?? []).filter((c) => !c.deleted_at);
  const allAttendance = (params.attendanceRecords ?? []).filter((a) => !a.deleted_at);
  const allGradeTables = (params.gradeTables ?? []).filter((t) => !t.deleted_at);
  const allGradeItems = (params.gradeItems ?? []).filter((i) => !i.deleted_at);
  const allStudentGrades = (params.studentGrades ?? []).filter((g) => !g.deleted_at);

  let targetClasses: LocalRecord[] = [];

  if (params.classId) {
    const requestedClass = allClasses.find((c) => c.id === params.classId);
    if (!requestedClass) {
      return null;
    }

    const studentEnrollmentsInSystem = enrollments.filter((e) => e.student_id === student.id);
    const hasClassEnrollment = studentEnrollmentsInSystem.some((e) => e.class_id === requestedClass.id);
    const hasClassAttendance = allAttendance.some((a) => a.student_id === student.id && a.class_id === requestedClass.id);
    const hasClassGrades = allStudentGrades.some((g) => g.student_id === student.id && g.class_id === requestedClass.id);

    // If student has enrollments registered in the system, but none for the requested class and no activity in it
    if (studentEnrollmentsInSystem.length > 0 && !hasClassEnrollment && !hasClassAttendance && !hasClassGrades) {
      return null;
    }

    targetClasses = [requestedClass];
  } else {
    const studentClassIds = new Set<string>();
    for (const e of enrollments) {
      if (e.student_id === student.id && e.class_id) {
        studentClassIds.add(String(e.class_id));
      }
    }
    for (const a of allAttendance) {
      if (a.student_id === student.id && a.class_id) {
        studentClassIds.add(String(a.class_id));
      }
    }
    for (const g of allStudentGrades) {
      if (g.student_id === student.id && g.class_id) {
        studentClassIds.add(String(g.class_id));
      }
    }

    targetClasses = allClasses.filter((c) => studentClassIds.has(c.id));
    if (targetClasses.length === 0) {
      return null;
    }
    targetClasses.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  }

  // Deduplicate attendance canonically using latestAttendance
  const deduplicatedAttendance = latestAttendance(allAttendance);
  const studentAttendance = deduplicatedAttendance.filter((a) => a.student_id === student.id);

  // Primary course metadata
  const primaryCourseId = targetClasses[0]?.course_id ? String(targetClasses[0].course_id) : '';
  const primaryCourse = allCourses.find((c) => c.id === primaryCourseId);
  const courseName = primaryCourse ? String(primaryCourse.name ?? '') : 'Curso não informado';

  const studentInfo: BoletimStudentInfo = {
    id: student.id,
    name: String(student.name ?? student.encrypted_name ?? 'Aluno não informado'),
    registrationNumber: String(student.registration_number ?? student.registrationNumber ?? '—'),
    courseName,
    courseId: primaryCourseId,
    classNames: targetClasses.map((c) => String(c.name ?? '')),
  };

  const modules: BoletimModuleRow[] = [];

  for (const classRecord of targetClasses) {
    const classAttendance = studentAttendance.filter((a) => a.class_id === classRecord.id);
    const classTables = allGradeTables
      .filter((t) => t.class_id === classRecord.id)
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

    if (classTables.length === 0) {
      // Class has no grade tables defined
      const classesHeld = classAttendance.length;
      const presences = classAttendance.filter((a) => a.status === 'P' || a.status === 'RC').length;
      const absences = classAttendance.filter((a) => a.status === 'F' || a.status === 'R').length;
      const justified = classAttendance.filter((a) => a.status === 'J').length;
      const attendanceRate = classesHeld > 0 ? Math.round((presences / classesHeld) * 1000) / 10 : 100.0;

      modules.push({
        moduleId: classRecord.id,
        moduleName: String(classRecord.name ?? 'Geral'),
        className: String(classRecord.name ?? ''),
        classesHeld,
        presences,
        absences,
        justified,
        attendanceRate,
        grades: [],
        finalGrade: null,
        academicStatus: 'Sem Notas',
      });
      continue;
    }

    for (const table of classTables) {
      let moduleAttendance = classAttendance;
      if (table.start_date) {
        moduleAttendance = moduleAttendance.filter((a) => String(a.date) >= String(table.start_date));
      }
      if (table.end_date) {
        moduleAttendance = moduleAttendance.filter((a) => String(a.date) <= String(table.end_date));
      }

      const classesHeld = moduleAttendance.length;
      const presences = moduleAttendance.filter((a) => a.status === 'P' || a.status === 'RC').length;
      const absences = moduleAttendance.filter((a) => a.status === 'F' || a.status === 'R').length;
      const justified = moduleAttendance.filter((a) => a.status === 'J').length;
      const attendanceRate = classesHeld > 0 ? Math.round((presences / classesHeld) * 1000) / 10 : 100.0;

      const tableItems = allGradeItems
        .filter((item) => item.grade_table_id === table.id)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

      const grades = tableItems.map((item) => {
        const studentGrade = allStudentGrades.find(
          (g) => g.grade_item_id === item.id && g.student_id === student.id
        );
        const rawScore = studentGrade?.score !== null && studentGrade?.score !== undefined && studentGrade?.score !== ''
          ? Number(studentGrade.score)
          : null;
        const score = rawScore !== null && !Number.isNaN(rawScore) ? rawScore : null;
        const maxScore = Number(item.max_score ?? 10) || 10;
        const weight = Number(item.weight ?? 1) || 1;

        return {
          name: String(item.name ?? ''),
          score,
          maxScore,
          weight,
        };
      });

      const calculationMode = (['simple', 'weighted', 'sum'].includes(String(table.calculation_mode))
        ? String(table.calculation_mode)
        : 'simple') as CalculationMode;

      const finalGrade = tableItems.length > 0
        ? computeTableAverage(
            calculationMode,
            grades.map((g) => ({ score: g.score, maxScore: g.maxScore, weight: g.weight ?? 1 }))
          )
        : null;

      const passingGrade = Number(table.passing_grade ?? MIN_PASSING_GRADE) || MIN_PASSING_GRADE;

      let academicStatus: AcademicStatus;
      if (tableItems.length === 0) {
        academicStatus = 'Sem Notas';
      } else if (grades.some((g) => g.score === null)) {
        // Partial pending evaluations
        academicStatus = 'Em Andamento';
      } else {
        const attendancePass = attendanceRate >= MIN_ATTENDANCE_RATE;
        const gradePass = finalGrade !== null && finalGrade >= passingGrade;

        if (attendancePass && gradePass) {
          academicStatus = 'Aprovado';
        } else if (attendancePass && !gradePass) {
          academicStatus = 'Reprovado por Nota';
        } else if (!attendancePass && gradePass) {
          academicStatus = 'Reprovado por Frequência';
        } else {
          academicStatus = 'Reprovado por Nota e Frequência';
        }
      }

      modules.push({
        moduleId: table.id,
        moduleName: String(table.name ?? 'Módulo'),
        className: String(classRecord.name ?? ''),
        classesHeld,
        presences,
        absences,
        justified,
        attendanceRate,
        calculationMode,
        calculationModeLabel: calculationModeLabel(calculationMode),
        grades,
        finalGrade,
        academicStatus,
      });
    }
  }

  const totalClassesHeld = modules.reduce((sum, m) => sum + m.classesHeld, 0);
  const totalPresences = modules.reduce((sum, m) => sum + m.presences, 0);
  const overallAttendanceRate = totalClassesHeld > 0
    ? Math.round((totalPresences / totalClassesHeld) * 1000) / 10
    : 100.0;

  const modulesWithGrade = modules.filter((m) => m.finalGrade !== null);
  const overallGpa = modulesWithGrade.length > 0
    ? roundGrade(modulesWithGrade.reduce((sum, m) => sum + (m.finalGrade as number), 0) / modulesWithGrade.length)
    : null;

  let overallAcademicStatus: AcademicStatus;
  if (modules.length === 0 || modules.every((m) => m.academicStatus === 'Sem Notas')) {
    overallAcademicStatus = 'Sem Notas';
  } else if (modules.some((m) => m.academicStatus === 'Em Andamento' || m.academicStatus === 'Sem Notas')) {
    overallAcademicStatus = 'Em Andamento';
  } else {
    const hasGradeFail = modules.some(
      (m) => m.academicStatus === 'Reprovado por Nota' || m.academicStatus === 'Reprovado por Nota e Frequência'
    ) || (overallGpa === null || overallGpa < MIN_PASSING_GRADE);

    const hasFreqFail = modules.some(
      (m) => m.academicStatus === 'Reprovado por Frequência' || m.academicStatus === 'Reprovado por Nota e Frequência'
    ) || overallAttendanceRate < MIN_ATTENDANCE_RATE;

    if (hasGradeFail && hasFreqFail) {
      overallAcademicStatus = 'Reprovado por Nota e Frequência';
    } else if (hasGradeFail) {
      overallAcademicStatus = 'Reprovado por Nota';
    } else if (hasFreqFail) {
      overallAcademicStatus = 'Reprovado por Frequência';
    } else {
      overallAcademicStatus = 'Aprovado';
    }
  }

  return {
    student: studentInfo,
    issueDate: new Date().toISOString(),
    modules,
    overallAttendanceRate,
    overallGpa,
    overallAcademicStatus,
    criteria: {
      minAttendanceRate: MIN_ATTENDANCE_RATE,
      minPassingGrade: MIN_PASSING_GRADE,
    },
  };
}

export function buildClassBoletimData(params: {
  classId: string;
  classes: LocalRecord[];
  courses?: LocalRecord[];
  gradeTables: LocalRecord[];
  gradeItems: LocalRecord[];
  studentGrades: LocalRecord[];
  students: LocalRecord[];
  enrollments: LocalRecord[];
  attendanceRecords: LocalRecord[];
}): ClassBoletimData | null {
  if (!params || !params.classId) return null;
  const classRecord = (params.classes ?? []).find(
    (c) => c.id === params.classId && !c.deleted_at && c.active !== 0 && c.active !== false
  );
  if (!classRecord) return null;

  const courses = params.courses ?? [];
  const course = courses.find((c) => c.id === classRecord.course_id && !c.deleted_at);
  const courseName = course ? String(course.name ?? '') : 'Curso não informado';

  const enrollments = (params.enrollments ?? []).filter(
    (e) => !e.deleted_at && e.status === 'ativa' && e.class_id === classRecord.id
  );
  const studentIds = new Set(enrollments.map((e) => String(e.student_id)));

  const activeStudents = (params.students ?? [])
    .filter((s) => !s.deleted_at && s.active !== 0 && s.active !== false && studentIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? s.encrypted_name ?? 'Aluno não informado'),
      registrationNumber: String(s.registration_number ?? s.registrationNumber ?? '—'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = buildClassGradeSummary({
    classId: classRecord.id,
    tables: params.gradeTables ?? [],
    items: params.gradeItems ?? [],
    studentGrades: params.studentGrades ?? [],
    students: activeStudents,
  });

  const dedupedAttendance = latestAttendance(params.attendanceRecords ?? []);
  const classAttendance = dedupedAttendance.filter((a) => !a.deleted_at && a.class_id === classRecord.id);

  const studentAttendanceRate = new Map<string, number>();
  for (const s of activeStudents) {
    const studentRecords = classAttendance.filter((a) => a.student_id === s.id);
    const present = studentRecords.filter((a) => a.status === 'P' || a.status === 'RC').length;
    if (studentRecords.length > 0) {
      const rate = Math.round((present / studentRecords.length) * 1000) / 10;
      studentAttendanceRate.set(s.id, rate);
    }
  }

  const tables: ClassBoletimTableCol[] = summary.tables.map((t) => {
    const mode = (['simple', 'weighted', 'sum'].includes(String(t.calculation_mode))
      ? String(t.calculation_mode)
      : 'simple') as CalculationMode;
    return {
      id: t.id,
      name: String(t.name ?? 'Etapa'),
      calculationMode: mode,
      calculationModeLabel: calculationModeLabel(mode),
      startDate: t.start_date ? String(t.start_date) : null,
      endDate: t.end_date ? String(t.end_date) : null,
      periodLabel: formatTablePeriod(t.start_date, t.end_date) || null,
      passingGrade: Number(t.passing_grade ?? 6) || 6,
    };
  });

  const students: ClassBoletimStudentRow[] = summary.studentSummaries.map((s) => {
    const attRate = studentAttendanceRate.get(s.studentId);
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      registrationNumber: s.registrationNumber,
      tableResults: s.tableResults,
      overallAverage: s.overallAverage,
      attendanceRate: attRate ?? null,
      attendanceRateLabel: attRate !== null && attRate !== undefined ? `${attRate.toFixed(1).replace('.', ',')}%` : '—',
      overallStatus: s.overallStatus,
      overallStatusLabel: s.overallStatusLabel,
    };
  });

  return {
    classId: classRecord.id,
    className: String(classRecord.name ?? ''),
    courseName,
    tables,
    students,
    classAverage: summary.classAverage,
    approvedCount: summary.approvedCount,
    totalStudents: activeStudents.length,
    issueDate: new Date().toISOString(),
  };
}
