import React, { useMemo, useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileJson, RotateCcw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Section } from '../../components';
import { exportBiJson, exportExcelCsv, exportExcelXlsx, exportSimplePdf, type ExportValue } from '../../lib/exports';
import { formatDate, todayInSaoPaulo } from '../../lib/date';
import type { BiFilters } from './model';
import { useBiData } from './use-bi-data';
import { BiFilterBar } from './bi-filter-bar';
import { buildBiView, type BiChart, type BiViewKey } from './views';

function initialFilters(today: string): BiFilters {
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: today };
}

const safeFilename = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const spreadsheetSafe = (value: ExportValue): ExportValue =>
  typeof value === 'string' && /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;

function ExportActions({
  title,
  context,
  headers,
  rows,
  payload,
  metrics,
}: {
  title: string;
  context: string[];
  headers: string[];
  rows: ExportValue[][];
  payload: unknown;
  metrics: Array<{ label: string; value: string }>;
}) {
  const filename = safeFilename(title);
  return (
    <div className="flex items-center gap-2 flex-wrap" aria-label="Opções de exportação">
      <button
        type="button"
        onClick={() =>
          void exportExcelXlsx(
            filename,
            metrics.map((item) => [item.label, item.value]),
            headers,
            rows,
            context.map((item, index) => [`Contexto ${index + 1}`, item]),
          )
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
        <span>Excel</span>
      </button>
      <button
        type="button"
        onClick={() => exportExcelCsv(filename, headers, rows.map((row) => row.map(spreadsheetSafe)))}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-sky-600" />
        <span>CSV</span>
      </button>
      <button
        type="button"
        onClick={() => void exportSimplePdf(filename, title, context, headers, rows)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
      >
        <FileText className="w-3.5 h-3.5 text-rose-600" />
        <span>PDF</span>
      </button>
      <button
        type="button"
        onClick={() => exportBiJson(filename, payload)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
      >
        <FileJson className="w-3.5 h-3.5 text-purple-600" />
        <span>JSON</span>
      </button>
    </div>
  );
}

function AnalyticsChart({ chart }: { chart: BiChart }) {
  const content =
    chart.type === 'line' ? (
      <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis dataKey={chart.categoryKey} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <YAxis unit={chart.valueSuffix} width={48} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: 'none' }} />
        <Line type="monotone" dataKey={chart.valueKey} stroke="#2563EB" strokeWidth={2.5} dot={chart.data.length < 20} />
      </LineChart>
    ) : (
      <BarChart data={chart.data} layout="vertical" margin={{ top: 8, right: 20, left: 28, bottom: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis type="number" unit={chart.valueSuffix} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <YAxis type="category" dataKey={chart.categoryKey} width={110} tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }} stroke="#E2E8F0" />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: 'none' }} />
        <Bar dataKey={chart.valueKey} fill="#0284C7" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left">
      <h3 className="text-sm font-bold text-slate-900 mb-1">{chart.title}</h3>
      <p className="text-xs text-slate-500 mb-4">{chart.description}</p>
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          {content}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BiPage({ viewKey }: { viewKey: BiViewKey }) {
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<BiFilters>(defaults);
  const { data, directory, options, loading } = useBiData(filters, today);

  const view = useMemo(
    () => buildBiView(viewKey, data),
    [data, viewKey],
  );

  const context = useMemo(
    () => [`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)}`],
    [filters.from, filters.to],
  );

  return (
    <div className="flex flex-col gap-5 text-left">
      <Section
        title={view.title}
        subtitle={view.description}
        action={
          <ExportActions
            title={view.title}
            context={context}
            headers={view.headers}
            rows={view.rows}
            payload={view.payload}
            metrics={view.metrics}
          />
        }
      />

      <BiFilterBar
        filters={filters}
        onChange={setFilters}
        {...options}
        teachers={directory}
        onReset={() => setFilters(defaults)}
      />

      {loading && (
        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden" aria-label="Carregando dados analíticos">
          <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {view.metrics.map((metric) => (
          <div key={metric.label} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 truncate">{metric.label}</p>
            <p className="text-xl font-extrabold text-slate-900 tracking-tight mt-1 leading-none">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Analytics Chart */}
      {view.chart && (
        <div className="w-full">
          <AnalyticsChart chart={view.chart} />
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">{view.tableTitle}</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {view.rows.length.toLocaleString('pt-BR')} linha(s) consolidada(s)
            </p>
          </div>
        </div>

        {!view.rows.length ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            Nenhum dado analítico para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left text-xs border-collapse" aria-label={view.tableTitle}>
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
                        className={`py-2.5 px-4 ${index === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}
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
