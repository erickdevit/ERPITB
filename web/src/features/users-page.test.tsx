// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './users-page';

const mocks = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    request: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  session: { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin' as const },
  entities: {
    classes: [{ id: 'class-1', name: 'Turma A' }],
    class_teachers: [{ id: 'ct-1', class_id: 'class-1', user_id: 'prof-1', deleted_at: null }],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => ({ api: mocks.api, session: mocks.session }) }));
vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false }),
}));

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({
      items: [
        { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin', active: 1, created_at: '2026-01-01' },
        { id: 'staff-1', name: 'Secretaria', email: 'staff@itb.test', role: 'pedagogico', active: 1, created_at: '2026-01-01' },
        { id: 'prof-1', name: 'Prof Carlos', email: 'carlos@itb.test', role: 'professor', active: 1, created_at: '2026-01-01' },
      ],
    });
    mocks.api.patch.mockResolvedValue({ ok: true });
    mocks.api.delete.mockResolvedValue({ ok: true });
    mocks.api.post.mockResolvedValue({ ok: true });
  });

  it('loads, filters and toggles active/inactive state', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<UsersPage />);

    expect(await screen.findByText('Secretaria')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar nome ou e-mail'), 'secretaria');
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Inativar Secretaria'));

    await waitFor(() => expect(mocks.api.patch).toHaveBeenCalledWith('/users/staff-1', { active: 0 }));
    expect(screen.queryByLabelText('Inativar Admin')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('opens edit modal and saves updated user data', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    expect(await screen.findByText('Secretaria')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Editar Secretaria'));

    expect(screen.getByRole('heading', { name: 'Editar usuário' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Nome completo/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Secretaria Atualizada');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocks.api.patch).toHaveBeenCalledWith('/users/staff-1', {
        name: 'Secretaria Atualizada',
        email: 'staff@itb.test',
        role: 'pedagogico',
        active: 1,
        password: undefined,
      }),
    );
  });

  it('allows deleting an unassigned user after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<UsersPage />);

    expect(await screen.findByText('Secretaria')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Excluir Secretaria'));

    await waitFor(() => expect(mocks.api.delete).toHaveBeenCalledWith('/users/staff-1'));
    confirm.mockRestore();
  });

  it('blocks deleting a user assigned to a class', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<UsersPage />);

    expect(await screen.findByText('Prof Carlos')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Excluir Prof Carlos'));

    expect(alert).toHaveBeenCalledWith(
      expect.stringContaining('vinculado à(s) seguinte(s) turma(s)'),
    );
    expect(mocks.api.delete).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
