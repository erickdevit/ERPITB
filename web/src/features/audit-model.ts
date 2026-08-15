import { entityLabels, type Entity, type SyncOperation } from '../types';

export type AuditSource = 'remote' | 'local';

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  userName: string;
  createdAt: string;
  details?: string;
  source: AuditSource;
}

const asString = (value: unknown): string => typeof value === 'string' ? value : '';

function readableDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readableDetailValue).filter(Boolean).join(', ');
  return '[dados estruturados]';
}

export function formatAuditDetails(value: unknown): string | undefined {
  let details = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '{}') return undefined;
    try { details = JSON.parse(trimmed) as unknown; } catch { return trimmed; }
  }
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    const readable = readableDetailValue(details);
    return readable || undefined;
  }
  const pairs = Object.entries(details as Record<string, unknown>)
    .map(([key, item]) => [key, readableDetailValue(item)] as const)
    .filter(([, item]) => item);
  return pairs.length ? pairs.map(([key, item]) => `${key}: ${item}`).join(' · ') : undefined;
}

export function normalizeRemoteAuditEntries(value: unknown): AuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const action = asString(row.action);
    const entity = asString(row.entity_name);
    const createdAt = asString(row.created_at);
    if (!action || !entity || !createdAt) return [];
    const entityId = asString(row.entity_id) || undefined;
    return [{
      id: asString(row.id) || `remote-${createdAt}-${index}`,
      action,
      entity,
      entityId,
      userName: asString(row.user_name) || 'Sistema',
      createdAt,
      details: formatAuditDetails(row.details_json),
      source: 'remote' as const,
    }];
  });
}

export function pendingOperationsToAuditEntries(operations: SyncOperation[]): AuditEntry[] {
  return [...operations]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 200)
    .map((operation) => ({
      id: `local-${operation.operationId}`,
      action: operation.action === 'delete' ? 'SYNC_LOCAL_DELETE' : 'SYNC_LOCAL',
      entity: operation.entity,
      entityId: operation.id,
      userName: 'Este dispositivo',
      createdAt: operation.updatedAt,
      details: 'Alteração aguardando envio',
      source: 'local' as const,
    }));
}

export function auditEntityLabel(entity: string): string {
  return entity in entityLabels ? entityLabels[entity as Entity] : entity;
}

export function filterAuditEntries(entries: AuditEntry[], search: string): AuditEntry[] {
  const term = search.trim().toLocaleLowerCase('pt-BR');
  if (!term) return entries;
  return entries.filter((entry) => [
    entry.action,
    entry.entity,
    auditEntityLabel(entry.entity),
    entry.entityId,
    entry.userName,
    entry.details,
  ].some((field) => field?.toLocaleLowerCase('pt-BR').includes(term)));
}
