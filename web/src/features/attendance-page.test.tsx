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
      classes: [
        { id: 'class-1', name: 'Turma A', course_id: 'course-1' },
        { id: 'class-2', name: 'Turma B', course_id: 'course-1' },
      ],
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
    api: {
      lockStudentEnrollment: vi.fn().mockResolvedValue({ ok: true }),
      unlockStudentEnrollment: vi.fn().mockResolvedValue({ ok: true }),
      transferStudentEnrollment: vi.fn().mockResolvedValue({ ok: true }),
      getClassSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    },
  };
});

vi.mock('../app-context', () => ({
  useApp: () => ({
    store: mocks.store,
    sync: mocks.sync,
    api: mocks.api,
    session: { id: 'teacher-1', name: 'Professor', role: 'professor' },
  }),
}));

vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: mocks.reload }),
}));

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entities.students = [{ id: 'student-1', name: 'Ana Souza', registration_number: '001', active: 1 }];
    mocks.entities.enrollments = [{ id: 'enrollment-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' }];
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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

  it('searches the unenrolled student list when adding a student to the class', async () => {
    const user = userEvent.setup();
    mocks.entities.students = [
      { id: 'student-1', name: 'Ana Souza', registration_number: '001', active: 1 },
      { id: 'student-2', name: 'Bruno Lima', registration_number: '002', active: 1 },
    ];
    render(<AttendancePage today="2026-08-15" />);

    await screen.findByText('Ana Souza');
    await user.selectOptions(screen.getByLabelText('Turma'), 'class-1');
    await user.click(screen.getByRole('button', { name: 'Incluir aluno na turma' }));
    await screen.findByText('Aluno já cadastrado');
    const searchInput = screen.getByPlaceholderText('Buscar por nome ou matrícula...');
    await user.type(searchInput, '002');

    expect(screen.getByRole('option', { name: /Bruno Lima/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ana Souza/ })).not.toBeInTheDocument();
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

  it('allows locking an active enrollment directly from the attendance page', async () => {
    const user = userEvent.setup();
    render(<AttendancePage today="2026-08-15" />);
    await screen.findByText('Ana Souza');

    const lockBtn = screen.getByLabelText('Trancar matrícula de Ana Souza');
    expect(lockBtn).toBeInTheDocument();
    await user.click(lockBtn);

    const dialog = await screen.findByRole('dialog', { name: /Trancar matrícula do aluno/i });
    expect(within(dialog).getByText(/Deseja trancar a matrícula de/i)).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /Confirmar trancamento/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.api.lockStudentEnrollment).toHaveBeenCalledWith('student-1', 'class-1');
    });
    expect(mocks.reload).toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalled();
  });

  it('allows reactivating a locked enrollment directly from the attendance page', async () => {
    const user = userEvent.setup();
    mocks.entities.enrollments = [{ id: 'enrollment-1', class_id: 'class-1', student_id: 'student-1', status: 'trancada' }];
    render(<AttendancePage today="2026-08-15" />);
    await screen.findByText('Ana Souza');

    expect(screen.getByText('Trancada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P' })).toBeDisabled();

    const unlockBtn = screen.getByLabelText('Reativar matrícula de Ana Souza');
    expect(unlockBtn).toBeInTheDocument();
    await user.click(unlockBtn);

    const dialog = await screen.findByRole('dialog', { name: /Reativar matrícula do aluno/i });
    expect(within(dialog).getByText(/Deseja reativar a matrícula de/i)).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /Confirmar reativação/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.api.unlockStudentEnrollment).toHaveBeenCalledWith('student-1', 'class-1');
    });
    expect(mocks.reload).toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalled();
  });

  it('allows transferring a student to another class directly from the attendance page', async () => {
    const user = userEvent.setup();
    render(<AttendancePage today="2026-08-15" />);
    await screen.findByText('Ana Souza');

    const transferBtn = screen.getByLabelText('Transferir Ana Souza de turma');
    expect(transferBtn).toBeInTheDocument();
    await user.click(transferBtn);

    const dialog = await screen.findByRole('dialog', { name: /Transferir aluno de turma/i });
    expect(within(dialog).getByText(/Transferir o aluno/i)).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /Confirmar transferência/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.api.transferStudentEnrollment).toHaveBeenCalledWith('student-1', 'class-1', 'class-2');
    });
    expect(mocks.reload).toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalled();
  });
});
