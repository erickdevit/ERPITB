import React from 'react';
import type { ReportView } from './model';
import { StudentReportCardView } from './student-report-card-view';
import { ClassBoletimView } from './class-boletim-view';
import { PrintWatermark } from '../../components';
import { useApp } from '../../app-context';

export function ReportResult({ view }: { view: ReportView }) {
  let branding: ReturnType<typeof useApp>['branding'];
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const app = useApp();
    branding = app?.branding;
  } catch {
    // gracefully handles render outside provider or minimal test mocks
  }

  if (view.type === 'studentBoletim' && view.boletimData) {
    return (
      <StudentReportCardView
        data={view.boletimData}
        institutionName={branding?.appName}
        logoUrl={branding?.loginLogoUrl}
        watermarkText={branding?.printWatermarkText}
        watermarkLogoUrl={branding?.printWatermarkLogoUrl}
        watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
      />
    );
  }

  if (view.type === 'classGrades' && view.classBoletimData) {
    return (
      <ClassBoletimView
        data={view.classBoletimData}
        institutionName={branding?.appName}
        logoUrl={branding?.loginLogoUrl}
        watermarkText={branding?.printWatermarkText}
        watermarkLogoUrl={branding?.printWatermarkLogoUrl}
        watermarkGrayscale={branding?.printWatermarkGrayscale ?? true}
      />
    );
  }

  const displayTitle = view.tableTitle || view.title;
  return (
    <div className="flex flex-col gap-3 text-left print-landscape relative">
      <PrintWatermark
        text={branding?.printWatermarkText || `${branding?.appName || 'opschool'} - Documento Oficial`}
        logoUrl={branding?.printWatermarkLogoUrl}
        grayscale={branding?.printWatermarkGrayscale ?? true}
      />
      {/* PRINT-ONLY INSTITUTIONAL HEADER */}
      <div className="hidden print:flex items-center gap-3 mb-2 border-b border-slate-300 pb-2">
        {branding?.loginLogoUrl && (
          <img
            src={branding.loginLogoUrl}
            alt={branding.appName || 'Logo Institucional'}
            className="w-8 h-8 object-contain rounded-lg"
          />
        )}
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-slate-900 block">
            {branding?.appName || 'opschool'}
          </span>
          <span className="text-sm font-extrabold text-slate-900 block">
            {displayTitle}
          </span>
        </div>
      </div>
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden print:border-none print:shadow-none">
        <div className="py-3 px-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 id="report-table-title" className="text-sm font-bold text-slate-900 tracking-tight">
              {displayTitle}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
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
