import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  Filter,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../../app-context';
import { PageDialog, SelectField } from '../../components';
import { useEntity } from '../../lib/use-entity';
import type { FinancialFee, LocalRecord, PaymentMethod } from '../../types';
import { FeesPrintDocument } from './finance-print';
import { SearchableStudentSelect } from '../student-select';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function FeesView() {
  const { api, session, branding } = useApp();
  const classes = useEntity('classes');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');

  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<FinancialFee[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [filterMonth, setFilterMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState<FinancialFee | null>(null);

  // Form states
  const [studentId, setStudentId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [installmentNumber, setInstallmentNumber] = useState('1');

  // Pay form
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>('PIX');
  const [payReference, setPayReference] = useState('');

  // Contact form
  const [respName, setRespName] = useState('');
  const [respPhone, setRespPhone] = useState('');
  const [respCpf, setRespCpf] = useState('');
  const [respAddress, setRespAddress] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const loadFees = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterMonth) params.month = filterMonth;
      if (filterYear) params.year = filterYear;
      if (filterClassId) params.classId = filterClassId;
      if (filterStatus && filterStatus !== 'all') params.status = filterStatus;

      const res = await api.getFees(params);
      setFees(res.items || []);
      setSummary(res.summary || {});
    } catch {
      // offline or error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFees();
  }, [filterMonth, filterYear, filterClassId, filterStatus]);

  const filteredFees = useMemo(() => {
    if (!search.trim()) return fees;
    const q = search.toLowerCase();
    return fees.filter(
      (f) =>
        f.studentName?.toLowerCase().includes(q) ||
        f.registrationNumber?.toLowerCase().includes(q) ||
        f.className?.toLowerCase().includes(q),
    );
  }, [fees, search]);

  const handleCreateFee = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      const amountCents = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);
      await api.createFee({
        studentId,
        competenceMonth: parseInt(filterMonth, 10),
        competenceYear: parseInt(filterYear, 10),
        dueDate,
        amountCents,
        installmentNumber: parseInt(installmentNumber, 10) || 1,
        notes: notes.trim() || undefined,
      });
      setCreateOpen(false);
      setStudentId('');
      setAmountStr('');
      setDueDate('');
      setNotes('');
      await loadFees();
    } catch (err: any) {
      setMessage(err.message || 'Erro ao cadastrar mensalidade.');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedFee) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const amountCents = Math.round(parseFloat(payAmountStr.replace(',', '.')) * 100);
      const idempotencyKey = `pay_${selectedFee.id}_${Date.now()}`;
      await api.recordPayment(
        selectedFee.id,
        {
          amountCents,
          paymentDate: payDate,
          paymentMethod: payMethod,
          reference: payReference.trim() || undefined,
        },
        idempotencyKey,
      );
      setPayOpen(false);
      setSelectedFee(null);
      setPayAmountStr('');
      setPayReference('');
      await loadFees();
    } catch (err: any) {
      setMessage(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setBusy(false);
    }
  };

  const openContact = async (fee: FinancialFee) => {
    setSelectedFee(fee);
    setRespName('');
    setRespPhone('');
    setRespCpf('');
    setRespAddress('');
    setContactOpen(true);
    try {
      const data = await api.getFinancialContact(fee.studentId);
      if (data) {
        setRespName(data.responsibleName || '');
        setRespPhone(data.responsiblePhone || '');
        setRespCpf(data.responsibleCpf || '');
        setRespAddress(data.responsibleAddress || '');
      }
    } catch {
      // non-fatal
    }
  };

  const handleSaveContact = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedFee) return;
    setBusy(true);
    try {
      await api.saveFinancialContact(selectedFee.studentId, {
        responsibleName: respName.trim(),
        responsiblePhone: respPhone.trim() || undefined,
        responsibleCpf: respCpf.trim() || undefined,
        responsibleAddress: respAddress.trim() || undefined,
      });
      setContactOpen(false);
    } catch (err: any) {
      setMessage(err.message || 'Erro ao salvar contato financeiro.');
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paga':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">Paga</span>;
      case 'parcial':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">Parcial</span>;
      case 'atrasada':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200">Atrasada</span>;
      case 'cancelada':
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-500 border border-slate-200">Cancelada</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-sky-50 text-sky-700 border border-sky-200">Em aberto</span>;
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
                placeholder="Buscar aluno, matrícula ou turma..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
          >
            {[
              'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
              'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
            ].map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
          >
            {['2025', '2026', '2027'].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
          >
            <option value="all">Todas as situações</option>
            <option value="aberto">Em aberto</option>
            <option value="parcial">Parcial</option>
            <option value="paga">Pagas</option>
            <option value="atrasada">Atrasadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Mensalidade</span>
          </button>
        </div>
      </div>

      {/* Fees Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Aluno / Matrícula</th>
                <th className="py-3 px-3">Turma</th>
                <th className="py-3 px-3">Competência</th>
                <th className="py-3 px-3">Vencimento</th>
                <th className="py-3 px-3">Valor Previsto</th>
                <th className="py-3 px-3">Valor Pago</th>
                <th className="py-3 px-3">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Carregando mensalidades...
                  </td>
                </tr>
              ) : filteredFees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Nenhuma mensalidade encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredFees.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{f.studentName || 'Aluno'}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{f.registrationNumber}</p>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{f.className || '-'}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {String(f.competenceMonth).padStart(2, '0')}/{f.competenceYear}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{formatDate(f.dueDate)}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{formatCents(f.amountCents)}</td>
                    <td className="py-3 px-3 text-emerald-700 font-semibold">{formatCents(f.paidAmountCents)}</td>
                    <td className="py-3 px-3">{statusBadge(f.status)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openContact(f)}
                          title="Dados do Responsável Financeiro (Criptografado)"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>

                        {f.status !== 'paga' && f.status !== 'cancelada' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFee(f);
                              const remaining = (f.amountCents - f.paidAmountCents) / 100;
                              setPayAmountStr(remaining.toFixed(2));
                              setPayOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer shadow-2xs"
                          >
                            Pagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nova Mensalidade */}
      {createOpen && (
        <PageDialog
          open={createOpen}
          title="Cadastrar Mensalidade"
          onClose={() => setCreateOpen(false)}
          onSave={handleCreateFee}
          saveText={busy ? 'Salvando...' : 'Cadastrar'}
        >
          <form onSubmit={handleCreateFee} className="flex flex-col gap-4 text-xs">
            {message && <p className="text-rose-600 font-semibold">{message}</p>}
            <SearchableStudentSelect
              label="Aluno"
              required
              value={studentId}
              onChange={(selectedId) => setStudentId(selectedId)}
              students={students.items}
              enrollments={enrollments.items}
              classes={classes.items}
              placeholder="Digite o nome ou matrícula do aluno..."
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Valor Previsto (R$)</label>
                <input
                  required
                  type="text"
                  placeholder="150,00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Data de Vencimento</label>
                <input
                  required
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Nº da Parcela</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={installmentNumber}
                  onChange={(e) => setInstallmentNumber(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Competência</label>
                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 font-bold">
                  {filterMonth}/{filterYear}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Observações (opcional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: desconto pontualidade ou detalhes da bolsa"
                className="px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </form>
        </PageDialog>
      )}

      {/* Modal: Registrar Pagamento */}
      {payOpen && selectedFee && (
        <PageDialog
          open={payOpen}
          title="Registrar Pagamento"
          onClose={() => setPayOpen(false)}
          onSave={handleRecordPayment}
          saveText={busy ? 'Processando...' : 'Confirmar Pagamento'}
        >
          <form onSubmit={handleRecordPayment} className="flex flex-col gap-4 text-xs">
            {message && <p className="text-rose-600 font-semibold">{message}</p>}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="font-bold text-slate-900">{selectedFee.studentName}</p>
              <p className="text-slate-500 mt-0.5">
                Competência: {String(selectedFee.competenceMonth).padStart(2, '0')}/{selectedFee.competenceYear} | Vencimento: {formatDate(selectedFee.dueDate)}
              </p>
              <p className="text-slate-700 font-semibold mt-1">
                Saldo Restante: {formatCents(selectedFee.amountCents - selectedFee.paidAmountCents)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Valor Pago (R$)</label>
                <input
                  required
                  type="text"
                  value={payAmountStr}
                  onChange={(e) => setPayAmountStr(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Data do Pagamento</label>
                <input
                  required
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Forma de Pagamento</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
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

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Identificador / Comprovante</label>
                <input
                  type="text"
                  placeholder="ID da transação ou recibo"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-200">
              Este pagamento será lançado de forma atômica no Livro Caixa como entrada confirmada.
            </p>
          </form>
        </PageDialog>
      )}

      {/* Modal: Responsável Financeiro */}
      {contactOpen && selectedFee && (
        <PageDialog
          open={contactOpen}
          title="Responsável Financeiro (LGPD)"
          onClose={() => setContactOpen(false)}
          onSave={handleSaveContact}
          saveText={busy ? 'Salvando...' : 'Salvar Responsável'}
        >
          <form onSubmit={handleSaveContact} className="flex flex-col gap-4 text-xs">
            <p className="text-slate-500 text-[11px]">
              Os dados de contato do responsável financeiro são criptografados com AES-256-GCM no servidor e acessíveis somente a perfis autorizados.
            </p>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Nome do Responsável Financeiro</label>
              <input
                required
                type="text"
                value={respName}
                onChange={(e) => setRespName(e.target.value)}
                placeholder="Nome completo do responsável"
                className="px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={respPhone}
                  onChange={(e) => setRespPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">CPF do Responsável</label>
                <input
                  type="text"
                  value={respCpf}
                  onChange={(e) => setRespCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Endereço Residencial</label>
              <input
                type="text"
                value={respAddress}
                onChange={(e) => setRespAddress(e.target.value)}
                placeholder="Rua, número, complemento, bairro, cidade - UF"
                className="px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </form>
        </PageDialog>
      )}
      </div>
      <FeesPrintDocument
        fees={filteredFees}
        summary={summary}
        filterMonth={filterMonth}
        filterYear={filterYear}
        className={classes.items.find((c: LocalRecord) => c.id === filterClassId)?.name as string | undefined}
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

export const FinanceFeesPage = FeesView;

