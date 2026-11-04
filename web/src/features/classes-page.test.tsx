// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ClassesPage } from './classes-page';

const mocks = vi.hoisted(() => ({
  app: {
    session: { id: 'teacher-1', name: 'Professor', email: 'teacher@example.invalid', role: 'professor' },
    api: { get: vi.fn() },
    store: { mutate: vi.fn() },
    sync: vi.fn(),
  },
  entities: {
    classes: [{ id: 'class-1', course_id: 'course-1', name: 'Turma Web', shift: 'noite', week_day: 'Terça-feira', active: 1 }],
    courses: [{ id: 'course-1', name: 'Informática', active: 1 }],
    laboratories: [],
    class_teachers: [{ id: 'assignment-1', class_id: 'class-1', user_id: 'teacher-1' }],
    enrollments: [],
    students: [],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({ items: mocks.entities[entity] ?? [], loading: false, reload: vi.fn() }),
}));

describe('ClassesPage', () => {
  it('shows assigned classes to a professor without management actions', () => {
    render(<MemoryRouter><ClassesPage /></MemoryRouter>);

    expect(screen.getByText(/Estas são as turmas atribuídas a você/)).toBeInTheDocument();
    expect(screen.getByText('Turma Web')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova turma' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Turma Web')).not.toBeInTheDocument();
    expect(mocks.app.api.get).not.toHaveBeenCalled();
  });
});
