import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app-context';
import { canManageFinance, type CashTransaction, type FinancialFee } from '../../types';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function FinanceDashboardPage() {
  const { api, session } = useApp();
  const navigate = useNavigate();

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>(String(now.getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));

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
        const monthPad = filterMonth.padStart(2, '0');
        const ym = `${filterYear}-${monthPad}`;
        const [feesRes, cashRes] = await Promise.all([
          api.getFees({ month: filterMonth, year: filterYear }),
          api.getCash({ month: ym }),
        ]);
        if (!active) return;
        setFeesList(feesRes.items || []);
        setFeesSummary(feesRes.summary || {});
        setCashList(cashRes.items || []);
        setCashSummary(cashRes.summary || {});
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

  if (!session || !canManageFinance(session.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito à equipe financeira e à administração.
      </div>
    );
  }

  const urgentFees = feesList
    .filter((f) => f.status === 'atrasada' || f.status === 'aberto' || f.status === 'parcial')
    .slice(0, 5);

  const recentTransactions = cashList.slice(0, 5);

  return (
    <div className="flex flex-col gap-5 text-left">
      {/* Top Filter Bar for Dashboard Period */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800">Competência de Análise:</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {['2024', '2025', '2026', '2027', '2028'].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {loading && (
            <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin ml-1" />
          )}
        </div>
      </div>

      {/* Section 1: Mensalidades & Recebíveis KPIs */}
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
              {formatCents(feesSummary.totalExpectedCents || 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {feesSummary.totalFeesCount || feesSummary.totalFees || 0} títulos emitidos
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
              {formatCents(feesSummary.totalPendingCents || feesSummary.totalOpenCents || 0)}
            </p>
            <p className="text-[11px] text-amber-600/70 mt-1">Dentro do vencimento</p>
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs bg-rose-50/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Inadimplência</span>
              </div>
              {feesSummary.delinquencyRate !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                  {feesSummary.delinquencyRate}%
                </span>
              )}
            </div>
            <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">
              {formatCents(feesSummary.totalOverdueCents || 0)}
            </p>
            <p className="text-[11px] text-rose-600/70 mt-1">
              {feesSummary.overdueCount || 0} títulos em atraso
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Fluxo de Caixa Consolidado */}
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
            <p className="text-[11px] text-emerald-600/70 mt-1">Mensalidades e receitas</p>
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

      {/* Section 3: Totais por Método de Pagamento */}
      {cashSummary.totalsByMethod && (
        <div className="bg-slate-100/70 rounded-2xl p-3.5 flex flex-wrap items-center gap-2.5 text-xs">
          <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
            Totais por Método no Mês:
          </span>
          {Object.entries(cashSummary.totalsByMethod).map(([method, vals]: any) => {
            if (vals.entrada === 0 && vals.saida === 0) return null;
            return (
              <div
                key={method}
                className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-medium flex items-center gap-2 shadow-2xs"
              >
                <span className="font-bold text-slate-800">{method}:</span>
                <span className="text-emerald-700 font-semibold">+{formatCents(vals.entrada)}</span>
                {vals.saida > 0 && (
                  <span className="text-rose-600 font-semibold">-{formatCents(vals.saida)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Section 4: Operational Shortcut Lists Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Títulos em Aberto / Vencidos */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Mensalidades Pendentes / Em Atraso
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
