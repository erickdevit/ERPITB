export type Role = 'admin' | 'pedagogico' | 'professor';
export type Entity = 'laboratories' | 'courses' | 'classes' | 'class_teachers' | 'students' | 'enrollments' | 'attendance_records' | 'class_notes' | 'replacements';
export type Action = 'upsert' | 'delete';
export type AttendanceStatus = 'P' | 'F' | 'J' | 'A' | 'R';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
}

export interface LocalRecord extends Record<string, unknown> {
  id: string;
  sync_version?: number;
  sync_status?: 'PENDING' | 'SYNCED' | 'CONFLICT';
  deleted_at?: string | null;
  updated_at?: string;
}

export interface SyncOperation {
  operationId: string;
  entity: Entity;
  action: Action;
  id: string;
  baseVersion: number;
  updatedAt: string;
  data: LocalRecord;
}

export const entityLabels: Record<Entity, string> = {
  laboratories: 'Laboratórios', courses: 'Cursos', classes: 'Turmas', class_teachers: 'Professores',
  students: 'Alunos', enrollments: 'Matrículas', attendance_records: 'Frequências', class_notes: 'Observações', replacements: 'Reposições',
};

export const roleLabel: Record<Role, string> = {
  admin: 'Administrador', pedagogico: 'Administrativo / Secretaria', professor: 'Professor',
};

export const canManage = (role: Role) => role !== 'professor';
