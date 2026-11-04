import React, { useState, type ReactNode } from 'react';
import { Table, RefreshCw, AlertCircle, BarChart3, HelpCircle } from 'lucide-react';
import { CHART_TOKENS } from './tokens';

export interface ChartTableColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: any, row: any) => ReactNode;
}

export interface ChartContainerProps {
  title?: string;
  subtitle?: string;
  summary?: string; // Accessible insight / key takeaway
  ariaLabel: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: string;
  height?: number | string;
  tableData?: Array<Record<string, any>>;
  tableColumns?: ChartTableColumn[];
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartSkeleton({ height = 260 }: { height?: number | string }) {
  return (
    <div
      data-testid="chart-skeleton"
      aria-busy="true"
      aria-label="Carregando visualização de dados"
      className="w-full flex flex-col justify-end gap-2 p-4 animate-pulse bg-slate-50/60 rounded-xl border border-dashed border-slate-200"
      style={{ height }}
    >
      <div className="flex items-end justify-between gap-3 h-36 w-full px-4 pb-2">
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-16" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-28" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-20" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-32" />
        <div className="w-1/6 bg-slate-200/70 rounded-t-md h-14" />
      </div>
      <div className="h-2.5 w-1/4 bg-slate-200/60 rounded-sm mx-auto" />
    </div>
  );
}

export function ChartContainer({
  title,
  subtitle,
  summary,
  ariaLabel,
  loading = false,
  error = null,
  onRetry,
  empty = false,
  emptyMessage = 'Nenhum dado disponível no período selecionado.',
  height = 280,
  tableData,
  tableColumns,
  actions,
  children,
  className = '',
}: ChartContainerProps) {
  const [showTable, setShowTable] = useState(false);

  const canShowTable = Boolean(tableData && tableColumns && tableData.length > 0);

  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left flex flex-col ${className}`}
      role="region"
      aria-label={ariaLabel}
    >
      {/* Header */}
      {(title || subtitle || actions || canShowTable) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div>
            {title && (
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {actions}

            {canShowTable && (
              <button
                type="button"
                onClick={() => setShowTable((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  showTable
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title={showTable ? 'Exibir visualização gráfica' : 'Exibir modo tabela acessível'}
                aria-pressed={showTable}
              >
                {showTable ? (
                  <>
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Ver Gráfico</span>
                  </>
                ) : (
                  <>
                    <Table className="w-3.5 h-3.5" />
                    <span>Ver Tabela</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Accessible Text Summary (Screen readers + sighted visual insight) */}
      {summary && !loading && !error && !empty && (
        <div className="sr-only" aria-live="polite">
          {summary}
        </div>
      )}

      {/* Content Body */}
      <div className="relative w-full flex-1 min-h-0" style={{ minHeight: height }}>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : error ? (
          <div
            className="w-full flex flex-col items-center justify-center p-6 text-center rounded-xl bg-rose-50/50 border border-rose-100"
            style={{ height }}
          >
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-xs font-bold text-rose-900 mb-1">Falha ao carregar visualização</p>
            <p className="text-xs text-rose-600 max-w-sm mb-3">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar novamente</span>
              </button>
            )}
          </div>
        ) : empty ? (
          <div
            data-testid="empty-chart"
            className="w-full flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/40 rounded-xl border border-slate-100"
            style={{ height }}
          >
            <HelpCircle className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-500 max-w-sm">{emptyMessage}</p>
          </div>
        ) : showTable && canShowTable ? (
          <div className="overflow-x-auto max-h-[360px] rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {tableColumns!.map((col, idx) => (
                    <th
                      key={col.key || idx}
                      className={`py-2 px-3 whitespace-nowrap ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {tableData!.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/75 transition-colors">
                    {tableColumns!.map((col, cIdx) => (
                      <td
                        key={col.key || cIdx}
                        className={`py-2 px-3 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="w-full h-full" role="img" aria-label={ariaLabel}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
