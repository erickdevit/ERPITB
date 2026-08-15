// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './users-page';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), request: vi.fn(), post: vi.fn() },
  session: { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin' as const },
}));

vi.mock('../app-context', () => ({ useApp: () => ({ api: mocks.api, session: mocks.session }) }));

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ items: [
      { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin', active: 1, created_at: '2026-01-01' },
      { id: 'staff-1', name: 'Secretaria', email: 'staff@itb.test', role: 'pedagogico', active: 1, created_at: '2026-01-01' },
    ] });
    mocks.api.request.mockResolvedValue({ ok: true });
  });

  it('loads, filters and inactivates a non-professor account', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<UsersPage />);

    expect(await screen.findByText('Secretaria')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar nome ou e-mail'), 'secretaria');
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Inativar Secretaria'));

    await waitFor(() => expect(mocks.api.request).toHaveBeenCalledWith('/users/staff-1', 'DELETE'));
    expect(screen.queryByLabelText('Inativar Admin')).not.toBeInTheDocument();
    confirm.mockRestore();
  });
});
