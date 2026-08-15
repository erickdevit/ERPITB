// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplacementsPage } from './replacements-page';

const mocks = vi.hoisted(() => ({
  reload: vi.fn().mockResolvedValue(undefined),
  app: {
    session: { id: 'teacher-1', name: 'Professor', role: 'professor' },
    store: { mutate: vi.fn().mockResolvedValue(undefined), mutateBatch: vi.fn().mockResolvedValue(undefined) },
    sync: vi.fn().mockResolvedValue(undefined),
  },
  entities: {
    attendance_records: [{ id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', date: '2026-08-01', status: 'R' }],
    replacements: [{ id: 'replacement-1', attendance_record_id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', attendance_date: '2026-08-01', scheduled_date: '2026-08-20', scheduled_time: '09:30', notes: 'Reforço' }],
    students: [{ id: 'student-1', name: 'Ana Souza', registration_number: 'MAT-1' }],
    classes: [{ id: 'class-1', name: 'Turma A' }],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../lib/use-entity', () => ({ useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: mocks.reload }) }));

describe('ReplacementsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows schedule details and completes attendance plus schedule atomically', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<ReplacementsPage today="2026-08-15" />);

    expect(screen.getByText(/Matrícula: MAT-1/)).toBeInTheDocument();
    expect(screen.getByText('Reforço')).toBeInTheDocument();
    expect(screen.getByText(/20\/08\/2026 às 09:30/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir' }));

    await waitFor(() => expect(mocks.app.store.mutateBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ entity: 'attendance_records', data: expect.objectContaining({ status: 'RC' }) }),
      expect.objectContaining({ entity: 'replacements', data: expect.objectContaining({ id: 'replacement-1', completed_at: expect.any(String) }) }),
    ])));
    expect(mocks.app.sync).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
