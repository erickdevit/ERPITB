import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Building,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Filter,
  Layers,
  MinusCircle,
  PieChart as PieIcon,
  PlusCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../../app-context';
import { useEntity } from '../../lib/use-entity';
import {
  canManageFinance,
  type CashTransaction,
  type FinancialFee,
} from '../../types';
import {
  cleanClassName,
  extractClassNumber,
  formatClassDisplayName,
} from '../classes-model';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STATUS_COLORS: Record<string, string> = {
  paga: '#10B981', // emerald-500
  aberto: '#F59E0B', // amber-500
  atrasada: '#F43F5E', // rose-500
  parcial: '#0284C7', // sky-600
  cancelada: '#94A3B8', // slate-400
};

export function FinanceDashboardPage() {
  const { api, session } = useApp();
  const navigate = useNavigate();
  const classes = useEntity('classes');

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(String(now.getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [feesSummary, setFeesSummary] = useState<any>({});
  const [feesList, setFeesList] = useState<FinancialFee[]>([]);
  const [cashSummary, setCashSummary] = useState<any>({});
  const [cashList, setCashList] = useState<CashTransaction[]>([]);

  // Load backend data for competence
  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const monthPad = filterMonth.padStart(2, '0');
        const ym = `${filterYear}-${monthPad}`;
        const [feesRes, cashRes] = await Promise.all([
          api.getFees({ month: filterMonth, year: filterYear }),
          api.getCash({ month: ym }),
        ]);
        if (!active) return;
        setFeesList(feesRes?.items || []);
        setFeesSummary(feesRes?.summary || {});
        setCashList(cashRes?.items || []);
        setCashSummary(cashRes?.summary || {});
      } catch {
        // network or server error handled gracefully
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [api, filterMonth, filterYear]);

  // Turma options sorted in ascending numeric order
  const classOptions = useMemo(() => {
    const raw = (classes.items ?? []).filter(
      (c) => !c.deleted_at && c.active !== 0 && c.active !== false,
    );
    return raw
      .map((c) => {
        const cName = String(c.name || '');
        const num = c.class_number !== undefined && c.class_number !== null
          ? Number(c.class_number)
          : extractClassNumber(cName);
        const clean = cleanClassName(cName);
        return {
          id: c.id,
          classNumber: num,
          name: formatClassDisplayName(num, clean),
          rawName: cName,
        };
      })
      .sort((a, b) => {
        const numA = a.classNumber ?? 999999;
        const numB = b.classNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [classes.items]);

  const selectedClassName = useMemo(() => {
    return classOptions.find((c) => c.id === selectedClassId)?.name;
  }, [classOptions, selectedClassId]);

  // Preset handlers
  const handleCurrentMonth = () => {
    const cur = new Date();
    setFilterMonth(String(cur.getMonth() + 1));
    setFilterYear(String(cur.getFullYear()));
  };

  const handlePreviousMonth = () => {
    const cur = new Date();
    cur.setMonth(cur.getMonth() - 1);
    setFilterMonth(String(cur.getMonth() + 1));
    setFilterYear(String(cur.getFullYear()));
  };

  const handleResetFilters = () => {
    handleCurrentMonth();
    setSelectedClassId('');
    setSelectedStatus('all');
  };

  // Filtered fees based on interactive controls
  const filteredFees = useMemo(() => {
    return feesList.filter((f) => {
      if (selectedClassId && f.classId !== selectedClassId && f.className !== selectedClassId) {
        return false;
      }
      if (selectedStatus !== 'all' && f.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [feesList, selectedClassId, selectedStatus]);

  // Dynamic Metrics for Filtered Fees
  const metrics = useMemo(() => {
    let expectedCents = 0;
    let paidCents = 0;
    let pendingCents = 0;
    let overdueCents = 0;
    let partialCents = 0;
    let countPaid = 0;
    let countOpen = 0;
    let countOverdue = 0;
    let countPartial = 0;

    for (const f of filteredFees) {
      expectedCents += f.amountCents || 0;
      paidCents += f.paidAmountCents || 0;
      const balance = Math.max(0, (f.amountCents || 0) - (f.paidAmountCents || 0));

      if (f.status === 'paga') {
        countPaid++;
      } else if (f.status === 'atrasada') {
        countOverdue++;
        overdueCents += balance;
      } else if (f.status === 'parcial') {
        countPartial++;
        partialCents += balance;
        pendingCents += balance;
      } else if (f.status === 'aberto') {
        countOpen++;
        pendingCents += balance;
      }
    }

    const collectionRate =
      expectedCents > 0 ? ((paidCents / expectedCents) * 100).toFixed(1) : '0';
    const delinquencyRate =
      expectedCents > 0 ? ((overdueCents / expectedCents) * 100).toFixed(1) : '0';

    return {
      expectedCents,
      paidCents,
      pendingCents,
      overdueCents,
      partialCents,
      totalCount: filteredFees.length,
      countPaid,
      countOpen,
      countOverdue,
      countPartial,
      collectionRate,
      delinquencyRate,
    };
  }, [filteredFees]);

  // Daily Cash Flow Chart Data
  const dailyCashFlowData = useMemo(() => {
    const daysInMonth = new Date(
      parseInt(filterYear, 10),
      parseInt(filterMonth, 10),
      0,
    ).getDate();

    const dayMap = new Map<number, { entradas: number; saidas: number }>();
    for (let d = 1; d <= daysInMonth; d++) {
      dayMap.set(d, { entradas: 0, saidas: 0 });
    }

    for (const tx of cashList) {
      if (!tx.date) continue;
      const day = parseInt(tx.date.slice(8, 10), 10);
      if (dayMap.has(day)) {
        const item = dayMap.get(day)!;
        if (tx.type === 'entrada') {
          item.entradas += (tx.amountCents || 0) / 100;
        } else if (tx.type === 'saida') {
          item.saidas += (tx.amountCents || 0) / 100;
        }
      }
    }

    let runningBalance = (cashSummary.openingBalanceCents || 0) / 100;
    return Array.from(dayMap.entries()).map(([day, val]) => {
      runningBalance += val.entradas - val.saidas;
      return {
        day: `Dia ${String(day).padStart(2, '0')}`,
        entradas: val.entradas,
        saidas: val.saidas,
        saldo: Math.round(runningBalance * 100) / 100,
      };
    });
  }, [cashList, filterYear, filterMonth, cashSummary.openingBalanceCents]);

  // Status Distribution Chart Data (Donut)
  const statusDistributionData = useMemo(() => {
    return [
      {
        name: 'Pagas',
        key: 'paga',
        value: metrics.paidCents / 100,
        count: metrics.countPaid,
        color: STATUS_COLORS.paga,
      },
      {
        name: 'Em Aberto',
        key: 'aberto',
        value: metrics.pendingCents / 100,
        count: metrics.countOpen,
        color: STATUS_COLORS.aberto,
      },
      {
        name: 'Atrasadas',
        key: 'atrasada',
        value: metrics.overdueCents / 100,
        count: metrics.countOverdue,
        color: STATUS_COLORS.atrasada,
      },
      {
        name: 'Parciais',
        key: 'parcial',
        value: metrics.partialCents / 100,
        count: metrics.countPartial,
        color: STATUS_COLORS.parcial,
      },
    ].filter((item) => item.value > 0 || item.count > 0);
  }, [metrics]);

  // Arrecadação por Turma ou por Aluno (quando uma turma está filtrada)
  const classBreakdownData = useMemo(() => {
    if (selectedClassId) {
      // Comparativo por Aluno dentro da turma selecionada
      const studentMap = new Map<
        string,
        { name: string; expected: number; paid: number; overdue: number; count: number }
      >();

      for (const f of filteredFees) {
        const sKey = f.studentId || f.studentName || 'Aluno';
        const sName = f.studentName || `Aluno ${f.registrationNumber || ''}`.trim() || 'Aluno';

        if (!studentMap.has(sKey)) {
          studentMap.set(sKey, { name: sName, expected: 0, paid: 0, overdue: 0, count: 0 });
        }
        const entry = studentMap.get(sKey)!;
        entry.expected += (f.amountCents || 0) / 100;
        entry.paid += (f.paidAmountCents || 0) / 100;
        if (f.status === 'atrasada') {
          entry.overdue += Math.max(0, (f.amountCents || 0) - (f.paidAmountCents || 0)) / 100;
        }
        entry.count++;
      }

      return Array.from(studentMap.values())
        .map((entry) => ({
          ...entry,
          rate: entry.expected > 0 ? Math.round((entry.paid / entry.expected) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name, 'pt-BR'));
    }

    // Comparativo consolidado por Turma
    const map = new Map<
      string,
      { name: string; classNumber?: number; expected: number; paid: number; overdue: number; count: number }
    >();

    for (const f of filteredFees) {
      const cId = f.classId || f.className || 'Sem Turma';
      const cRecord = (classes.items ?? []).find((c) => c.id === f.classId);
      const cName = f.className || String(cRecord?.name ?? '') || 'Turma não atribuída';
      const num = cRecord?.class_number !== undefined && cRecord.class_number !== null
        ? Number(cRecord.class_number)
        : extractClassNumber(cName);
      const clean = cleanClassName(cName);
      const displayName = formatClassDisplayName(num, clean);

      if (!map.has(cId)) {
        map.set(cId, { name: displayName, classNumber: num, expected: 0, paid: 0, overdue: 0, count: 0 });
      }
      const entry = map.get(cId)!;
      entry.expected += (f.amountCents || 0) / 100;
      entry.paid += (f.paidAmountCents || 0) / 100;
      if (f.status === 'atrasada') {
        entry.overdue += Math.max(0, (f.amountCents || 0) - (f.paidAmountCents || 0)) / 100;
      }
      entry.count++;
    }

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        rate: entry.expected > 0 ? Math.round((entry.paid / entry.expected) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        const numA = a.classNumber ?? 999999;
        const numB = b.classNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [filteredFees, selectedClassId, classes.items]);

  // Expenses & Incomes by Category
  const categoryBreakdownData = useMemo(() => {
    const catMap = new Map<string, { category: string; entrada: number; saida: number }>();
    for (const tx of cashList) {
      const cat = tx.category || 'Outros';
      if (!catMap.has(cat)) {
        catMap.set(cat, { category: cat, entrada: 0, saida: 0 });
      }
      const item = catMap.get(cat)!;
      if (tx.type === 'entrada') {
        item.entrada += (tx.amountCents || 0) / 100;
      } else {
        item.saida += (tx.amountCents || 0) / 100;
      }
    }
    return Array.from(catMap.values())
      .sort((a, b) => (b.entrada + b.saida) - (a.entrada + a.saida))
      .slice(0, 8);
  }, [cashList]);

  // Payment Methods Breakdown
  const paymentMethodsData = useMemo(() => {
    const methodLabels: Record<string, string> = {
      PIX: 'PIX',
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      boleto: 'Boleto',
      transferencia: 'Transferência',
      outro: 'Outro',
    };

    const map = new Map<string, { method: string; entrada: number; saida: number; count: number }>();
    for (const tx of cashList) {
      const m = tx.paymentMethod || 'outro';
      const label = methodLabels[m] || m;
      if (!map.has(label)) {
        map.set(label, { method: label, entrada: 0, saida: 0, count: 0 });
      }
      const item = map.get(label)!;
      if (tx.type === 'entrada') {
        item.entrada += (tx.amountCents || 0) / 100;
      } else {
        item.saida += (tx.amountCents || 0) / 100;
      }
      item.count++;
    }
    return Array.from(map.values()).sort((a, b) => (b.entrada + b.saida) - (a.entrada + a.saida));
  }, [cashList]);

  if (!session || !canManageFinance(session.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito à equipe financeira e à administração.
      </div>
    );
  }

  const urgentFees = filteredFees
    .filter((f) => f.status === 'atrasada' || f.status === 'aberto' || f.status === 'parcial')
    .slice(0, 6);

  const recentTransactions = cashList.slice(0, 6);

  return (
    <div className="flex flex-col gap-5 text-left">
      {/* Top Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Painel Financeiro & B.I.</p>
              <p className="text-[11px] text-slate-400 font-medium">
                Competência {MONTH_NAMES[parseInt(filterMonth, 10) - 1]} / {filterYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Month & Year Selects */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Mês de competência"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Ano de competência"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {['2024', '2025', '2026', '2027', '2028'].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Mês Atual
              </button>
              <button
                type="button"
                onClick={handlePreviousMonth}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Mês Anterior
              </button>
            </div>

            {/* Turma Filter */}
            <select
              aria-label="Filtrar por turma"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">Todas as turmas</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              aria-label="Filtrar por situação"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">Todas as situações</option>
              <option value="aberto">Em Aberto</option>
              <option value="paga">Pagas</option>
              <option value="atrasada">Atrasadas</option>
              <option value="parcial">Parciais</option>
            </select>

            {/* Reset button */}
            {(selectedClassId || selectedStatus !== 'all') && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="Limpar filtros adicionais"
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Print action */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

            {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin ml-1" />}
          </div>
        </div>
      </div>

      {/* KPI Cards: Mensalidades & Recebíveis */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-amber-600" />
            <span>Mensalidades e Recebíveis</span>
          </h2>
          <button
            type="button"
            onClick={() => navigate('/financeiro/mensalidades')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
          >
            <span>Ver todas as mensalidades</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Receita Prevista</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {formatCents(metrics.expectedCents)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {metrics.totalCount} títulos emitidos
            </p>
          </div>

          <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs bg-emerald-50/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Total Recebido</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                {metrics.collectionRate}%
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatCents(metrics.paidCents)}
            </p>
            <p className="text-[11px] text-emerald-600/70 mt-1">
              {metrics.countPaid} quitados / {metrics.countPartial} parciais
            </p>
          </div>

          <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-2xs bg-amber-50/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>A Receber (Aberto)</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">
              {formatCents(metrics.pendingCents)}
            </p>
            <p className="text-[11px] text-amber-600/70 mt-1">
              {metrics.countOpen} dentro do vencimento
            </p>
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs bg-rose-50/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Inadimplência</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                {metrics.delinquencyRate}%
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
              {formatCents(metrics.overdueCents)}
            </p>
            <p className="text-[11px] text-rose-600/70 mt-1">
              {metrics.countOverdue} títulos em atraso
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards: Fluxo de Caixa Consolidado */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-indigo-600" />
            <span>Fluxo de Caixa Consolidado</span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/financeiro/entradas')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
            >
              Entradas →
            </button>
            <button
              type="button"
              onClick={() => navigate('/financeiro/saidas')}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Saídas →
            </button>
            <button
              type="button"
              onClick={() => navigate('/financeiro/caixa')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
            >
              Livro Caixa →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Saldo Anterior</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {formatCents(cashSummary.openingBalanceCents || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Acumulado antes deste mês</p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/financeiro/entradas')}
            className="text-left bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
              <span>Total de Entradas</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatCents(cashSummary.totalInflowCents || 0)}
            </p>
            <p className="text-[11px] text-emerald-600/70 mt-1">Receitas e mensalidades</p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/financeiro/saidas')}
            className="text-left bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs bg-rose-50/20 hover:bg-rose-50/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
              <ArrowUpCircle className="w-4 h-4 text-rose-600" />
              <span>Total de Saídas</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
              {formatCents(cashSummary.totalOutflowCents || 0)}
            </p>
            <p className="text-[11px] text-rose-600/70 mt-1">Despesas e estornos</p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/financeiro/caixa')}
            className="text-left bg-slate-900 text-white border border-slate-800 rounded-2xl p-4 shadow-2xs hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Wallet className="w-4 h-4 text-sky-400" />
              <span>Saldo Atual em Caixa</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-white mt-1">
              {formatCents(cashSummary.closingBalanceCents || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Fluxo líquido: {formatCents(cashSummary.netFlowCents || 0)}
            </p>
          </button>
        </div>
      </div>

      {/* Visual Charts Row 1: Daily Cash Flow & Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Cash Flow AreaChart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-600" />
                <span>Fluxo Financeiro Diário</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Entradas vs. Saídas diárias e evolução do saldo acumulado
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-600">Entradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="font-semibold text-slate-600">Saídas</span>
              </div>
            </div>
          </div>

          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dailyCashFlowData}
                margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
              >
                <defs>
                  <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  stroke="#E2E8F0"
                  minTickGap={20}
                />
                <YAxis
                  tickFormatter={(val) => `R$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  stroke="#E2E8F0"
                  width={60}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatCurrency(Number(value)),
                    name === 'entradas' ? 'Entradas' : name === 'saidas' ? 'Saídas' : 'Saldo',
                  ]}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="entradas"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorEntradas)"
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke="#F43F5E"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSaidas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution Donut Chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-600" />
              <span>Situação das Mensalidades</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Composição por valores e parcelas</p>
          </div>

          <div className="w-full h-72">
            {statusDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {statusDistributionData.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, _name: any, item: any) => [
                      `${formatCurrency(Number(val))} (${item.payload.count} títulos)`,
                      item.payload.name,
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Layers className="w-8 h-8 mb-2 stroke-1 text-slate-300" />
                <p>Nenhuma mensalidade neste período.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Visual Charts Row 2: Turmas Comparison & Expense by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Arrecadação por Turma ou por Aluno */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-sky-600" />
                <span>
                  {selectedClassId ? 'Arrecadação por Aluno' : 'Arrecadação e Inadimplência por Turma'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedClassId
                  ? selectedClassName
                    ? `Comparativo de valores por aluno em ${selectedClassName}`
                    : 'Comparativo de valores por aluno na turma selecionada'
                  : 'Comparativo de valores previstos e realizados por turma'}
              </p>
            </div>
          </div>

          {classBreakdownData.length > 0 ? (
            <div
              style={{
                height: Math.min(480, Math.max(260, classBreakdownData.length * 48)),
              }}
              className="w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={classBreakdownData}
                  layout="vertical"
                  margin={{ top: 8, right: 72, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(val) => `R$${val}`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    stroke="#E2E8F0"
                  />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      formatCurrency(Number(val)),
                      name === 'expected'
                        ? 'Previsto'
                        : name === 'paid'
                        ? 'Recebido'
                        : 'Em Atraso',
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Bar
                    dataKey="expected"
                    name="Previsto"
                    fill="#E2E8F0"
                    radius={[0, 6, 6, 0]}
                    barSize={28}
                    label={(props: any) => {
                      const { x, y, width, height, index } = props;
                      const entry = classBreakdownData[index];
                      if (!entry) return null;
                      const displayName = entry.name;
                      const nameEstimateWidth = displayName.length * 7.2;
                      const minPctX = x + 12 + nameEstimateWidth + 14;
                      const pctX = Math.max(x + width + 8, minPctX);
                      return (
                        <g>
                          <text
                            x={x + 12}
                            y={y + height / 2}
                            fill="#0F172A"
                            fontSize={12}
                            fontWeight={600}
                            dominantBaseline="central"
                            style={{ pointerEvents: 'none' }}
                          >
                            {displayName}
                          </text>
                          <text
                            x={pctX}
                            y={y + height / 2}
                            fill="#0F172A"
                            fontSize={11}
                            fontWeight={700}
                            dominantBaseline="central"
                          >
                            {entry.rate}%
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Bar
                    dataKey="paid"
                    name="Recebido"
                    fill="#10B981"
                    radius={[0, 6, 6, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              {selectedClassId
                ? 'Nenhum aluno com mensalidades nesta turma para esta competência.'
                : 'Nenhuma turma com mensalidades lançadas para esta competência.'}
            </div>
          )}
        </div>

        {/* Categorias de Entradas e Saídas */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Movimentações por Categoria</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Principais categorias de receitas e despesas no período
              </p>
            </div>
          </div>

          {categoryBreakdownData.length > 0 ? (
            <div
              style={{
                height: Math.min(480, Math.max(260, categoryBreakdownData.length * 44)),
              }}
              className="w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryBreakdownData}
                  layout="vertical"
                  margin={{ top: 8, right: 36, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(val) => `R$${val}`}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    stroke="#E2E8F0"
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={130}
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    stroke="#E2E8F0"
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      formatCurrency(Number(val)),
                      name === 'entrada' ? 'Receita' : 'Despesa',
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Bar
                    dataKey="entrada"
                    name="Receita"
                    fill="#10B981"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  />
                  <Bar
                    dataKey="saida"
                    name="Despesa"
                    fill="#F43F5E"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              Nenhuma movimentação de caixa categorizada no período.
            </div>
          )}
        </div>
      </div>

      {/* Meios de Pagamento Cards */}
      {paymentMethodsData.length > 0 && (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Distribuição por Meio de Pagamento no Caixa:
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            {paymentMethodsData.map((m) => (
              <div
                key={m.method}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <p className="font-bold text-slate-900 truncate">{m.method}</p>
                  <p className="text-[11px] text-slate-400">{m.count} transações</p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-0.5">
                  {m.entrada > 0 && (
                    <span className="text-emerald-700 font-bold text-xs">
                      +{formatCurrency(m.entrada)}
                    </span>
                  )}
                  {m.saida > 0 && (
                    <span className="text-rose-600 font-bold text-xs">
                      -{formatCurrency(m.saida)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Operational Shortcuts Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Títulos em Aberto / Vencidos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Mensalidades Críticas (Pendentes / Em Atraso)
              </h3>
              <p className="text-[11px] text-slate-400">Títulos que requerem atenção</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/financeiro/mensalidades')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Gerenciar
            </button>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <div className="p-6 text-center text-slate-400">Carregando mensalidades...</div>
            ) : urgentFees.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                Nenhuma mensalidade pendente ou em atraso para o período selecionado.
              </div>
            ) : (
              urgentFees.map((f) => (
                <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{f.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      Comp. {String(f.competenceMonth).padStart(2, '0')}/{f.competenceYear} · Venc.{' '}
                      {formatDate(f.dueDate)} {f.className ? `· ${f.className}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-slate-900">
                      {formatCents(f.amountCents - f.paidAmountCents)}
                    </p>
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        f.status === 'atrasada'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : f.status === 'parcial'
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {f.status === 'atrasada'
                        ? 'Atrasada'
                        : f.status === 'parcial'
                        ? 'Parcial'
                        : 'Em Aberto'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Últimas Movimentações do Caixa */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Últimas Movimentações no Caixa
              </h3>
              <p className="text-[11px] text-slate-400">Entradas e saídas recentes</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/financeiro/caixa')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Ver Caixa
            </button>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {loading ? (
              <div className="p-6 text-center text-slate-400">Carregando movimentações...</div>
            ) : recentTransactions.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                Nenhuma movimentação registrada no período selecionado.
              </div>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {tx.type === 'entrada' ? (
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <MinusCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      <p className="font-bold text-slate-900 truncate">{tx.description}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatDate(tx.date)} · {tx.category} · {tx.paymentMethod}
                    </p>
                  </div>
                  <div
                    className={`font-black shrink-0 ${
                      tx.type === 'entrada' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {tx.type === 'entrada' ? '+' : '-'} {formatCents(tx.amountCents)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinanceDashboardPage;
