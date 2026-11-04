// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types';
import { GradesPage } from './grades-page';
import * as boletimPdf from '../lib/boletim-pdf';
import { buildReportView, type ReportInput } from './reports/model';

const mocks = vi.hoisted(() => ({
  store: {
    mutate: vi.fn().mockResolvedValue(undefined),
    mutateBatch: vi.fn().mockResolvedValue(undefined),
  },
  sync: vi.fn().mockResolvedValue(undefined),
  app: {
    session: { id: 'prof-1', name: 'Professor Carlos', email: 'prof@opschool.test', role: 'teacher' as Role },
    branding: { appName: 'Escola Modelo', loginLogoUrl: '/logo.svg' },
    store: {
      mutate: vi.fn().mockResolvedValue(undefined),
      mutateBatch: vi.fn().mockResolvedValue(undefined),
    },
    sync: vi.fn().mockResolvedValue(undefined),
    api: { post: vi.fn().mockResolvedValue({ results: [{ status: 'applied' }] }) },
  },
  entities: {
    classes: [
      { id: 'class-1', name: 'Turma 101', course_id: 'course-1', active: 1, created_at: '2026-01-01T00:00:00Z' },
    ],
    courses: [
      { id: 'course-1', name: 'Ensino Médio', active: 1, created_at: '2026-01-01T00:00:00Z' },
    ],
    students: [
      { id: 's-1', name: 'Ana Oliveira', registration_number: '2026-001', active: 1 },
      { id: 's-2', name: 'Bruno Santos', registration_number: '2026-002', active: 1 },
    ],
    enrollments: [
      { id: 'e-1', student_id: 's-1', class_id: 'class-1', status: 'ativa' },
      { id: 'e-2', student_id: 's-2', class_id: 'class-1', status: 'ativa' },
    ],
    attendance_records: [
      { id: 'att-1', student_id: 's-1', class_id: 'class-1', date: '2026-08-01', status: 'P' },
      { id: 'att-2', student_id: 's-2', class_id: 'class-1', date: '2026-08-01', status: 'P' },
    ],
    grade_tables: [
      {
        id: 'tbl-1',
        class_id: 'class-1',
        name: 'Módulo 1: Fundamentos',
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
      { id: 'sg-2', student_id: 's-2', grade_table_id: 'tbl-1', grade_item_id: 'item-1', score: 9.0 },
    ],
  } as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../app-context', () => ({ useApp: () => mocks.app }));
vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) => ({
    items: mocks.entities[entity] ?? [],
    loading: false,
    reload: vi.fn().mockResolvedValue(undefined),
  }),
  clearEntityMemoryCache: vi.fn(),
  notifyEntityChanged: vi.fn(),
}));

