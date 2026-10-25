import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  LayoutDashboard,
  PlusCircle,
  MinusCircle,
  Wallet,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../app-context';
import { canManageFinance, type CashTransaction, type FinancialFee } from '../../types';
import { CashView } from './cash-view';
import { FeesView } from './fees-view';

export type FinanceTab = 'dashboard' | 'mensalidades' | 'caixa' | 'entradas' | 'saidas';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function tabFromPathname(pathname: string): FinanceTab {
  if (pathname.startsWith('/financeiro/mensalidades')) return 'mensalidades';
  if (pathname.startsWith('/financeiro/caixa')) return 'caixa';
  if (pathname.startsWith('/financeiro/entradas')) return 'entradas';
  if (pathname.startsWith('/financeiro/saidas')) return 'saidas';
  return 'dashboard';
}

function pathForTab(tab: FinanceTab): string {
  switch (tab) {
    case 'dashboard':
      return '/financeiro/dashboard';
    case 'mensalidades':
      return '/financeiro/mensalidades';
    case 'caixa':
      return '/financeiro/caixa';
    case 'entradas':
      return '/financeiro/entradas';
    case 'saidas':
      return '/financeiro/saidas';
  }
}

function FinanceDashboardView({ onSelectTab }: { onSelectTab: (tab: FinanceTab) => void }) {
  const { api } = useApp();
  const [loading, setLoading] = useState(true);
  const [feesSummary, setFeesSummary] = useState<any>({});
  const [feesList, setFeesList] = useState<FinancialFee[]>([]);
  const [cashSummary, setCashSummary] = useState<any>({});
  const [cashList, setCashList] = useState<CashTransaction[]>([]);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const [feesRes, cashRes] = await Promise.all([
          api.getFees(),
          api.getCash({ month: currentMonth }),
        ]);
        if (!active) return;
        setFeesList(feesRes.items || []);
        setFeesSummary(feesRes.summary || {});
        setCashList(cashRes.items || []);
        setCashSummary(cashRes.summary || {});
      } catch {
        // ignore network errors in dashboard overview
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => {
      active = false;
    };
  }, [api]);

  const urgentFees = feesList
    .filter((f) => f.status === 'atrasada' || f.status === 'aberto' || f.status === 'parcial')
    .slice(0, 5);

  const recentTransactions = cashList.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1: Mensalidades & Recebíveis KPIs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Visão de Mensalidades e Recebíveis</h2>
          <button
            type="button"
            onClick={() => onSelectTab('mensalidades')}
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
          >
            Ver todas as mensalidades →
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Receita Prevista</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {formatCents(feesSummary.totalExpectedCents || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {feesSummary.totalFees || 0} títulos emitidos
            </p>
          </div>

          <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs bg-emerald-50/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Total Recebido</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatCents(feesSummary.totalPaidCents || 0)}
            </p>
            <p className="text-[11px] text-emerald-600/70 mt-1">
              {feesSummary.paidCount || 0} pagos / {feesSummary.partialCount || 0} parciais
            </p>
          </div>

          <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-2xs bg-amber-50/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>A Receber (Aberto)</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">
              {formatCents(feesSummary.totalPendingCents || 0)}
            </p>
            <p className="text-[11px] text-amber-600/70 mt-1">Saldo pendente total</p>
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs bg-rose-50/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Em Atraso (Inadimplência)</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
              {formatCents(feesSummary.totalOverdueCents || 0)}
            </p>
            <p className="text-[11px] text-rose-600/70 mt-1">
              {feesSummary.overdueCount || 0} títulos vencidos
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Fluxo de Caixa do Mês */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Fluxo de Caixa Consolidado (Mês Atual)</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('entradas')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
            >
              Entradas →
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('saidas')}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Saídas →
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('caixa')}
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
            onClick={() => onSelectTab('entradas')}
            className="text-left bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs bg-emerald-50/20 hover:bg-emerald-50/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
              <span>Total de Entradas</span>
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatCents(cashSummary.totalInflowCents || 0)}
            </p>
            <p className="text-[11px] text-emerald-600/70 mt-1">Mensalidades e receitas</p>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('saidas')}
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
            onClick={() => onSelectTab('caixa')}
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

      {/* Section 3: Recent Tables Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Títulos em Aberto / Vencidos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Mensalidades Pendentes / Em Atraso
              </h3>
              <p className="text-[11px] text-slate-400">Títulos aguardando quitação</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('mensalidades')}
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
                Nenhuma mensalidade pendente ou em atraso.
              </div>
            ) : (
              urgentFees.map((f) => (
                <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{f.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      Comp. {String(f.competenceMonth).padStart(2, '0')}/{f.competenceYear} · Venc.{' '}
                      {formatDate(f.dueDate)}
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
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {f.status === 'atrasada' ? 'Atrasada' : f.status === 'parcial' ? 'Parcial' : 'Em Aberto'}
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
              onClick={() => onSelectTab('caixa')}
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
                Nenhuma movimentação registrada neste mês.
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

export function FinancePage() {
  const { session } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FinanceTab>(() => tabFromPathname(location.pathname));

  useEffect(() => {
    setActiveTab(tabFromPathname(location.pathname));
  }, [location.pathname]);

  const handleSelectTab = (tab: FinanceTab) => {
    setActiveTab(tab);
    const targetPath = pathForTab(tab);
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  };

  if (!session || !canManageFinance(session.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito à equipe financeira e à administração.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      {/* Header with Title and Submenu Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? 'Dashboard Financeiro'
              : activeTab === 'mensalidades'
                ? 'Mensalidades'
                : activeTab === 'caixa'
                  ? 'Controle de Caixa'
                  : activeTab === 'entradas'
                    ? 'Entradas Financeiras'
                    : 'Saídas Financeiras'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Controle de mensalidades escolares, recebimentos, entradas, saídas e Livro Caixa.
          </p>
        </div>

        {/* 5-Tab Switcher matching Sidebar Submenu */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => handleSelectTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-sky-600" />
            <span>Dashboard Financeiro</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('mensalidades')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'mensalidades'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-amber-600" />
            <span>Mensalidades</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('caixa')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'caixa'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5 text-indigo-600" />
            <span>Controle de Caixa</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('entradas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'entradas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Entradas</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('saidas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'saidas'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Saídas</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'dashboard' && <FinanceDashboardView onSelectTab={handleSelectTab} />}
        {activeTab === 'mensalidades' && <FeesView />}
        {activeTab === 'caixa' && <CashView mode="all" />}
        {activeTab === 'entradas' && <CashView mode="entrada" />}
        {activeTab === 'saidas' && <CashView mode="saida" />}
      </div>
    </div>
  );
}
