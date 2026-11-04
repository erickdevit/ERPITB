import type { Entity, LocalRecord } from '../types';

export const conflictEntities: readonly Entity[] = [
  'laboratories',
  'courses',
  'classes',
  'class_teachers',
  'students',
  'enrollments',
  'attendance_records',
  'class_notes',
  'replacements',
];

export type RemoteConflictStatus = 'PENDING' | 'LOCAL_ACCEPTED' | 'REMOTE_ACCEPTED';
export type ConflictFilter = 'pending' | 'resolved' | 'rejected' | 'all';

export interface RemoteConflict {
  id: string;
  entity_name: string;
  entity_id: string;
  status: RemoteConflictStatus;
  created_at: string;
  local_data: Record<string, unknown> | null;
  remote_data: Record<string, unknown> | null;
  resolution_justification?: string | null;
  resolved_at?: string | null;
  resolved_by_name?: string | null;
}

export interface LocalConflict {
  entity: Entity;
  record: LocalRecord;
}

export interface ConflictView {
  remote: RemoteConflict[];
  local: LocalConflict[];
}

export function isConflictEntity(value: string): value is Entity {
  return conflictEntities.includes(value as Entity);
}

export function supportsLocalDecision(conflict: Pick<RemoteConflict, 'entity_name'>): boolean {
  return conflict.entity_name === 'attendance_records';
}

export function filterConflicts(
  remote: RemoteConflict[],
  local: LocalConflict[],
  query: string,
  filter: ConflictFilter,
): ConflictView {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const matches = (parts: unknown[]) => !term || parts.map(searchText).join(' ').toLocaleLowerCase('pt-BR').includes(term);

  const visibleRemote = remote.filter((conflict) => {
    const allowed = filter === 'all'
      || (filter === 'pending' && conflict.status === 'PENDING')
      || (filter === 'resolved' && conflict.status !== 'PENDING');
    return allowed && matches([
      conflict.id,
      conflict.entity_name,
      conflict.entity_id,
      conflict.status,
      conflict.created_at,
      conflict.resolution_justification,
      conflict.local_data,
      conflict.remote_data,
    ]);
  });

  const visibleLocal = local.filter(({ entity, record }) => {
    if (filter === 'resolved') return false;
    const allowed = filter === 'all'
      || (filter === 'pending' && record.sync_status === 'CONFLICT')
      || (filter === 'rejected' && record.sync_status === 'REJECTED');
    if (!allowed) return false;
    return matches([entity, record.id, record.sync_status, record.sync_error_code, record.sync_error_message, record]);
  });

  return { remote: visibleRemote, local: visibleLocal };
}

export function conflictCounts(remote: RemoteConflict[], local: LocalConflict[]) {
  return {
    pending: remote.filter((item) => item.status === 'PENDING').length + local.filter((item) => item.record.sync_status === 'CONFLICT').length,
    resolved: remote.filter((item) => item.status !== 'PENDING').length,
    rejected: local.filter((item) => item.record.sync_status === 'REJECTED').length,
    all: remote.length + local.length,
  };
}

export function safeJson(value: unknown): string {
  try { return JSON.stringify(value ?? null, null, 2); }
  catch { return 'Não foi possível exibir esta versão.'; }
}

function searchText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return safeJson(value);
  return String(value);
}
