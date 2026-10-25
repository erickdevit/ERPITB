import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  DollarSign,
  Filter,
  MinusCircle,
  Plus,
  PlusCircle,
  Printer,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../app-context';
import { PageDialog } from '../../components';
import type { CashTransaction, CashType, PaymentMethod } from '../../types';
import { CashPrintDocument } from './finance-print';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function CashView({ mode = 'all' }: { mode?: 'all' | 'entrada' | 'saida' } = {}) {
  const { api, branding } = useApp();

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState<string>(mode === 'all' ? 'all' : mode);
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [reversalOpen, setReversalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CashTransaction | null>(null);

  // Form states
  const [txType, setTxType] = useState<CashType>(mode === 'saida' ? 'saida' : 'entrada');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [reference, setReference] = useState('');
  const [studentName, setStudentName] = useState('');

  // Reversal form
  const [reversalReason, setReversalReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (mode === 'entrada') {
      setFilterType('entrada');
      setTxType('entrada');
    } else if (mode === 'saida') {
      setFilterType('saida');
      setTxType('saida');
    } else {
      setFilterType('all');
    }
  }, [mode]);

  const effectiveType = mode === 'all' ? filterType : mode;

  const loadCash = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterMonth) params.month = filterMonth;
      if (effectiveType !== 'all') params.type = effectiveType;
      if (filterMethod !== 'all') params.paymentMethod = filterMethod;

      const res = await api.getCash(params);
      setTransactions(res.items || []);
      setSummary(res.summary || {});
    } catch {
      // offline/error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCash();
  }, [filterMonth, effectiveType, filterMethod]);

  const filteredItems = useMemo(() => {
    const byMode =
      mode === 'all' ? transactions : transactions.filter((t) => t.type === mode);
    if (!search.trim()) return byMode;
    const q = search.toLowerCase();
    return byMode.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.studentName?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q),
    );
  }, [transactions, search, mode]);

  const handleCreateEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      const amountCents = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);
      await api.createCashEntry({
        type: txType,
        amountCents,
        date,
        category: category.trim(),
        description: description.trim(),
        paymentMethod,
        reference: reference.trim() || undefined,
        studentName: studentName.trim() || undefined,
      });
      setCreateOpen(false);
      setAmountStr('');
      setCategory('');
      setDescription('');
      setReference('');
      setStudentName('');
      await loadCash();
    } catch (err: any) {
      setMessage(err.message || 'Erro ao registrar movimentação.');
    } finally {
      setBusy(false);
    }
  };

  const handleReverseEntry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTx) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await api.reverseCashEntry(selectedTx.id, reversalReason.trim());
      setReversalOpen(false);
      setSelectedTx(null);
      setReversalReason('');
      await loadCash();
    } catch (err: any) {
      setMessage(err.message || 'Erro ao estornar movimentação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 text-left print:hidden">
        {/* Filter and Action Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar descrição, aluno ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
          />

          {mode === 'all' && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
            >
              <option value="all">Todas as movimentações</option>
              <option value="entrada">Apenas Entradas</option>
              <option value="saida">Apenas Saídas</option>
            </select>
          )}

          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
          >
            <option value="all">Todos os meios</option>
            <option value="PIX">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="boleto">Boleto</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>
              {mode === 'entrada'
                ? 'Imprimir Entradas'
                : mode === 'saida'
                  ? 'Imprimir Saídas'
                  : 'Imprimir Caixa'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (mode === 'entrada') setTxType('entrada');
              else if (mode === 'saida') setTxType('saida');
              setCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {mode === 'entrada'
                ? 'Nova Entrada'
                : mode === 'saida'
                  ? 'Nova Saída'
                  : 'Nova Movimentação'}
            </span>
          </button>
        </div>
      </div>

      {/* Cash Book Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-3">Descrição</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Meio de Pagamento</th>
                <th className="py-3 px-3">Referência / Vínculo</th>
                <th className="py-3 px-3 text-right">Valor</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Carregando livro caixa...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Nenhuma movimentação de caixa encontrada para este período.
                  </td>
                </tr>
              ) : (
                filteredItems.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      tx.isReversal ? 'opacity-60 bg-slate-50/50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(tx.date)}</td>
                    <td className="py-3 px-3">
                      {tx.type === 'entrada' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                          <PlusCircle className="w-3 h-3" />
                          Entrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[11px]">
                          <MinusCircle className="w-3 h-3" />
                          Saída
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900">{tx.description}</p>
                      {tx.reversalReason && (
                        <p className="text-[11px] text-amber-700 italic mt-0.5">
                          Motivo: {tx.reversalReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{tx.category}</td>
                    <td className="py-3 px-3 text-slate-700 font-medium">{tx.paymentMethod}</td>
                    <td className="py-3 px-3 text-slate-500">
                      {tx.studentName ? (
                        <span>{tx.studentName} {tx.className ? `(${tx.className})` : ''}</span>
                      ) : tx.reference ? (
                        <span className="font-mono text-[11px]">{tx.reference}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-black ${
                        tx.type === 'entrada' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {tx.type === 'entrada' ? '+' : '-'} {formatCents(tx.amountCents)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!tx.isReversal && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTx(tx);
                            setReversalOpen(true);
                          }}
                          title="Estornar lançamento (gera lançamento reverso e preserva trilha)"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Movimentação Manual */}
      {createOpen && (
        <PageDialog
          open={createOpen}
          title="Nova Movimentação de Caixa"
          onClose={() => setCreateOpen(false)}
          onSave={handleCreateEntry}
          saveText={busy ? 'Salvando...' : 'Lançar no Caixa'}
        >
          <form onSubmit={handleCreateEntry} className="flex flex-col gap-4 text-xs">
            {message && <p className="text-rose-600 font-semibold">{message}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Tipo de Movimentação</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as CashType)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                >
                  <option value="entrada">Entrada (+)</option>
                  <option value="saida">Saída (-)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Valor (R$)</label>
                <input
                  required
                  type="text"
                  placeholder="0,00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Data</label>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Meio de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="PIX">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="boleto">Boleto</option>
                  <option value="transferencia">Transferência</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Categoria</label>
              <input
                required
                type="text"
                placeholder="Ex: Mensalidade, Doação, Material Didático, Limpeza"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Descrição Detalhada</label>
              <input
                required
                type="text"
                placeholder="Descrição clara do lançamento"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Aluno / Favorecido (opcional)</label>
                <input
                  type="text"
                  placeholder="Nome do aluno ou favorecido"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Referência / Recibo (opcional)</label>
                <input
                  type="text"
                  placeholder="Nº recibo ou transação"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>
          </form>
        </PageDialog>
      )}

      {/* Modal: Estornar Lançamento */}
      {reversalOpen && selectedTx && (
        <PageDialog
          open={reversalOpen}
          title="Estorno de Lançamento"
          onClose={() => setReversalOpen(false)}
          onSave={handleReverseEntry}
          saveText={busy ? 'Processando...' : 'Confirmar Estorno'}
        >
          <form onSubmit={handleReverseEntry} className="flex flex-col gap-4 text-xs">
            {message && <p className="text-rose-600 font-semibold">{message}</p>}
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800">
              <p className="font-bold">Atenção: Trilha de Auditoria Preservada</p>
              <p className="mt-1 text-[11px]">
                Lançamentos financeiros confirmados não são apagados fisicamente. O estorno criará automaticamente um contra-lançamento compensatório com justificativa registrada.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="font-bold text-slate-900">{selectedTx.description}</p>
              <p className="text-slate-500 mt-0.5">
                Data: {formatDate(selectedTx.date)} | Valor: {formatCents(selectedTx.amountCents)} ({selectedTx.type})
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Justificativa do Estorno *</label>
              <textarea
                required
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="Informe detalhadamente o motivo do estorno..."
                className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none"
              />
            </div>
          </form>
        </PageDialog>
      )}
      </div>
      <CashPrintDocument
        transactions={filteredItems}
        summary={summary}
        periodLabel={filterMonth}
        appName={branding?.appName}
        watermarkText={branding?.printWatermarkText}
        watermarkLogoUrl={branding?.printWatermarkLogoUrl}
        watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
        logoUrl={branding?.loginLogoUrl}
        showHeaderLogoLeft={branding?.showHeaderLogoLeft ?? true}
        showHeaderLogoRight={branding?.showHeaderLogoRight ?? true}
      />
    </>
  );
}
