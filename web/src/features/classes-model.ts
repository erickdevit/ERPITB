import type { LocalRecord, Role, UserSession } from '../types';

export const classShifts = ['manha', 'tarde', 'noite', 'integral'] as const;
export const classWeekDays = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

export type ClassShift = typeof classShifts[number];

export interface ClassDraft {
  name: string;
  courseId: string;
  shift: string;
  weekDay: string;
  laboratoryId: string;
  teacherId: string;
  isKids: boolean;
  classNumber?: number;
}

export interface ClassTeacherView {
  id: string;
  name: string;
  email: string;
  assignmentId: string;
}

export interface ClassView {
  record: LocalRecord;
  id: string;
  name: string;
  classNumber?: number;
  displayName: string;
  courseId: string;
  courseName: string;
  shift: ClassShift | string;
  weekDay: string;
  laboratoryName: string;
  isKids: boolean;
  active: boolean;
  teachers: ClassTeacherView[];
}

export interface ClassPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssignTeachers: boolean;
  readOnly: boolean;
}

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const current = (record: LocalRecord) => !record.deleted_at;

export function extractClassNumber(name: string): number | undefined {
  const match = name.match(/\b0*(\d+)\b/);
  if (match && match[1]) {
    const n = parseInt(match[1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}

export function cleanClassName(name: string): string {
  const trimmed = name.trim();
  if (/^(?:turma\s*)?0*\d+$/i.test(trimmed)) {
    return 'Turma';
  }
  const stripped = trimmed
    .replace(/^(?:turma\s*)?0*\d+\s*[-–—:]\s*/i, '')
    .replace(/\s*[-–—:]\s*(?:turma\s*)?0*\d+$/i, '')
    .replace(/\s+0*\d+$/i, '')
    .trim();
  if (stripped.length >= 2) {
    return stripped;
  }
  if (stripped.length === 1) {
    return `Turma ${stripped}`;
  }
  return name;
}

export function formatClassDisplayName(classNumber?: number, name?: string): string {
  const safeName = name || 'Turma';
  if (classNumber !== undefined && classNumber !== null && classNumber > 0) {
    const formattedNum = String(classNumber).padStart(2, '0');
    return `#${formattedNum} - ${safeName}`;
  }
  return safeName;
}

export function permissionsForClasses(role: Role): ClassPermissions {
  return {
    canCreate: role === 'admin',
    canEdit: role === 'admin' || role === 'pedagogico',
    canDelete: role === 'admin',
    canAssignTeachers: role === 'admin' || role === 'pedagogico',
    readOnly: role === 'professor',
  };
}

export function buildClassViews(input: {
  classes?: LocalRecord[];
  courses?: LocalRecord[];
  laboratories?: LocalRecord[];
  assignments?: LocalRecord[];
  teachers?: LocalRecord[];
  session: Pick<UserSession, 'id' | 'name' | 'email' | 'role'>;
}): ClassView[] {
  const safeCourses = input.courses ?? [];
  const safeLaboratories = input.laboratories ?? [];
  const safeTeachers = input.teachers ?? [];
  const safeAssignments = input.assignments ?? [];
  const safeClasses = input.classes ?? [];

  const courses = new Map(safeCourses.filter(current).map((item) => [item.id, item]));
  const laboratories = new Map(safeLaboratories.filter(current).map((item) => [item.id, item]));
  const teachers = new Map(safeTeachers.map((item) => [item.id, item]));
  const assignments = safeAssignments.filter(current);
  const visibleClassIds = input.session.role === 'professor'
    ? new Set(assignments.filter((item) => item.user_id === input.session.id).map((item) => text(item, 'class_id')))
    : null;

  return safeClasses
    .filter(current)
    .filter((item) => !visibleClassIds || visibleClassIds.has(item.id))
    .map((record) => {
      const course = courses.get(text(record, 'course_id'));
      const laboratory = laboratories.get(text(record, 'laboratory_id'));
      const ownTeachers = assignments
        .filter((assignment) => assignment.class_id === record.id)
        .map((assignment) => {
          const teacherId = text(assignment, 'user_id');
          const directory = teachers.get(teacherId);
          const isSession = teacherId === input.session.id;
          return {
            id: teacherId,
            name: text(directory, 'name') || (isSession ? input.session.name : `Professor ${teacherId.slice(0, 8)}`),
            email: text(directory, 'email') || (isSession ? input.session.email : ''),
            assignmentId: assignment.id,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

      const rawName = text(record, 'name') || 'Turma sem nome';
      const parsedNum = extractClassNumber(rawName);
      const classNum = record.class_number !== undefined && record.class_number !== null
        ? Number(record.class_number)
        : parsedNum;
      const cleanName = cleanClassName(rawName);
      const displayName = formatClassDisplayName(classNum, cleanName);

      return {
        record,
        id: record.id,
        name: cleanName,
        classNumber: classNum,
        displayName,
        courseId: text(record, 'course_id'),
        courseName: text(course, 'name') || text(record, 'course_name') || 'Curso não informado',
        shift: text(record, 'shift'),
        weekDay: text(record, 'week_day'),
        laboratoryName: text(laboratory, 'name') || text(record, 'laboratory_name'),
        isKids: record.is_kids === 1 || record.is_kids === true,
        active: record.active !== 0 && record.active !== false,
        teachers: ownTeachers,
      };
    })
    .sort((left, right) => {
      const numA = left.classNumber ?? 999999;
      const numB = right.classNumber ?? 999999;
      if (numA !== numB) return numA - numB;
      return left.courseName.localeCompare(right.courseName, 'pt-BR') || left.name.localeCompare(right.name, 'pt-BR');
    });
}

export function filterClassViews(rows: ClassView[], query: string, teacherId: string): ClassView[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  return rows.filter((row) => (!normalized || `${row.displayName} ${row.name} ${row.courseName}`.toLocaleLowerCase('pt-BR').includes(normalized))
    && (!teacherId || row.teachers.some((teacher) => teacher.id === teacherId)));
}

export function validateClassDraft(draft: ClassDraft, availableCourseIds: ReadonlySet<string>): string | undefined {
  const name = draft.name.trim();
  if (name.length < 2) return 'Informe um nome de turma com pelo menos 2 caracteres.';
  if (name.length > 120) return 'O nome da turma deve ter no máximo 120 caracteres.';
  if (!availableCourseIds.has(draft.courseId)) return 'Selecione um curso válido.';
  if (!classShifts.includes(draft.shift as ClassShift)) return 'Selecione um turno válido.';
  if (draft.weekDay && !classWeekDays.includes(draft.weekDay as typeof classWeekDays[number])) return 'Selecione um dia da semana válido.';
  return undefined;
}

export type TeacherTogglePlan =
  | { kind: 'none' }
  | { kind: 'upsert'; record?: LocalRecord }
  | { kind: 'delete'; record: LocalRecord }
  | { kind: 'error'; message: string };

export function planTeacherToggle(assignments: LocalRecord[], classId: string, teacherId: string, checked: boolean, activeTeacherIds?: ReadonlySet<string>): TeacherTogglePlan {
  const matching = assignments.find((item) => item.class_id === classId && item.user_id === teacherId);
  const active = assignments.filter((item) => item.class_id === classId && !item.deleted_at
    && (!activeTeacherIds || activeTeacherIds.has(text(item, 'user_id'))));
  if (checked) return matching && !matching.deleted_at ? { kind: 'none' } : { kind: 'upsert', record: matching };
  if (!matching || matching.deleted_at) return { kind: 'none' };
  if (active.length <= 1) return { kind: 'error', message: 'A turma deve manter ao menos um professor ativo.' };
  return { kind: 'delete', record: matching };
}

export function shiftLabel(value: string): string {
  return ({ manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', integral: 'Integral' } as Record<string, string>)[value] ?? (value || 'Não informado');
}
