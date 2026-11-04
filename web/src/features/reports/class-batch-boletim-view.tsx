import React, { useState } from 'react';
import { Download, FileText, Printer, Users } from 'lucide-react';
import type { UnifiedBoletimData } from '../../lib/boletim';
import { EmptyState, PrintWatermark } from '../../components';
import { StudentReportCardView } from './student-report-card-view';
import {
  formatPrintDocumentTitle,
  printWithDocumentTitle,
  usePrintDocumentTitle,
} from '../../lib/print-helper';
import { useApp } from '../../app-context';

export interface ClassBatchBoletimPrintViewProps {
  studentsData: UnifiedBoletimData[];
  className?: string;
  courseName?: string;
  institutionName?: string;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkGrayscale?: boolean;
  logoUrl?: string;
}

export function ClassBatchBoletimPrintView({
  studentsData,
  className = 'Turma',
  courseName,
  institutionName,
  onPrint,
  onDownloadPdf,
  watermarkText,
  watermarkLogoUrl,
  watermarkGrayscale,
  logoUrl,
}: ClassBatchBoletimPrintViewProps) {
  const [downloading, setDownloading] = useState(false);
  let app: ReturnType<typeof useApp> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    app = useApp();
  } catch {}

  const resolvedInstitutionName = institutionName ?? app?.branding?.appName ?? 'opschool';
  const resolvedLogoUrl = logoUrl ?? app?.branding?.loginLogoUrl;
  const resolvedWatermarkLogoUrl = watermarkLogoUrl ?? app?.branding?.printWatermarkLogoUrl;
  const resolvedWatermarkText = watermarkText ?? app?.branding?.printWatermarkText ?? `${resolvedInstitutionName} - Documento Oficial`;
  const resolvedWatermarkGrayscale = watermarkGrayscale ?? app?.branding?.printWatermarkGrayscale ?? true;

  const documentTitle = formatPrintDocumentTitle(['Boletins Individuais da Turma', className]);
  usePrintDocumentTitle(documentTitle);

  const handlePrint = async () => {
    if (onPrint) {
      onPrint();
      return;
    }
    const { printClassBatchBoletimPdf } = await import('../../lib/boletim-pdf');
    await printClassBatchBoletimPdf(studentsData, className, {
      institutionName: resolvedInstitutionName,
      watermarkText: resolvedWatermarkText,
      watermarkLogoUrl: resolvedWatermarkLogoUrl,
      watermarkGrayscale: resolvedWatermarkGrayscale,
      logoUrl: resolvedLogoUrl,
    });
  };

  const handleDownloadPdf = async () => {
    if (onDownloadPdf) {
      onDownloadPdf();
      return;
    }
    if (studentsData.length === 0) return;
    try {
      setDownloading(true);
      const { exportClassBatchBoletimPdf } = await import('../../lib/boletim-pdf');
      await exportClassBatchBoletimPdf(studentsData, className, undefined, undefined, {
        institutionName: resolvedInstitutionName,
        watermarkText: resolvedWatermarkText,
        watermarkLogoUrl: resolvedWatermarkLogoUrl,
        watermarkGrayscale: resolvedWatermarkGrayscale,
        logoUrl: resolvedLogoUrl,
      });
    } finally {
      setDownloading(false);
    }
  };

  if (studentsData.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
        <EmptyState
          title="Nenhum aluno matriculado para emissão em lote"
          description="Matricule alunos ativos nesta turma para gerar o compilado de boletins individuais (1 página A4 por aluno)."
          icon={Users}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="class-batch-boletim-document"
      className="class-batch-boletim-document flex flex-col gap-6 print:gap-0 text-left w-full print-landscape relative"
    >
      <PrintWatermark
        text={watermarkText}
        logoUrl={watermarkLogoUrl}
        grayscale={watermarkGrayscale}
      />

      {/* BATCH TOOLBAR (Hidden in print) */}
      <div
        data-testid="batch-toolbar"
        className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold border border-sky-100">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Compilado de Boletins da Turma — {className}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                {studentsData.length} {studentsData.length === 1 ? 'página A4' : 'páginas A4'} (1 por aluno)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {courseName ? `${courseName} · ` : ''}
              Cada aluno ocupa rigorosamente 1 página A4 com quebra automática de página sem folhas em branco intermediárias.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            aria-label="Imprimir Boletins da Turma"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimir Boletins da Turma ({studentsData.length})</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            aria-label="Baixar PDF da Turma (Lote)"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>{downloading ? 'Gerando PDF...' : 'Baixar PDF da Turma (Lote)'}</span>
          </button>
        </div>
      </div>

      {/* CONCATENATED STUDENT PAGES */}
      <div className="flex flex-col gap-6 print:gap-0 print:block w-full">
        {studentsData.map((studentData, idx) => {
          const isLast = idx === studentsData.length - 1;
          const pageClass = isLast
            ? 'class-batch-student-page class-batch-last-page'
            : 'class-batch-student-page class-batch-page-break';

          return (
            <div
              key={studentData.student.id || `student-page-${idx}`}
              data-testid="batch-student-page"
              data-page-index={idx + 1}
              data-is-last-page={isLast ? 'true' : 'false'}
              className={pageClass}
            >
              <StudentReportCardView
                data={studentData}
                institutionName={resolvedInstitutionName}
                logoUrl={resolvedLogoUrl}
                watermarkText={resolvedWatermarkText}
                watermarkLogoUrl={resolvedWatermarkLogoUrl}
                watermarkGrayscale={resolvedWatermarkGrayscale}
                isBatchItem={true}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
