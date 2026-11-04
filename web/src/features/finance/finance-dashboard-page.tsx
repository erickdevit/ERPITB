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
import { ClassFilterFields, filterClassesByAttributes } from '../class-filter-controls';
import { formatPrintDocumentTitle, printWithDocumentTitle } from '../../lib/print-helper';
import {
  AgingBucketsChart,
  CashFlowWaterfallChart,
  ChartContainer,
  DonutMetricChart,
  HorizontalBarChart,
  formatCurrencyCents,
  formatCurrencyValue,
  formatPercent,
  formatInteger,
  CHART_TOKENS,
} from '../../lib/charts';

function formatCents(cents: number): string {
  return formatCurrencyCents(cents);
}

function formatCurrency(val: number): string {
  return formatCurrencyValue(val);
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
  const [filterWeekDay, setFilterWeekDay] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterLabId, setFilterLabId] = useState('');

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

  const filteredClasses = useMemo(() => {
    return filterClassesByAttributes(classes.items ?? [], {
      weekDay: filterWeekDay,
      shift: filterShift,
      laboratoryId: filterLabId,
    });
  }, [classes.items, filterWeekDay, filterShift, filterLabId]);

  // Turma options sorted in ascending numeric order
  const classOptions = useMemo(() => {
    const raw = filteredClasses.filter(
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
    setFilterWeekDay('');
    setFilterShift('');
    setFilterLabId('');
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

  // Aging distribution of overdue fees
  const agingBucketsData = useMemo(() => {
    const today = new Date();
    const d1_15 = { bucket: '1 a 15 dias', amountCents: 0, count: 0, color: '#F59E0B' };
    const d16_30 = { bucket: '16 a 30 dias', amountCents: 0, count: 0, color: '#F97316' };
    const d31_60 = { bucket: '31 a 60 dias', amountCents: 0, count: 0, color: '#EF4444' };
    const d60_plus = { bucket: 'Mais de 60 dias', amountCents: 0, count: 0, color: '#B91C1C' };

    for (const f of filteredFees) {
      if (f.status !== 'atrasada') continue;
      const balance = Math.max(0, (f.amountCents || 0) - (f.paidAmountCents || 0));
      if (balance <= 0) continue;
      const due = new Date(f.dueDate);
      const diffDays = Math.max(1, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 15) {
        d1_15.amountCents += balance;
        d1_15.count++;
      } else if (diffDays <= 30) {
        d16_30.amountCents += balance;
        d16_30.count++;
      } else if (diffDays <= 60) {
        d31_60.amountCents += balance;
        d31_60.count++;
      } else {
        d60_plus.amountCents += balance;
        d60_plus.count++;
      }
    }

    return [d1_15, d16_30, d31_60, d60_plus];
  }, [filteredFees]);

  // Status Distribution Chart Data (Donut)
  const statusDistributionData = useMemo(() => {
    return [
      {
        name: 'Pagas',
        value: metrics.paidCents / 100,
        count: metrics.countPaid,
        color: STATUS_COLORS.paga,
      },
      {
        name: 'Em Aberto',
        value: metrics.pendingCents / 100,
        count: metrics.countOpen,
        color: STATUS_COLORS.aberto,
      },
      {
        name: 'Atrasadas',
        value: metrics.overdueCents / 100,
        count: metrics.countOverdue,
        color: STATUS_COLORS.atrasada,
      },
      {
        name: 'Parciais',
        value: metrics.partialCents / 100,
        count: metrics.countPartial,
        color: STATUS_COLORS.parcial,
      },
    ].filter((item) => item.value > 0 || (item.count !== undefined && item.count > 0));
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
      .map((item) => ({ ...item, total: item.entrada + item.saida }))
      .sort((a, b) => b.total - a.total)
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

            {/* Class attribute filters: Dia da semana, Turno, Lab */}
            <ClassFilterFields
              compact
              weekDay={filterWeekDay}
              onWeekDayChange={setFilterWeekDay}
              shift={filterShift}
              onShiftChange={setFilterShift}
              laboratoryId={filterLabId}
              onLaboratoryIdChange={setFilterLabId}
            />

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
            {(selectedClassId || selectedStatus !== 'all' || filterWeekDay || filterShift || filterLabId) && (
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
              onClick={() =>
                printWithDocumentTitle(
                  formatPrintDocumentTitle(['Painel Financeiro', new Date().toLocaleDateString('pt-BR').replaceAll('/', '-')]),
                )
              }
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

      {/* Visual Charts Row 1: Cash Flow Waterfall & Status Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Waterfall Cash Bridge */}
        <div className="lg:col-span-2">
          <ChartContainer
            title="Ponte Financeira de Caixa (Waterfall)"
            subtitle="Saldo anterior, total arrecadado, despesas liquidadas e saldo de fechamento"
            ariaLabel="Gráfico em cascata do fluxo de caixa com saldo inicial, entradas, saídas e saldo final"
            summary={`Saldo inicial de ${formatCents(cashSummary.openingBalanceCents || 0)}, entradas de ${formatCents(cashSummary.totalInflowCents || 0)}, saídas de ${formatCents(cashSummary.totalOutflowCents || 0)}, resultando em saldo final de ${formatCents(cashSummary.closingBalanceCents || 0)}.`}
            empty={!cashList.length && !cashSummary.openingBalanceCents}
            emptyMessage="Nenhuma movimentação de caixa registrada no período."
            height={280}
            tableData={[
              { etapa: 'Saldo Anterior', valor: formatCents(cashSummary.openingBalanceCents || 0) },
              { etapa: 'Entradas (+)', valor: formatCents(cashSummary.totalInflowCents || 0) },
              { etapa: 'Saídas (-)', valor: formatCents(cashSummary.totalOutflowCents || 0) },
              { etapa: 'Saldo Final', valor: formatCents(cashSummary.closingBalanceCents || 0) },
            ]}
            tableColumns={[
              { header: 'Etapa do Caixa', key: 'etapa' },
              { header: 'Valor Líquido', key: 'valor', align: 'right' },
            ]}
          >
            <CashFlowWaterfallChart
              openingCents={cashSummary.openingBalanceCents || 0}
              inflowsCents={cashSummary.totalInflowCents || 0}
              outflowsCents={cashSummary.totalOutflowCents || 0}
              closingCents={cashSummary.closingBalanceCents || 0}
              height={280}
            />
          </ChartContainer>
        </div>

        {/* Status Distribution Donut Chart */}
        <div>
          <ChartContainer
            title="Situação das Mensalidades"
            subtitle="Composição por valores e parcelas"
            ariaLabel="Gráfico de distribuição da situação das mensalidades"
            summary={`De ${metrics.totalCount} títulos no período, ${metrics.countPaid} estão quitados e ${metrics.countOverdue} estão em atraso (${metrics.delinquencyRate}% de inadimplência).`}
            empty={!statusDistributionData.length}
            emptyMessage="Nenhuma mensalidade neste período."
            height={280}
            tableData={statusDistributionData}
            tableColumns={[
              { header: 'Situação', key: 'name' },
              { header: 'Títulos', key: 'count', align: 'center', format: (c) => formatInteger(Number(c)) },
              { header: 'Valor Total', key: 'value', align: 'right', format: (v) => formatCurrency(Number(v)) },
            ]}
          >
            <DonutMetricChart
              data={statusDistributionData}
              centerLabel="Previsto"
              centerValue={formatCents(metrics.expectedCents)}
              valueFormatter={(v, item) => `${formatCurrency(v)} (${item?.count ?? 0} títulos)`}
              height={280}
            />
          </ChartContainer>
        </div>
      </div>

      {/* Visual Charts Row 2: Turmas Comparison & Receivables Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Arrecadação por Turma ou por Aluno */}
        <div>
          <ChartContainer
            title={selectedClassId ? 'Arrecadação por Aluno' : 'Arrecadação e Inadimplência por Turma'}
            subtitle={
              selectedClassId
                ? selectedClassName
                  ? `Comparativo de valores por aluno em ${selectedClassName}`
                  : 'Comparativo de valores por aluno na turma selecionada'
                : 'Comparativo de valores previstos e realizados por turma'
            }
            ariaLabel={selectedClassId ? 'Gráfico comparativo de arrecadação por aluno' : 'Gráfico comparativo de arrecadação por turma'}
            empty={!classBreakdownData.length}
            emptyMessage={
              selectedClassId
                ? 'Nenhum aluno com mensalidades nesta turma para esta competência.'
                : 'Nenhuma turma com mensalidades lançadas para esta competência.'
            }
            height={Math.min(480, Math.max(260, classBreakdownData.length * 48))}
            tableData={classBreakdownData}
            tableColumns={[
              { header: selectedClassId ? 'Aluno' : 'Turma', key: 'name' },
              { header: 'Previsto', key: 'expected', align: 'right', format: (v) => formatCurrency(Number(v)) },
              { header: 'Recebido', key: 'paid', align: 'right', format: (v) => formatCurrency(Number(v)) },
              { header: 'Adimplência', key: 'rate', align: 'right', format: (v) => formatPercent(Number(v)) },
            ]}
          >
            <HorizontalBarChart
              data={classBreakdownData}
              categoryKey="name"
              valueKey="paid"
              valueSuffix=""
              valueFormatter={(val, item) => `${formatCurrency(val)} / ${formatCurrency(item?.expected ?? 0)} (${item?.rate ?? 0}%)`}
              barColor="#10B981"
              height={Math.min(480, Math.max(260, classBreakdownData.length * 48))}
            />
          </ChartContainer>
        </div>

        {/* Receivables Aging Buckets */}
        <div>
          <ChartContainer
            title="Aging de Inadimplência (Faixas de Atraso)"
            subtitle="Distribuição da dívida vencida por faixa temporal de cobrança"
            ariaLabel="Gráfico de barras da distribuição de mensalidades em atraso por faixa de tempo"
            summary={`Total de títulos atrasados agrupados nas faixas de 1-15 dias, 16-30 dias, 31-60 dias e mais de 60 dias.`}
            empty={!agingBucketsData.some((b) => b.amountCents > 0)}
            emptyMessage="Nenhuma mensalidade em atraso para distribuição de aging."
            height={Math.min(480, Math.max(260, classBreakdownData.length * 48))}
            tableData={agingBucketsData}
            tableColumns={[
              { header: 'Faixa de Vencimento', key: 'bucket' },
              { header: 'Títulos', key: 'count', align: 'center', format: (c) => formatInteger(Number(c)) },
              { header: 'Valor em Atraso', key: 'amountCents', align: 'right', format: (v) => formatCents(Number(v)) },
            ]}
          >
            <AgingBucketsChart
              buckets={agingBucketsData}
              height={Math.min(480, Math.max(260, classBreakdownData.length * 48))}
            />
          </ChartContainer>
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
