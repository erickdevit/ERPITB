// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FinanceDashboardPage } from './finance-dashboard-page';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

const mocks = vi.hoisted(() => {
  return {
    entities: {
      classes: {
        items: [
          { id: 'class-1', name: '01 - Web Dev', active: 1 },
          { id: 'class-2', name: '02 - Design', active: 1 },
        ],
        loading: false,
      },
    },
    session: { id: 'admin-1', name: 'Gestor Financeiro', role: 'financeiro' },
    api: {
      getFees: vi.fn(),
      getCash: vi.fn(),
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

vi.mock('../../app-context', () => ({
  useApp: () => ({
    session: mocks.session,
    api: mocks.api,
  }),
}));

vi.mock('../../lib/use-entity', () => ({
  useEntity: (entity: string) =>
    mocks.entities[entity as keyof typeof mocks.entities] ?? { items: [], loading: false },
}));

describe('FinanceDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { id: 'admin-1', name: 'Gestor Financeiro', role: 'financeiro' };
    mocks.api.getFees.mockResolvedValue({
      items: [
        {
          id: 'fee-1',
          studentId: 's-1',
          studentName: 'Ana Silva',
          className: '01 - Web Dev',
          classId: 'class-1',
          competenceMonth: 10,
          competenceYear: 2026,
          dueDate: '2026-10-15',
          amountCents: 15000,
          paidAmountCents: 15000,
          status: 'paga',
        },
        {
          id: 'fee-2',
          studentId: 's-2',
          studentName: 'Bruno Costa',
          className: '01 - Web Dev',
          classId: 'class-1',
          competenceMonth: 10,
          competenceYear: 2026,
          dueDate: '2026-10-10',
          amountCents: 15000,
          paidAmountCents: 0,
          status: 'atrasada',
        },
        {
          id: 'fee-3',
          studentId: 's-3',
          studentName: 'Carla Dias',
          className: '02 - Design',
          classId: 'class-2',
          competenceMonth: 10,
          competenceYear: 2026,
          dueDate: '2026-10-25',
          amountCents: 20000,
          paidAmountCents: 0,
          status: 'aberto',
        },
      ],
      summary: {
        totalExpectedCents: 50000,
        totalPaidCents: 15000,
        totalPendingCents: 20000,
        totalOverdueCents: 15000,
      },
    });

    mocks.api.getCash.mockResolvedValue({
      items: [
        {
          id: 'tx-1',
          type: 'entrada',
          amountCents: 15000,
          date: '2026-10-15',
          category: 'Mensalidade',
          description: 'Pagamento Ana Silva',
          paymentMethod: 'PIX',
        },
        {
          id: 'tx-2',
          type: 'saida',
          amountCents: 5000,
          date: '2026-10-16',
          category: 'Limpeza',
          description: 'Material de Limpeza',
          paymentMethod: 'PIX',
        },
      ],
      summary: {
        openingBalanceCents: 100000,
        totalInflowCents: 15000,
        totalOutflowCents: 5000,
        closingBalanceCents: 110000,
        netFlowCents: 10000,
      },
    });
  });

  it('restricts access for unauthorized roles (e.g. professor)', () => {
    mocks.session = { id: 'prof-1', name: 'Prof Carlos', role: 'professor' };

    render(
      <MemoryRouter>
        <FinanceDashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Acesso restrito à equipe financeira e à administração.'),
    ).toBeInTheDocument();
  });

  it('renders top filter bar, KPIs, charts, and table lists for authorized users', async () => {
    render(
      <MemoryRouter>
        <FinanceDashboardPage />
      </MemoryRouter>,
    );

    // Wait for data to load
    await waitFor(() => {
      expect(mocks.api.getFees).toHaveBeenCalled();
      expect(mocks.api.getCash).toHaveBeenCalled();
    });

    // Check header
    expect(screen.getByText('Painel Financeiro & B.I.')).toBeInTheDocument();

    // Check KPIs
    expect(screen.getByText('Receita Prevista')).toBeInTheDocument();
    expect(screen.getByText('Total Recebido')).toBeInTheDocument();
    expect(screen.getByText('A Receber (Aberto)')).toBeInTheDocument();
    expect(screen.getByText('Inadimplência')).toBeInTheDocument();

    // Check Cash flow section
    expect(screen.getByText('Fluxo de Caixa Consolidado')).toBeInTheDocument();
    expect(screen.getByText('Saldo Anterior')).toBeInTheDocument();
    expect(screen.getByText('Total de Entradas')).toBeInTheDocument();
    expect(screen.getByText('Total de Saídas')).toBeInTheDocument();
    expect(screen.getByText('Saldo Atual em Caixa')).toBeInTheDocument();

    // Urgent fees should show Bruno Costa (atrasada)
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();

    // Recent transactions should show Pagamento Ana Silva
    expect(screen.getByText('Pagamento Ana Silva')).toBeInTheDocument();
  });

  it('filters data dynamically when Turma is selected', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FinanceDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.api.getFees).toHaveBeenCalled());

    expect(screen.getByText('Arrecadação e Inadimplência por Turma')).toBeInTheDocument();

    // Select Turma 02 - Design
    const turmaSelect = screen.getByLabelText('Filtrar por turma');
    await user.selectOptions(turmaSelect, 'class-2');

    // Chart should turn into student breakdown
    expect(screen.getByText('Arrecadação por Aluno')).toBeInTheDocument();

    // Carla Dias should still be in the list, but Bruno Costa (class-1) should be filtered out
    expect(screen.getByText('Carla Dias')).toBeInTheDocument();
    expect(screen.queryByText('Bruno Costa')).toBeNull();
  });

  it('filters data dynamically when Status is selected', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FinanceDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.api.getFees).toHaveBeenCalled());

    // Select status atrasada
    const statusSelect = screen.getByLabelText('Filtrar por situação');
    await user.selectOptions(statusSelect, 'atrasada');

    // Bruno Costa is atrasada
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    // Carla Dias is aberto, so not shown in urgent table filtered by atrasada
    expect(screen.queryByText('Carla Dias')).toBeNull();
  });
});
