// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicStudentPortal } from './public-student-portal';

const mockPayload = {
  student: {
    name: 'Mariana Duarte',
    registrationNumber: 'MAT-2026-001',
    active: true,
  },
  metrics: {
    totalLessons: 10,
    present: 9,
    absent: 1,
    justified: 0,
    delayed: 0,
    replacement: 0,
    attendanceRate: 90.0,
  },
  classes: [
    {
      className: 'Turma Noite 2026',
      courseName: 'Desenvolvimento Web',
      courseCode: 'DEV-01',
      shift: 'noite',
      status: 'ativa',
    },
  ],
  monthlyEvolution: [
    {
      month: '2026-08',
      label: 'Ago/2026',
      rate: 90.0,
      present: 9,
      total: 10,
      absent: 1,
    },
  ],
  history: [
    {
      id: 'att-1',
      date: '2026-08-18',
      status: 'P',
      statusLabel: 'Presente',
      className: 'Turma Noite 2026',
      courseName: 'Desenvolvimento Web',
      notes: 'Participação ativa',
      completedAt: null,
    },
    {
      id: 'att-2',
      date: '2026-08-11',
      status: 'F',
      statusLabel: 'Falta',
      className: 'Turma Noite 2026',
      courseName: 'Desenvolvimento Web',
      notes: null,
      completedAt: null,
    },
  ],
};

describe('PublicStudentPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student profile, metrics, monthly evolution and history table', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    render(
      <MemoryRouter initialEntries={['/matricula/MAT-2026-001']}>
        <Routes>
          <Route path="/matricula/:code" element={<PublicStudentPortal />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Consultando dados de frequência do aluno...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Mariana Duarte')).toBeInTheDocument();
    });

    expect(screen.getByText('MAT-2026-001')).toBeInTheDocument();
    expect(screen.getByText('90.0%')).toBeInTheDocument();
    expect(screen.getAllByText('Turma Noite 2026').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Desenvolvimento Web').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Participação ativa')).toBeInTheDocument();
    expect(screen.getByText('18/08/2026')).toBeInTheDocument();
  });

  it('renders not found error state on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Aluno não encontrado' }),
    } as Response);

    render(
      <MemoryRouter initialEntries={['/matricula/INVALID']}>
        <Routes>
          <Route path="/matricula/:code" element={<PublicStudentPortal />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Matrícula não encontrada ou aluno inativo.')).toBeInTheDocument();
    });

    expect(screen.getByText('Acessar portal administrativo')).toBeInTheDocument();
  });

  it('filters history by status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/matricula/MAT-2026-001']}>
        <Routes>
          <Route path="/matricula/:code" element={<PublicStudentPortal />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Mariana Duarte')).toBeInTheDocument();
    });

    const statusSelect = screen.getByRole('combobox');
    await user.selectOptions(statusSelect, 'F');

    expect(screen.getByText('11/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('18/08/2026')).not.toBeInTheDocument();
  });

  it('renders the complete Boletim Acadêmico de Notas and switches tabs', async () => {
    const payloadWithReportCard = {
      ...mockPayload,
      reportCard: {
        overallAverage: 8.5,
        passingGrade: 6.0,
        overallStatus: 'aprovado',
        overallStatusLabel: 'Aprovado',
        totalTables: 1,
        totalAssessments: 2,
        evaluatedAssessments: 2,
        byCategory: [
          { category: 'Prova', totalItems: 1, evaluatedItems: 1, average: 8.0 },
          { category: 'Atividade Prática', totalItems: 1, evaluatedItems: 1, average: 9.0 },
        ],
        tables: [
          {
            id: 'gt-1',
            name: '1º Módulo - Desenvolvimento Web',
            className: 'Turma Noite 2026',
            courseName: 'Desenvolvimento Web',
            courseCode: 'DEV-01',
            teacherName: 'Prof. Carlos',
            calculationMode: 'simple',
            passingGrade: 6.0,
            notes: null,
            updatedAt: '2026-08-20T12:00:00Z',
            average: 8.5,
            status: 'aprovado',
            statusLabel: 'Aprovado',
            totalItems: 2,
            evaluatedItems: 2,
            items: [
              {
                id: 'gi-1',
                name: 'Prova HTML/CSS',
                category: 'Prova',
                evaluationDate: '2026-08-10',
                maxScore: 10,
                weight: 1,
                notes: null,
                score: 8.0,
                normalizedScore: 8.0,
                remarks: 'Ótima estrutura semântica',
                updatedAt: '2026-08-12T10:00:00Z',
              },
              {
                id: 'gi-2',
                name: 'Projeto Prático Flexbox',
                category: 'Atividade Prática',
                evaluationDate: '2026-08-17',
                maxScore: 10,
                weight: 1,
                notes: null,
                score: 9.0,
                normalizedScore: 9.0,
                remarks: 'Excelente entrega',
                updatedAt: '2026-08-19T10:00:00Z',
              },
            ],
          },
        ],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payloadWithReportCard,
    } as Response);

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/matricula/MAT-2026-001']}>
        <Routes>
          <Route path="/matricula/:code" element={<PublicStudentPortal />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Boletim Acadêmico de Notas')).toBeInTheDocument();
    });

    expect(screen.getByText('1º Módulo - Desenvolvimento Web')).toBeInTheDocument();
    expect(screen.getByText('Prova HTML/CSS')).toBeInTheDocument();
    expect(screen.getByText('Projeto Prático Flexbox')).toBeInTheDocument();
    expect(screen.getByText('Ótima estrutura semântica')).toBeInTheDocument();
    expect(screen.getAllByText('8,5').length).toBeGreaterThanOrEqual(1);

    // Switch to Boletim tab only
    await user.click(screen.getByRole('button', { name: /Boletim de Notas/i }));
    expect(screen.getByText('Prova HTML/CSS')).toBeInTheDocument();
    expect(screen.queryByText('Histórico Detalhado de Aulas')).not.toBeInTheDocument();
  });
});
