import { describe, expect, it } from 'vitest';
import type { SyncOperation } from '../types';
import {
  filterAuditEntries,
  formatAuditDetails,
  normalizeRemoteAuditEntries,
  pendingOperationsToAuditEntries,
} from './audit-model';

describe('audit model', () => {
  it('normalizes valid server rows and ignores malformed rows', () => {
    const entries = normalizeRemoteAuditEntries([
      {
        id: 'audit-1', action: 'UPDATE', entity_name: 'students', entity_id: 'student-1',
        user_name: 'Coordenação', created_at: '2026-08-15T10:00:00.000Z', details_json: '{"active":false,"reason":"transferência"}',
      },
      { id: 'invalid', action: 'UPDATE' },
      null,
    ]);
    expect(entries).toEqual([expect.objectContaining({
      id: 'audit-1', action: 'UPDATE', entity: 'students', entityId: 'student-1', userName: 'Coordenação', source: 'remote',
      details: 'active: não · reason: transferência',
    })]);
  });

  it('builds a privacy-preserving local summary without entity payloads', () => {
    const operation: SyncOperation = {
      operationId: 'operation-1', entity: 'students', action: 'upsert', id: 'student-1', baseVersion: 0,
      updatedAt: '2026-08-15T12:00:00.000Z', data: { id: 'student-1', name: 'Dado que não deve aparecer', cpf: '00000000000' },
    };
    const [entry] = pendingOperationsToAuditEntries([operation]);
    expect(entry).toEqual({
      id: 'local-operation-1', action: 'SYNC_LOCAL', entity: 'students', entityId: 'student-1',
      userName: 'Este dispositivo', createdAt: operation.updatedAt, details: 'Alteração aguardando envio', source: 'local',
    });
    expect(JSON.stringify(entry)).not.toContain('00000000000');
  });

  it('searches action, translated entity, user, id, and details', () => {
    const entries = normalizeRemoteAuditEntries([{ id: '1', action: 'LOGIN', entity_name: 'users', entity_id: 'admin-1', user_name: 'Erick', created_at: '2026-08-15T10:00:00Z', details_json: '{"device":"Chrome"}' }]);
    expect(filterAuditEntries(entries, 'login')).toHaveLength(1);
    expect(filterAuditEntries(entries, 'erick')).toHaveLength(1);
    expect(filterAuditEntries(entries, 'admin-1')).toHaveLength(1);
    expect(filterAuditEntries(entries, 'chrome')).toHaveLength(1);
    expect(filterAuditEntries(entries, 'inexistente')).toHaveLength(0);
  });

  it('formats plain and structured details defensively', () => {
    expect(formatAuditDetails('{}')).toBeUndefined();
    expect(formatAuditDetails('Texto legado')).toBe('Texto legado');
    expect(formatAuditDetails({ nested: { secret: true }, count: 2 })).toBe('nested: [dados estruturados] · count: 2');
  });
});
