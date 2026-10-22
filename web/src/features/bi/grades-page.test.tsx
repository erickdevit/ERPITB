// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../../types';
import { BiGradesPage } from './grades-page';

const mocks = vi.hoisted(() => ({
  app: {
    session: { id: 'admin-1', name: 'Diretoria', email: 'admin@itb.test', role: 'admin' as Role },
    api: { get: vi.fn().mockResolvedValue({ items: [] }) },
  },
  entities: {
    classes: [
      { id: 'class-1', name: 'Turma Alpha', course_id: 'course-1', active: 1, created_at: '2026-01-01T00:00:00Z' },
    ],
    courses: [
      { id: 'course-1', name: 'Informática Básica', active: 1, created_at: '2026-01-01T00:00:00Z' },
    ],
    students: [
      { id: 's-1', name: 'Carlos Alcantara', registration_number: '2026001', active: 1 },
      { id: 's-2', name: 'Beatriz Silva', registration_number: '2026002', active: 1 },
    ],
    enrollments: [
      { id: 'e-1', student_id: 's-1', class_id: 'class-1', status: 'ativa' },
      { id: 'e-2', student_id: 's-2', class_id: 'class-1', status: 'ativa' },
    ],
    attendance_records: [
      { id: 'att-1', student_id: 's-1', class_id: 'class-1', date: '2026-08-01', status: 'P' },
      { id: 'att-2', student_id: 's-2', class_id: 'class-1', date: '2026-08-01', status: 'F' },
    ],
    grade_tables: [
      {
        id: 'tbl-1',
        class_id: 'class-1',
        name: '1ª Etapa',
        calculation_mode: 'simple',
        passing_grade: 6,
        published: 1,
        sort_order: 1,
      },
    ],
    grade_items: [
      {
        id: 'item-1',
        class_id: 'class-1',
        grade_table_id: 'tbl-1',
        name: 'Prova 1',
        category: 'Prova',
        max_score: 10,
        weight: 1,
      },
    ],
    student_grades: [
      { id: 'sg-1', student_id: 's-1', grade_table_id: 'tbl-1', grade_item_id: 'item-1', score: 8.5 },
      { id: 'sg-2', student_id: 's-2', grade_table_id: 'tbl-1', grade_item_id: 'item-1', score: 5.0 },
    ],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../../lib/use-entity', () => ({
  useEntity: (entity: string) => ({
    items: mocks.entities[entity] ?? [],
    loading: false,
    reload: vi.fn(),
  }),
}));

describe('BiGradesPage (Notas e Desempenho)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.print = vi.fn();
  });

  it('renders Boletim Consolidado by default with print button and reference table layout', () => {
    render(
      <MemoryRouter initialEntries={['/bi/notas']}>
        <BiGradesPage />
      </MemoryRouter>,
    );

    // Header card
    expect(screen.getByText('Boletim Consolidado — Turma Alpha')).toBeDefined();
    expect(
      screen.getByText(
        'Visão geral de desempenho com médias calculadas conforme a configuração de cada etapa (Média Aritmética ou Maior Nota).',
      ),
    ).toBeDefined();

    // Table headers matching reference
    expect(screen.getByText('Aluno')).toBeDefined();
    expect(screen.getByText('1ª Etapa')).toBeDefined();
    expect(screen.getByText('Média Geral')).toBeDefined();
    expect(screen.getByText('Frequência')).toBeDefined();
    expect(screen.getByText('Situação')).toBeDefined();

    // Student rows
    expect(screen.getByText('Carlos Alcantara')).toBeDefined();
    expect(screen.getByText('Beatriz Silva')).toBeDefined();

    // Prominent "Imprimir" button exists and invokes window.print()
    const printButtons = screen.getAllByRole('button', { name: /imprimir/i });
    expect(printButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(printButtons[0]!);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('toggles to Visão Analítica B.I and renders comparative view with print option', () => {
    render(
      <MemoryRouter initialEntries={['/bi/notas']}>
        <BiGradesPage />
      </MemoryRouter>,
    );

    const analyticsTab = screen.getByRole('button', { name: /visão analítica b\.i/i });
    fireEvent.click(analyticsTab);

    // Analytical metrics and comparative table
    expect(screen.getByText(/desempenho acadêmico por turma/i)).toBeDefined();

    // Print button is available in the toolbar
    const printButtons = screen.getAllByRole('button', { name: /imprimir/i });
    expect(printButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(printButtons[0]!);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('opens individual student report card modal when clicking student row in boletim', async () => {
    render(
      <MemoryRouter initialEntries={['/bi/notas']}>
        <BiGradesPage />
      </MemoryRouter>,
    );

    const studentCell = screen.getByText('Carlos Alcantara');
    fireEvent.click(studentCell);

    // Modal dialog opens
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();

    // Title inside modal
    expect(screen.getByText(/boletim individual — carlos alcantara/i)).toBeDefined();

    // Print button inside modal works
    const modalPrint = screen.getAllByRole('button', { name: /imprimir/i });
    expect(modalPrint.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(modalPrint[0]!);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
