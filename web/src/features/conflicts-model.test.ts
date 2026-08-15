import { describe, expect, it } from 'vitest';
import { conflictCounts, filterConflicts, safeJson, supportsLocalDecision, type LocalConflict, type RemoteConflict } from './conflicts-model';

const remote: RemoteConflict[] = [
  {
    id: 'conflict-1', entity_name: 'attendance_records', entity_id: 'attendance-1', status: 'PENDING', created_at: '2026-08-15T10:00:00Z',
    local_data: { status: 'F', notes: 'Ausente' }, remote_data: { status: 'P' },
  },
  {
    id: 'conflict-2', entity_name: 'students', entity_id: 'student-1', status: 'REMOTE_ACCEPTED', created_at: '2026-08-14T10:00:00Z',
    local_data: { registration_number: 'ITB-42' }, remote_data: { registration_number: 'ITB-42' }, resolution_justification: 'Cadastro do servidor validado.',
  },
];

const local: LocalConflict[] = [
  { entity: 'students', record: { id: 'student-rejected', name: 'Ana', sync_status: 'REJECTED', sync_error_code: 'DUPLICATE', sync_error_message: 'Matrícula já cadastrada.' } },
  { entity: 'attendance_records', record: { id: 'attendance-1', status: 'F', sync_status: 'CONFLICT' } },
];

describe('conflicts model', () => {
  it('separa pendências remotas, resolvidos e rejeições locais', () => {
    expect(filterConflicts(remote, local, '', 'pending')).toEqual({ remote: [remote[0]], local: [local[1]] });
    expect(filterConflicts(remote, local, '', 'resolved')).toEqual({ remote: [remote[1]], local: [] });
    expect(filterConflicts(remote, local, '', 'rejected')).toEqual({ remote: [], local: [local[0]] });
    expect(conflictCounts(remote, local)).toEqual({ pending: 2, resolved: 1, rejected: 1, all: 4 });
  });

  it('busca por entidade, conteúdo das versões e motivo de rejeição', () => {
    expect(filterConflicts(remote, local, 'ausente', 'all').remote).toEqual([remote[0]]);
    expect(filterConflicts(remote, local, 'matrícula já', 'all').local).toEqual([local[0]]);
    expect(filterConflicts(remote, local, 'sem resultado', 'all')).toEqual({ remote: [], local: [] });
  });

  it('restringe a decisão local ao tipo suportado pelo backend', () => {
    expect(supportsLocalDecision(remote[0])).toBe(true);
    expect(supportsLocalDecision(remote[1])).toBe(false);
  });

  it('serializa valores nulos sem quebrar a comparação', () => {
    expect(safeJson(null)).toBe('null');
    expect(safeJson({ status: 'P' })).toContain('"status": "P"');
  });
});
