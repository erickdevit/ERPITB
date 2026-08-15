// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditPage } from './audit-page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn() },
  store: { pending: vi.fn() },
}));

vi.mock('../app-context', () => ({ useApp: () => ({ api: mocks.api, store: mocks.store }) }));

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.api.get.mockResolvedValue({ items: [{
      id: 'audit-1', action: 'UPDATE', entity_name: 'students', entity_id: 'student-123456789',
      user_name: 'Coordenação', created_at: '2026-08-15T10:00:00.000Z', details_json: '{"active":true}',
    }] });
    mocks.store.pending.mockResolvedValue([]);
  });

  it('loads 200 remote events and filters by user or entity', async () => {
    const user = userEvent.setup();
    render(<AuditPage />);

    expect(await screen.findByText('UPDATE')).toBeInTheDocument();
    expect(mocks.api.get).toHaveBeenCalledWith('/audit-logs?limit=200');
    expect(screen.getByText('Alunos')).toBeInTheDocument();
    expect(screen.getByText('Coordenação', { exact: false })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar evento, entidade ou usuário'), 'laboratório');
    expect(screen.getByText('Nenhum evento corresponde à busca.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar evento, entidade ou usuário'));
    await user.type(screen.getByLabelText('Buscar evento, entidade ou usuário'), 'coordenação');
    expect(screen.getByText('UPDATE')).toBeInTheDocument();
  });

  it('falls back to the local pending queue when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.store.pending.mockResolvedValue([{
      operationId: 'operation-1', entity: 'courses', action: 'delete', id: 'course-1', baseVersion: 3,
      updatedAt: '2026-08-15T11:00:00.000Z', data: { id: 'course-1', name: 'Privado' },
    }]);
    render(<AuditPage />);

    expect(await screen.findByText('SYNC_LOCAL_DELETE')).toBeInTheDocument();
    expect(screen.getByText('Fila local')).toBeInTheDocument();
    expect(screen.getByText(/Exibindo apenas alterações deste dispositivo/)).toBeInTheDocument();
    expect(screen.queryByText('Privado')).not.toBeInTheDocument();
    expect(mocks.api.get).not.toHaveBeenCalled();
  });

  it('refreshes the remote list on demand', async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText('UPDATE');
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledTimes(2));
  });

  it('keeps the remote failure visible while providing the safe local fallback', async () => {
    mocks.api.get.mockRejectedValue(new Error('Serviço temporariamente indisponível.'));
    render(<AuditPage />);

    expect(await screen.findByText(/Motivo: Serviço temporariamente indisponível/)).toBeInTheDocument();
    expect(screen.getByText('Não há alterações pendentes neste dispositivo.')).toBeInTheDocument();
  });
});
