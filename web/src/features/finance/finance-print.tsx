import React from 'react';
import { PrintWatermark } from '../../components';
import type { CashTransaction, FinancialFee } from '../../types';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const statusLabels: Record<string, string> = {
  aberto: 'Em Aberto',
  paga: 'Paga',
  parcial: 'Parcial',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
};

const methodLabels: Record<string, string> = {
  PIX: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

interface FeesPrintDocumentProps {
  fees: FinancialFee[];
  summary?: {
    totalExpectedCents?: number;
    totalPaidCents?: number;
    totalPendingCents?: number;
    totalOverdueCents?: number;
    delinquencyRate?: number;
    totalCount?: number;
  };
  filterMonth?: string;
  filterYear?: string;
  className?: string;
  appName?: string;
  watermarkText?: string;
}

export function FeesPrintDocument({
  fees,
  summary,
  filterMonth,
  filterYear,
  className,
  appName = 'ERPITB',
  watermarkText = 'INSTITUTO TRANSFORMA BRASIL',
}: FeesPrintDocumentProps) {
  const emissionDate = new Date().toLocaleString('pt-BR');

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  const compLabel = filterMonth && filterYear
    ? `${monthNames[Number(filterMonth) - 1] || filterMonth}/${filterYear}`
    : filterYear || 'Geral';

  return (
    <div className="hidden print:block print-portrait font-sans text-slate-900 bg-white p-2 relative">
      <PrintWatermark text={watermarkText} />
      <style type="text/css" media="print">
        {`
          @page {
            size: A4 portrait;
            margin: 10mm 8mm;
          }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        `}
      </style>

      {/* Institutional Print Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-sm tracking-widest uppercase bg-slate-950 text-white px-2 py-0.5 rounded">
              ITB
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              Instituto Transforma Brasil — {appName}
            </span>
          </div>
          <h1 className="text-lg font-black tracking-tight mt-1 text-slate-900">
            Relatório de Mensalidades &amp; Receitas
          </h1>
          <p className="text-[11px] text-slate-600">
            Competência: <strong>{compLabel}</strong>
            {className && <span> &bull; Turma: <strong>{className}</strong></span>}
          </p>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          <p className="font-semibold">Emissão: {emissionDate}</p>
          <p>Total de Registros: <strong>{fees.length}</strong></p>
        </div>
      </div>

      {/* Summary KPI Row */}
      {summary && (
        <div className="grid grid-cols-5 gap-2 mb-4 p-2.5 bg-slate-100 rounded-lg border border-slate-400 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-600">Total Previsto</div>
            <div className="font-extrabold text-slate-900">{formatCents(summary.totalExpectedCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-700">Total Recebido</div>
            <div className="font-extrabold text-emerald-900">{formatCents(summary.totalPaidCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-amber-700">Total Pendente</div>
            <div className="font-extrabold text-amber-900">{formatCents(summary.totalPendingCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-rose-700">Total Atrasado</div>
            <div className="font-extrabold text-rose-900">{formatCents(summary.totalOverdueCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-600">Inadimplência</div>
            <div className="font-extrabold text-slate-900">{(summary.delinquencyRate || 0).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Fees Table */}
      <table className="w-full text-[11px] border-collapse border border-slate-300">
        <thead>
          <tr className="bg-slate-200 text-slate-900 font-bold border-b-2 border-slate-400">
            <th className="p-1.5 text-left border border-slate-300">#</th>
            <th className="p-1.5 text-left border border-slate-300">Aluno / Matrícula</th>
            <th className="p-1.5 text-left border border-slate-300">Turma</th>
            <th className="p-1.5 text-center border border-slate-300">Parc.</th>
            <th className="p-1.5 text-center border border-slate-300">Vencimento</th>
            <th className="p-1.5 text-right border border-slate-300">Valor</th>
            <th className="p-1.5 text-right border border-slate-300">Pago</th>
            <th className="p-1.5 text-center border border-slate-300">Status</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((fee, idx) => (
            <tr key={fee.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="p-1.5 border border-slate-300 text-center text-slate-500">{idx + 1}</td>
              <td className="p-1.5 border border-slate-300 font-semibold text-slate-900">
                {fee.studentName || 'Aluno Desconhecido'}
                {fee.registrationNumber && (
                  <span className="block text-[9px] text-slate-500 font-mono">Matr: {fee.registrationNumber}</span>
                )}
              </td>
              <td className="p-1.5 border border-slate-300 text-slate-700">{fee.className || '-'}</td>
              <td className="p-1.5 border border-slate-300 text-center font-mono">{fee.installmentNumber}ª</td>
              <td className="p-1.5 border border-slate-300 text-center font-mono">{formatDate(fee.dueDate)}</td>
              <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">
                {formatCents(fee.amountCents)}
              </td>
              <td className="p-1.5 border border-slate-300 text-right font-mono text-emerald-800">
                {formatCents(fee.paidAmountCents || 0)}
              </td>
              <td className="p-1.5 border border-slate-300 text-center font-bold uppercase text-[10px]">
                {statusLabels[fee.status] || fee.status}
              </td>
            </tr>
          ))}
          {fees.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-center text-slate-500 italic border border-slate-300">
                Nenhuma mensalidade encontrada no filtro selecionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Print Signature Footer */}
      <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
        <div>
          <p>Relatório emitido automaticamente via sistema {appName}.</p>
          <p className="text-[10px] text-slate-500">Documento confidencial para uso administrativo/financeiro interno.</p>
        </div>
        <div className="text-center w-64 border-t border-slate-800 pt-1">
          <p className="font-semibold text-slate-900">Responsável Financeiro</p>
          <p className="text-[10px] text-slate-500">Visto / Assinatura</p>
        </div>
      </div>
    </div>
  );
}

interface CashPrintDocumentProps {
  transactions: CashTransaction[];
  summary?: {
    openingBalanceCents?: number;
    totalInflowCents?: number;
    totalOutflowCents?: number;
    closingBalanceCents?: number;
    byPaymentMethod?: Record<string, number>;
  };
  periodLabel?: string;
  appName?: string;
  watermarkText?: string;
}

export function CashPrintDocument({
  transactions,
  summary,
  periodLabel,
  appName = 'ERPITB',
  watermarkText = 'INSTITUTO TRANSFORMA BRASIL',
}: CashPrintDocumentProps) {
  const emissionDate = new Date().toLocaleString('pt-BR');

  return (
    <div className="hidden print:block print-landscape font-sans text-slate-900 bg-white p-2 relative">
      <PrintWatermark text={watermarkText} />
      <style type="text/css" media="print">
        {`
          @page {
            size: A4 landscape;
            margin: 10mm 8mm;
          }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        `}
      </style>

      {/* Institutional Print Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-sm tracking-widest uppercase bg-slate-950 text-white px-2 py-0.5 rounded">
              ITB
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              Instituto Transforma Brasil — {appName}
            </span>
          </div>
          <h1 className="text-lg font-black tracking-tight mt-1 text-slate-900">
            Livro Caixa &bull; Demonstrativo de Movimentação Financeira
          </h1>
          <p className="text-[11px] text-slate-600">
            Período: <strong>{periodLabel || 'Mês Atual'}</strong>
          </p>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          <p className="font-semibold">Emissão: {emissionDate}</p>
          <p>Total de Lançamentos: <strong>{transactions.length}</strong></p>
        </div>
      </div>

      {/* Summary KPI Row */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 mb-4 p-2.5 bg-slate-100 rounded-lg border border-slate-400 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-600">Saldo Anterior</div>
            <div className="font-extrabold text-slate-900">{formatCents(summary.openingBalanceCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-700">Total de Entradas (+)</div>
            <div className="font-extrabold text-emerald-900">{formatCents(summary.totalInflowCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-rose-700">Total de Saídas (-)</div>
            <div className="font-extrabold text-rose-900">{formatCents(summary.totalOutflowCents || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-sky-800">Saldo de Fechamento (=)</div>
            <div className="font-extrabold text-sky-950">{formatCents(summary.closingBalanceCents || 0)}</div>
          </div>
        </div>
      )}

      {/* Cash Transactions Table */}
      <table className="w-full text-[11px] border-collapse border border-slate-300">
        <thead>
          <tr className="bg-slate-200 text-slate-900 font-bold border-b-2 border-slate-400">
            <th className="p-1.5 text-center border border-slate-300">Data</th>
            <th className="p-1.5 text-center border border-slate-300">Tipo</th>
            <th className="p-1.5 text-left border border-slate-300">Categoria</th>
            <th className="p-1.5 text-left border border-slate-300">Descrição / Justificativa</th>
            <th className="p-1.5 text-center border border-slate-300">Método</th>
            <th className="p-1.5 text-left border border-slate-300">Aluno / Referência</th>
            <th className="p-1.5 text-right border border-slate-300">Valor</th>
            <th className="p-1.5 text-center border border-slate-300">Situação</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, idx) => {
            const isEntry = tx.type === 'entrada';
            return (
              <tr
                key={tx.id}
                className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${
                  tx.isReversal ? 'opacity-75 bg-amber-50/50' : ''
                }`}
              >
                <td className="p-1.5 border border-slate-300 text-center font-mono">{formatDate(tx.date)}</td>
                <td className="p-1.5 border border-slate-300 text-center font-bold">
                  <span
                    className={
                      isEntry
                        ? 'text-emerald-800 uppercase text-[10px]'
                        : 'text-rose-800 uppercase text-[10px]'
                    }
                  >
                    {isEntry ? 'Entrada (+)' : 'Saída (-)'}
                  </span>
                </td>
                <td className="p-1.5 border border-slate-300 font-medium text-slate-800">{tx.category}</td>
                <td className="p-1.5 border border-slate-300 text-slate-900">
                  {tx.description}
                  {tx.reversalReason && (
                    <span className="block text-[9px] text-amber-800 italic">
                      Motivo estorno: {tx.reversalReason}
                    </span>
                  )}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-medium">
                  {methodLabels[tx.paymentMethod] || tx.paymentMethod}
                </td>
                <td className="p-1.5 border border-slate-300 text-slate-700">
                  {tx.studentName || tx.reference || '-'}
                </td>
                <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">
                  <span className={isEntry ? 'text-emerald-900' : 'text-rose-900'}>
                    {isEntry ? '+' : '-'} {formatCents(tx.amountCents)}
                  </span>
                </td>
                <td className="p-1.5 border border-slate-300 text-center text-[10px] font-semibold">
                  {tx.isReversal ? (
                    <span className="text-amber-800 font-bold uppercase">Estorno</span>
                  ) : (
                    <span className="text-slate-600">Efetivado</span>
                  )}
                </td>
              </tr>
            );
          })}
          {transactions.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-center text-slate-500 italic border border-slate-300">
                Nenhuma movimentação registrada para o período selecionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Payment methods summary */}
      {summary?.byPaymentMethod && Object.keys(summary.byPaymentMethod).length > 0 && (
        <div className="mt-4 p-2 border border-slate-300 rounded bg-slate-50 text-[10px]">
          <span className="font-bold text-slate-800 mr-2">Entradas por Método:</span>
          {Object.entries(summary.byPaymentMethod).map(([m, cents]) => (
            <span key={m} className="mr-3 font-mono">
              <strong>{methodLabels[m] || m}:</strong> {formatCents(cents)}
            </span>
          ))}
        </div>
      )}

      {/* Signatures */}
      <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
        <div>
          <p>Demonstrativo gerado pelo sistema {appName}.</p>
          <p className="text-[10px] text-slate-500">Documento comprobatório de escrituração interna de caixa.</p>
        </div>
        <div className="flex gap-12">
          <div className="text-center w-52 border-t border-slate-800 pt-1">
            <p className="font-semibold text-slate-900">Operador do Caixa</p>
            <p className="text-[10px] text-slate-500">Visto</p>
          </div>
          <div className="text-center w-52 border-t border-slate-800 pt-1">
            <p className="font-semibold text-slate-900">Direção / Coordenação</p>
            <p className="text-[10px] text-slate-500">Aprovação</p>
          </div>
        </div>
      </div>
    </div>
  );
}