describe('Grade Table Visibility Toggle & Immediate UI/Print Parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.print = vi.fn();
    mocks.entities.grade_tables = [
      {
        id: 'tbl-1',
        class_id: 'class-1',
        name: 'Módulo 1: Fundamentos',
        calculation_mode: 'simple',
        passing_grade: 6,
        published: 1,
        sort_order: 1,
      },
    ];
  });

  it('1. Toggling "Visível no Boletim" immediately changes button to "Oculta (Rascunho)" and updates print/boletim data', async () => {
    const printSpy = vi.spyOn(boletimPdf, 'printClassBoletimPdf').mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/notas?classId=class-1']}>
        <GradesPage />
      </MemoryRouter>,
    );

    // Initial state: published
    const eyeBtn = screen.getByRole('button', { name: /Visível no Boletim/i });
    expect(eyeBtn).toBeDefined();

    // 1. Click toggle button to make it UNPUBLISHED
    fireEvent.click(eyeBtn);

    // Immediate UI feedback: Button text flips to "Oculta (Rascunho)" without page reload
    expect(screen.getByRole('button', { name: /Oculta \(Rascunho\)/i })).toBeDefined();
    // Immediate badge in tab
    expect(screen.getByText('Rascunho')).toBeDefined();

    // 2. Switch to Consolidated Class Boletim
    const boletimTabBtn = screen.getByRole('button', { name: /Boletim Consolidado da Turma/i });
    fireEvent.click(boletimTabBtn);

    // In the consolidated class boletim, the unpublished table column must NOT appear!
    expect(screen.queryByText('Módulo 1: Fundamentos')).toBeNull();

    // 3. Click Print Boletim
    const printBtn = screen.getAllByRole('button', { name: /Imprimir/i })[0]!;
    fireEvent.click(printBtn);

    // Verification: printClassBoletimPdf was called with data that omits the unpublished table!
    await waitFor(() => {
      expect(printSpy).toHaveBeenCalledTimes(1);
    });
    const calledData = printSpy.mock.calls[0]![0];
    expect(calledData.tables.length).toBe(0); // Unpublished table omitted from print PDF!
  });

  it('2. Clicking "Oculta (Rascunho)" again immediately restores visibility in interface and print', async () => {
    const printSpy = vi.spyOn(boletimPdf, 'printClassBoletimPdf').mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/notas?classId=class-1']}>
        <GradesPage />
      </MemoryRouter>,
    );

    const toggleBtn = screen.getByRole('button', { name: /Visível no Boletim/i });

    // Toggle to hidden (rascunho)
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('button', { name: /Oculta \(Rascunho\)/i })).toBeDefined();

    // Toggle back to visible
    const hiddenBtn = screen.getByRole('button', { name: /Oculta \(Rascunho\)/i });
    fireEvent.click(hiddenBtn);

    // Immediately back to visible
    expect(screen.getByRole('button', { name: /Visível no Boletim/i })).toBeDefined();
    expect(screen.queryByText('Rascunho')).toBeNull();

    // Switch to Consolidated Class Boletim
    const boletimTabBtn = screen.getByRole('button', { name: /Boletim Consolidado da Turma/i });
    fireEvent.click(boletimTabBtn);

    // Now table column appears again!
    expect(screen.getByText('Módulo 1: Fundamentos')).toBeDefined();

    // Print must include the published table
    const printBtn = screen.getAllByRole('button', { name: /Imprimir/i })[0]!;
    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(printSpy).toHaveBeenCalledTimes(1);
    });
    const calledData = printSpy.mock.calls[0]![0];
    expect(calledData.tables.length).toBe(1);
    expect(calledData.tables[0]?.name).toBe('Módulo 1: Fundamentos');
  });

  it('3. Reports (classGrades): strictly excludes unpublished tables from headers, rows, and classBoletimData', () => {
    const reportInput: ReportInput = {
      classes: [{ id: 'class-1', name: 'Turma 101', course_id: 'course-1', active: 1 }],
      courses: [{ id: 'course-1', name: 'Ensino Médio', active: 1 }],
      students: [{ id: 's-1', name: 'Ana Oliveira', registration_number: '2026-001', active: 1 }],
      enrollments: [{ id: 'e-1', student_id: 's-1', class_id: 'class-1', status: 'ativa' }],
      attendance: [{ id: 'a-1', student_id: 's-1', class_id: 'class-1', date: '2026-08-01', status: 'P' }],
      gradeTables: [
        { id: 'gt-pub', class_id: 'class-1', name: 'Etapa Publicada', published: 1, sort_order: 1 },
        { id: 'gt-draft', class_id: 'class-1', name: 'Etapa Rascunho', published: 0, sort_order: 2 },
      ],
      gradeItems: [
        { id: 'gi-1', grade_table_id: 'gt-pub', class_id: 'class-1', name: 'P1', max_score: 10, weight: 1, category: 'Prova' },
        { id: 'gi-2', grade_table_id: 'gt-draft', class_id: 'class-1', name: 'P2', max_score: 10, weight: 1, category: 'Prova' },
      ],
      studentGrades: [
        { id: 'sg-1', class_id: 'class-1', grade_table_id: 'gt-pub', grade_item_id: 'gi-1', student_id: 's-1', score: 9 },
        { id: 'sg-2', class_id: 'class-1', grade_table_id: 'gt-draft', grade_item_id: 'gi-2', student_id: 's-1', score: 2 },
      ],
      classNotes: [],
      classTeachers: [],
      directory: [],
    };

    const view = buildReportView(reportInput, {
      type: 'classGrades',
      classId: 'class-1',
      from: '2026-08-01',
      to: '2026-08-31',
    });

    // 1. Headers must ONLY contain the published table
    expect(view.headers).toContain('Etapa Publicada');
    expect(view.headers).not.toContain('Etapa Rascunho');

    // 2. Class boletim data tables must only have the published table
    expect(view.classBoletimData?.tables.map((t) => t.name)).toEqual(['Etapa Publicada']);

    // 3. Student average must ONLY be computed from published table (score 9.0, not average with 2.0)
    const studentRow = view.rows[0]!;
    expect(studentRow).toBeDefined();
    // 'Matrícula', 'Aluno', 'Etapa Publicada', 'Média Geral', 'Frequência', 'Situação'
    expect(studentRow[2]).toBe('9,0');
    expect(studentRow[3]).toBe('9,0'); // Média Geral is 9,0, not 5,5!
  });
});
