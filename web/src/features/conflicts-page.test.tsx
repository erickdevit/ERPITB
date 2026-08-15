// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConflictsPage } from './conflicts-page';

const mocks = vi.hoisted(() => {
  const conflict = {
    id: 'conflict-1', entity_name: 'attendance_records', entity_id: 'attendance-1', status: 'PENDING',
    created_at: '2026-08-15T10:00:00.000Z', local_data: { id: 'attendance-1', status: 'F' }, remote_data: { id: 'attendance-1', status: 'P' },
  };
  return {
    conflict,
    api: {
      get: vi.fn().mockResolvedValue({ items: [conflict] }),
      post: vi.fn().mockResolvedValue({ entity: 'attendance_records', record: { id: 'attendance-1', status: 'P', sync_version: 4 } }),
    },
    store: { list: vi.fn().mockResolvedValue([]), putRemote: vi.fn().mockResolvedValue(undefined) },
    sync: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../app-context', () => ({
  useApp: () => ({ api: mocks.api, store: mocks.store, sync: mocks.sync, refresh: 0 }),
}));

describe('ConflictsPage', () => {
  it('resolves a remote conflict and applies the canonical server response locally', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const user = userEvent.setup();
    render(<ConflictsPage />);
    expect(await screen.findByText(/Frequências · attendance-1/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver conflito' });
    await user.type(within(dialog).getByRole('textbox'), 'Conferido com a coordenação.');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar decisão' }));

    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/conflicts/conflict-1/resolve', {
      decision: 'remote', justification: 'Conferido com a coordenação.',
    }));
    expect(mocks.store.putRemote).toHaveBeenCalledWith('attendance_records', {
      id: 'attendance-1', status: 'P', sync_version: 4, sync_status: 'SYNCED',
    });
  });
});
