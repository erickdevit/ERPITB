// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendancePage } from './attendance-page';

const mocks = vi.hoisted(() => {
  const reload = vi.fn().mockResolvedValue(undefined);
  return {
    reload,
    entities: {
      classes: [{ id: 'class-1', name: 'Turma A', course_id: 'course-1' }],
      courses: [{ id: 'course-1', name: 'Tecnologia' }],
      students: [{ id: 'student-1', name: 'Ana Souza', registration_number: '001', active: 1 }],
      enrollments: [{ id: 'enrollment-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' }],
      attendance_records: [],
      class_notes: [],
      replacements: [],
    } as Record<string, Array<Record<string, unknown>>>,
    store: {
      findAttendance: vi.fn().mockResolvedValue(undefined),
      mutateBatch: vi.fn().mockResolvedValue(undefined),
    },
    sync: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../app-context', () => ({
  useApp: () => ({
    store: mocks.store,
    sync: mocks.sync,
    session: { id: 'teacher-1', name: 'Professor', role: 'professor' },
  }),
}));

vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: mocks.reload }),
}));

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entities.attendance_records = [];
    mocks.entities.class_notes = [];
    mocks.entities.replacements = [];
  });

  it('keeps a draft, deselects on a second click and requires the integrated replacement dialog', async () => {
    const user = userEvent.setup();
    render(<AttendancePage today="2026-08-15" />);

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    const present = screen.getByRole('button', { name: 'P' });
    expect(present).toHaveAttribute('aria-pressed', 'true');
    await user.click(present);
    expect(present).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'R' }));
    const dialog = await screen.findByRole('dialog', { name: /Agendar reposição/i });
    fireEvent.change(within(dialog).getByLabelText(/Data da reposição/), { target: { value: '2026-08-20' } });
    fireEvent.change(within(dialog).getByLabelText(/Horário da reposição/), { target: { value: '09:30' } });
    await user.type(within(dialog).getByLabelText('Observação da reposição'), 'Reforço do conteúdo');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar reposição' }));

    expect(await screen.findByText('20/08/2026 às 09:30')).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));
    await user.click(screen.getByRole('button', { name: 'Salvar chamada' }));
    await waitFor(() => expect(mocks.store.mutateBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ entity: 'attendance_records', data: expect.objectContaining({ class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'R' }) }),
      expect.objectContaining({ entity: 'replacements', data: expect.objectContaining({ scheduled_date: '2026-08-20', scheduled_time: '09:30', notes: 'Reforço do conteúdo' }) }),
    ])));
    expect(mocks.sync).toHaveBeenCalledOnce();
  }, 10_000);

  it('searches by registration and exposes individual and general notes', async () => {
    const user = userEvent.setup();
    render(<AttendancePage today="2026-08-15" />);
    await screen.findByText('Ana Souza');

    await user.type(screen.getByLabelText('Buscar aluno na chamada'), '001');
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar aluno na chamada'));
    await user.type(screen.getByLabelText('Buscar aluno na chamada'), 'inexistente');
    expect(screen.getByText('Nenhum aluno corresponde à busca.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar aluno na chamada'));
    await user.click(screen.getByLabelText('Anotação de Ana Souza'));
    expect(screen.getByLabelText('Anotação do aluno')).toBeEnabled();
    expect(screen.getByLabelText('Observação geral da turma nesta chamada')).toBeEnabled();
  });

  it('renders an explanatory read-only state when a professor tries to open an old unsaved call', async () => {
    render(<AttendancePage today="2026-08-15" />);
    await screen.findByText('Ana Souza');
    fireEvent.change(screen.getByLabelText(/Data da chamada/), { target: { value: '2026-08-14' } });

    expect(await screen.findByText(/Uma chamada nova só pode ser aberta no dia da aula/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar chamada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'P' })).toBeDisabled();
    expect(screen.getByLabelText('Observação geral da turma nesta chamada')).toBeDisabled();
  });
});
