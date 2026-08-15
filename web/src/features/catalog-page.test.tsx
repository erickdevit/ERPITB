// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types';
import { CoursesPage } from './catalog-page';

const mocks = vi.hoisted(() => ({
  app: {
    session: { id: 'staff-1', name: 'Secretaria', email: 'staff@itb.test', role: 'pedagogico' as Role },
    store: { mutate: vi.fn().mockResolvedValue(undefined) },
    sync: vi.fn().mockResolvedValue(undefined),
  },
  reload: vi.fn().mockResolvedValue(undefined),
  entities: {
    courses: [{ id: 'course-1', code: 'TEC', name: 'Tecnologia', active: 1, created_at: '2026-01-01T00:00:00Z' }],
    classes: [],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: mocks.reload }),
}));

describe('CoursesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.app.session = { id: 'staff-1', name: 'Secretaria', email: 'staff@itb.test', role: 'pedagogico' };
    mocks.entities.classes = [];
  });

  it('allows pedagogical staff to edit but not create or delete', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CoursesPage /></MemoryRouter>);

    expect(screen.queryByRole('button', { name: 'Novo curso' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Excluir Tecnologia')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Editar Tecnologia'));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(/Nome/);
    await user.clear(name);
    await user.type(name, 'Tecnologia Aplicada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.app.store.mutate).toHaveBeenCalledWith('courses', expect.objectContaining({ id: 'course-1', name: 'Tecnologia Aplicada' })));
  });

  it('allows an administrator to create a course offline', async () => {
    mocks.app.session = { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin' };
    const user = userEvent.setup();
    render(<MemoryRouter><CoursesPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Novo curso' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Código/), 'ADM');
    await user.type(within(dialog).getByLabelText(/Nome/), 'Administração');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mocks.app.store.mutate).toHaveBeenCalledWith('courses', expect.objectContaining({ code: 'ADM', name: 'Administração', active: 1 }));
    expect(mocks.app.sync).toHaveBeenCalled();
  });
});
