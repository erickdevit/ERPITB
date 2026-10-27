// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayInSaoPaulo } from '../lib/date';
import { DashboardPage } from './dashboard-page';

const mocks = vi.hoisted(() => {
  return {
    entities: {
      attendance_records: { items: [] as Array<Record<string, unknown>>, loading: false },
      classes: { items: [] as Array<Record<string, unknown>>, loading: false },
      students: { items: [] as Array<Record<string, unknown>>, loading: false },
      enrollments: { items: [] as Array<Record<string, unknown>>, loading: false },
      class_teachers: { items: [] as Array<Record<string, unknown>>, loading: false },
    },
    session: { id: 'admin-1', name: 'Administrador ITB', role: 'admin' },
    api: {
      get: vi.fn().mockResolvedValue({
        items: [
          { id: 'teacher-1', name: 'Professor Carlos' },
          { id: 'teacher-2', name: 'Professora Mariana' },
        ],
      }),
    },
  };
});

vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-responsive-container" style={{ width: 800, height: 400 }}>
        {children}
      </div>
    ),
  };
});

vi.mock('../app-context', () => ({
  useApp: () => ({
    session: mocks.session,
    api: mocks.api,
  }),
}));

vi.mock('../lib/use-entity', () => ({
  useEntity: (entity: string) =>
    mocks.entities[entity as keyof typeof mocks.entities] ?? { items: [], loading: false },
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { id: 'admin-1', name: 'Administrador ITB', role: 'admin' };
    mocks.entities.attendance_records = { items: [], loading: false };
    mocks.entities.classes = { items: [], loading: false };
    mocks.entities.students = { items: [], loading: false };
    mocks.entities.enrollments = { items: [], loading: false };
    mocks.entities.class_teachers = { items: [], loading: false };
  });

  it('renders loading skeletons for KPI cards and chart containers while data is loading', () => {
    mocks.entities.attendance_records = { items: [], loading: true };
    mocks.entities.classes = { items: [], loading: true };

    render(<DashboardPage />);

    // Must show 6 KPI skeletons
    const kpiSkeletons = screen.getAllByTestId('kpi-skeleton');
    expect(kpiSkeletons).toHaveLength(6);

    // Must show chart skeletons
    const chartSkeletons = screen.getAllByTestId('chart-skeleton');
    expect(chartSkeletons.length).toBeGreaterThanOrEqual(3);

    // Must show list skeletons for tables
    const listSkeletons = screen.getAllByTestId('list-skeleton');
    expect(listSkeletons.length).toBeGreaterThanOrEqual(2);

    // Loading progress bar in period card
    expect(screen.getByLabelText('Carregando indicadores')).toBeInTheDocument();
  });

  it('renders KPI values, summary badges (including J and R/RC) and empty states when loaded with 0 records', () => {
    mocks.entities.classes = {
      items: [{ id: 'class-1', name: 'Turma Alpha', course_id: 'course-1', active: 1 }],
      loading: false,
    };
    mocks.entities.students = {
      items: [{ id: 'student-1', name: 'Lucas Lima', registration_number: '2026001', active: 1 }],
      loading: false,
    };
    mocks.entities.enrollments = {
      items: [{ id: 'enr-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' }],
      loading: false,
    };

    render(<DashboardPage />);

    // KPI cards
    expect(screen.getByText('Taxa de Frequência')).toBeInTheDocument();
    expect(screen.getByText('0,0%')).toBeInTheDocument();
    expect(screen.getByText('Presenças')).toBeInTheDocument();
    expect(screen.getByText('Faltas')).toBeInTheDocument();
    expect(screen.getByText('Atrasos')).toBeInTheDocument();
    expect(screen.getByText('Alunos em Risco')).toBeInTheDocument();
    expect(screen.getByText('Chamadas Realizadas')).toBeInTheDocument();

    // Summary badges for Justificativas and Reposições
    const justifiedBadge = screen.getByTestId('badge-justified');
    expect(justifiedBadge).toHaveTextContent('Justificativas (J): 0');
    const replacementsBadge = screen.getByTestId('badge-replacements');
    expect(replacementsBadge).toHaveTextContent('Reposições (R/RC): 0');

    // Contextual empty charts
    expect(screen.getByText('Não há frequência registrada neste período.')).toBeInTheDocument();
    expect(screen.getByText('Não há marcações para distribuir neste período.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum aluno com falta no período selecionado.')).toBeInTheDocument();
  });

  it('renders exact real data in KPIs, badges, top absentees with className, and distinguishes 0-record classes', async () => {
    // Current date range covers 30 days ending todayInSaoPaulo
    const today = todayInSaoPaulo();
    const [y, m, d] = today.split('-').map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.UTC(y, m - 1, d - 2)).toISOString().slice(0, 10);

    mocks.entities.classes = {
      items: [
        { id: 'class-1', name: 'Desenvolvimento Web', course_id: 'course-1', active: 1 },
        { id: 'class-2', name: 'Design Gráfico', course_id: 'course-1', active: 1 },
      ],
      loading: false,
    };
    mocks.entities.students = {
      items: [
        { id: 'student-1', name: 'Beatriz Santos', registration_number: 'MAT-101', active: 1 },
        { id: 'student-2', name: 'Gabriel Souza', registration_number: 'MAT-102', active: 1 },
      ],
      loading: false,
    };
    mocks.entities.enrollments = {
      items: [
        { id: 'enr-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' },
        { id: 'enr-2', class_id: 'class-1', student_id: 'student-2', status: 'ativa' },
        { id: 'enr-3', class_id: 'class-2', student_id: 'student-1', status: 'ativa' },
      ],
      loading: false,
    };
    mocks.entities.class_teachers = {
      items: [{ id: 'ct-1', class_id: 'class-1', user_id: 'teacher-1' }],
      loading: false,
    };
    mocks.entities.attendance_records = {
      items: [
        // Class 1 calls
        { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: today, status: 'P' },
        { id: 'att-2', class_id: 'class-1', student_id: 'student-2', date: today, status: 'F' },
        { id: 'att-3', class_id: 'class-1', student_id: 'student-1', date: yesterday, status: 'J' },
        { id: 'att-4', class_id: 'class-1', student_id: 'student-2', date: yesterday, status: 'F' },
        { id: 'att-5', class_id: 'class-1', student_id: 'student-1', date: twoDaysAgo, status: 'A' },
        { id: 'att-6', class_id: 'class-1', student_id: 'student-2', date: twoDaysAgo, status: 'RC' },
        // Notice: Class 2 has 0 attendance records!
      ],
      loading: false,
    };

    render(<DashboardPage />);

    // Total records: 6
    // Presences: 1 (att-1)
    // Faltas: 2 (att-2, att-4)
    // Justificativas: 1 (att-3)
    // Atrasos: 1 (att-5)
    // Reposições: 1 (att-6)
    // Rate: 1 / 6 = 16.7%
    expect(screen.getByText('16,7%')).toBeInTheDocument();
    expect(screen.getByText('6 marcações no período')).toBeInTheDocument();

    // Summary badges
    expect(screen.getByText(/Presenças \(P\): 1/)).toBeInTheDocument();
    expect(screen.getByText(/Faltas \(F\): 2/)).toBeInTheDocument();
    expect(screen.getByText(/Atrasos \(A\): 1/)).toBeInTheDocument();
    expect(screen.getByTestId('badge-justified')).toHaveTextContent('Justificativas (J): 1');
    expect(screen.getByTestId('badge-replacements')).toHaveTextContent('Reposições (R/RC): 1');

    // Top Absentees should display student Gabriel Souza with className 'Desenvolvimento Web'
    expect(screen.getByText('Gabriel Souza')).toBeInTheDocument();
    expect(screen.getByText('Desenvolvimento Web')).toBeInTheDocument();
    expect(screen.getByText('2 faltas')).toBeInTheDocument();

    // Comparative chart: class listing is removed per UI requirements, leaving only the bar chart
    expect(screen.queryByText('Sem chamadas no período')).toBeNull();

    // Teacher workload
    expect(await screen.findByText('Professor Carlos')).toBeInTheDocument();
  });

  it('switches between presets (7, 30, 90 days) and custom range', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    // Initial state: 30 dias button has active styling
    const btn7 = screen.getByRole('button', { name: '7 dias' });
    const btn30 = screen.getByRole('button', { name: '30 dias' });
    const btn90 = screen.getByRole('button', { name: '90 dias' });
    const btnCustom = screen.getByRole('button', { name: 'Personalizado' });

    expect(btn30).toHaveClass('bg-slate-950');

    // Switch to 7 days
    await user.click(btn7);
    expect(btn7).toHaveClass('bg-slate-950');
    expect(btn30).not.toHaveClass('bg-slate-950');

    // Switch to 90 days
    await user.click(btn90);
    expect(btn90).toHaveClass('bg-slate-950');
    expect(btn7).not.toHaveClass('bg-slate-950');

    // Switch to Custom
    await user.click(btnCustom);
    expect(btnCustom).toHaveClass('bg-slate-950');

    // Custom date fields should be visible
    expect(screen.getByLabelText(/Data inicial/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data final/)).toBeInTheDocument();
  });

  it('validates custom date range and shows amber warning when from > to', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: 'Personalizado' }));

    const fromInput = screen.getByLabelText(/Data inicial/);
    const toInput = screen.getByLabelText(/Data final/);

    // Set invalid range: from = 20/08/2026, to = 10/08/2026
    fireEvent.change(fromInput, { target: { value: '20/08/2026' } });
    fireEvent.change(toInput, { target: { value: '10/08/2026' } });

    expect(
      screen.getByText('Informe um período válido; a data inicial não pode ser posterior à data final.'),
    ).toBeInTheDocument();
  });

  it('transforms comparative chart into student breakdown when a turma is selected', async () => {
    const user = userEvent.setup();
    mocks.entities.classes = {
      items: [
        { id: 'class-1', name: 'Desenvolvimento Web', course_id: 'course-1', active: 1 },
      ],
      loading: false,
    };
    mocks.entities.students = {
      items: [
        { id: 'student-1', name: 'Beatriz Santos', registration_number: 'MAT-101', active: 1 },
      ],
      loading: false,
    };
    mocks.entities.enrollments = {
      items: [
        { id: 'enr-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' },
      ],
      loading: false,
    };

    render(<DashboardPage />);

    expect(screen.getByText('Comparativo por Turma')).toBeInTheDocument();

    const turmaSelect = screen.getByLabelText(/Turma:/i);
    await user.selectOptions(turmaSelect, 'class-1');

    expect(screen.getByText('Comparativo por Aluno')).toBeInTheDocument();
  });
});

