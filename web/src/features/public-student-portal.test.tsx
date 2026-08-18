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
});
