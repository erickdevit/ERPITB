// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types';
import { StudentsPage } from './students-page';

const mocks = vi.hoisted(() => ({
  app: {
    session: { id: 'teacher-1', name: 'Professor', email: 'teacher@itb.test', role: 'professor' as Role },
    api: { get: vi.fn().mockResolvedValue({ items: [{ id: 'teacher-1', name: 'Professor', role: 'professor', active: 1 }] }) },
    store: { mutate: vi.fn().mockResolvedValue(undefined), moveStudent: vi.fn().mockResolvedValue(undefined) },
    sync: vi.fn().mockResolvedValue(undefined),
  },
  reload: vi.fn().mockResolvedValue(undefined),
  entities: {
    students: [{ id: 'student-1', name: 'Aluno Teste', registration_number: 'MAT-1', active: 1, created_at: '2026-01-10T12:00:00Z' }],
    classes: [{ id: 'class-1', name: 'Turma Web', active: 1 }],
    enrollments: [{ id: 'enrollment-1', student_id: 'student-1', class_id: 'class-1', status: 'ativa' }],
    class_teachers: [{ id: 'assignment-1', class_id: 'class-1', user_id: 'teacher-1' }],
    attendance_records: [{ id: 'attendance-1', student_id: 'student-1', class_id: 'class-1', date: '2026-08-01', status: 'P' }],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: mocks.reload }),
}));

describe('StudentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.app.session = { id: 'teacher-1', name: 'Professor', email: 'teacher@itb.test', role: 'professor' };
    mocks.app.api.get.mockResolvedValue({ items: [{ id: 'teacher-1', name: 'Professor', role: 'professor', active: 1 }] });
  });

  it('mantém professor em leitura e dentro das turmas atribuídas', () => {
    render(<MemoryRouter><StudentsPage /></MemoryRouter>);

    expect(screen.getByText(/somente os alunos das turmas atribuídas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aluno Teste' })).toHaveAttribute('href', '/alunos/student-1');
    expect(screen.queryByRole('button', { name: /Novo aluno/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Editar Aluno Teste/i)).not.toBeInTheDocument();
    expect(mocks.app.api.get).not.toHaveBeenCalled();
  });

  it('inativa por atualização para o pedagógico, sem expor exclusão', async () => {
    mocks.app.session = { id: 'staff-1', name: 'Pedagógico', email: 'staff@itb.test', role: 'pedagogico' };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<MemoryRouter><StudentsPage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /Novo aluno/i })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Inativar Aluno Teste/i));
    expect(screen.queryByLabelText(/Excluir Aluno Teste/i)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.app.store.mutate).toHaveBeenCalledWith('students', expect.objectContaining({ id: 'student-1', active: 0 })));
    confirm.mockRestore();
  });

  it('cadastra offline e vincula a turma pelo fluxo atômico de movimentação', async () => {
    mocks.app.session = { id: 'admin-1', name: 'Admin', email: 'admin@itb.test', role: 'admin' };
    const user = userEvent.setup();
    render(<MemoryRouter><StudentsPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /Novo aluno/i }));
    await user.type(screen.getByLabelText(/Nome completo/i), 'Novo Aluno');
    await user.type(screen.getByLabelText(/^Matrícula/i), 'MAT-2');
    await user.click(screen.getByRole('button', { name: /^Salvar$/i }));

    expect(mocks.app.store.mutate).toHaveBeenCalledWith('students', expect.objectContaining({ name: 'Novo Aluno', registration_number: 'MAT-2', active: 1 }));
    expect(mocks.app.store.moveStudent).toHaveBeenCalledWith(expect.any(String), 'class-1');
    expect(mocks.app.sync).toHaveBeenCalled();
  });
});
