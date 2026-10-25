import React, { useMemo, useState } from 'react';
import { Download, FileText, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { useApp } from '../../app-context';
import { Section } from '../../components';
import { exportExcelCsv, exportExcelXlsx, exportSimplePdf } from '../../lib/exports';
import { exportBoletimPdf, exportClassBoletimPdf } from '../../lib/boletim-pdf';
import { todayInSaoPaulo } from '../../lib/date';
import type { ReportFilters } from './model';
import { ReportFiltersBar } from './report-filters';
import { ReportResult } from './report-result';
import { useReportData } from './use-report-data';

const safeFilename = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function initialFilters(today: string): ReportFilters {
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 89);
  return { type: 'institutional', from: from.toISOString().slice(0, 10), to: today };
}

export function ReportsCenterPage() {
  const { session, branding } = useApp();
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<ReportFilters>(defaults);
  const { view, loading, directory, directoryError, options } = useReportData(filters);
  const filename = `${safeFilename(view.title)}-${filters.to.replaceAll('-', '')}`;
  const exportMetadata = view.context.map((item, index) => [`Contexto ${index + 1}`, item] as [string, string]);

  const metrics = view.metrics ?? [];

  return (
    <div className="flex flex-col gap-3 text-left">
      {/* Line 1: Sanitized Filter Toolbar */}
      <ReportFiltersBar
        filters={filters}
        onChange={setFilters}
        {...options}
        teachers={directory}
        role={session.role}
        onReset={() => setFilters(defaults)}
      />

      {/* Line 2: Quantities Ribbon + Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-2xl p-2 sm:p-2.5 px-3 sm:px-3.5 shadow-2xs print:hidden">
        {/* Metric Badges */}
        <div className="flex items-center gap-2 flex-wrap min-h-[32px]">
          {metrics.length > 0 ? (
            metrics.map((metric) => (
              <div
                key={metric.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <span className="text-slate-500 font-medium text-[11px]">{metric.label}:</span>
                <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight">{metric.value}</span>
              </div>
            ))
          ) : (
            <span className="text-xs text-slate-400 font-medium py-1 px-1">
              {view.title || 'Central de Relatórios'}
            </span>
          )}
        </div>

        {/* Export Actions */}
        <div className="shrink-0 flex items-center justify-end gap-1.5" aria-label="Opções de exportação do relatório">
          <button
            type="button"
            disabled={!view.ready}
            onClick={() => {
              if (view.type === 'studentBoletim' && view.boletimData) {
                void exportBoletimPdf(view.boletimData, undefined, undefined, {
                  watermarkText: branding?.printWatermarkText,
                  watermarkLogoUrl: branding?.printWatermarkLogoUrl,
                  watermarkGrayscale: branding?.printWatermarkGrayscale ?? true,
                });
              } else if (view.type === 'classGrades' && view.classBoletimData) {
                void exportClassBoletimPdf(view.classBoletimData, undefined, undefined, {
                  watermarkText: branding?.printWatermarkText,
                  watermarkLogoUrl: branding?.printWatermarkLogoUrl,
                  watermarkGrayscale: branding?.printWatermarkGrayscale ?? true,
                });
              } else {
                void exportSimplePdf(filename, view.title, view.context, view.headers, view.rows);
              }
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            disabled={!view.ready}
            onClick={() =>
              void exportExcelXlsx(
                filename,
                metrics.map((item) => [item.label, item.value]),
                view.headers,
                view.rows,
                exportMetadata,
              )
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            disabled={!view.ready}
            onClick={() => exportExcelCsv(filename, view.headers, view.rows)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-600" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden" aria-label="Carregando relatórios">
          <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
        </div>
      )}

      {directoryError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          A lista de professores não pôde ser atualizada. {directoryError}
        </div>
      )}

      {!view.ready ? (
        <div className="p-8 text-center bg-white border border-slate-200/90 rounded-2xl text-slate-400 text-xs font-medium">
          {view.notices.length ? view.notices.join(' ') : 'Selecione os parâmetros acima para visualizar o relatório.'}
        </div>
      ) : (
        <ReportResult view={view} />
      )}
    </div>
  );
}
