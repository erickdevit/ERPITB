import React from 'react';
import type { ExportValue } from '../../lib/exports';
import type { ReportMetric, ReportView } from './model';

function MetricGrid({ metrics }: { metrics: ReportMetric[] }) {
  return (
    <div
      aria-label="Indicadores do relatório"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-left"
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500 truncate">{metric.label}</p>
          <p className="text-xl font-extrabold text-slate-900 tracking-tight mt-1 leading-none">
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReportResult({ view }: { view: ReportView }) {
  const displayTitle = view.tableTitle || view.title;
  return (
    <div className="flex flex-col gap-4 text-left">
      <MetricGrid metrics={view.metrics} />

      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 id="report-table-title" className="text-sm font-bold text-slate-900 tracking-tight">
              {displayTitle}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {view.rows.length.toLocaleString('pt-BR')} linha(s) encontrada(s)
            </p>
          </div>
        </div>

        {!view.rows.length ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Nenhum dado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left text-xs border-collapse" aria-label={displayTitle}>
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-1 border-b border-slate-200">
                <tr className="text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                  {view.headers.map((header, index) => (
                    <th key={`${header}-${index}`} className="py-3 px-4 whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {view.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50/75 transition-colors">
                    {row.map((value, index) => (
                      <td
                        key={`${rowIndex}-${index}`}
                        className={`py-2.5 px-4 ${
                          index === 0 ? 'font-bold text-slate-900' : 'text-slate-600'
                        } ${view.matrix && index >= 2 ? 'whitespace-nowrap' : ''}`}
                      >
                        {String(value ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
