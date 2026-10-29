import React, { useState } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import type { UnifiedBoletimData, AcademicStatus } from '../../lib/boletim';
import { PrintWatermark } from '../../components';
import { formatGrade } from '../../lib/grades';
import { AcademicStatusBadge } from './student-report-card-view';
import {
  formatPrintDocumentTitle,
  printWithDocumentTitle,
  usePrintDocumentTitle,
} from '../../lib/print-helper';

export interface StudentBoletimSpreadsheetViewProps {
  data: UnifiedBoletimData;
  portalUrl?: string;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  onSwitchFormat?: (format: 'standard' | 'spreadsheet') => void;
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkGrayscale?: boolean;
  logoUrl?: string;
  showHeaderLogoLeft?: boolean;
  showHeaderLogoRight?: boolean;
}

interface SpreadsheetRow {
  moduleName: string;
  className: string;
  assessmentName: string;
  category: string;
  weight: number | string;
  maxScore: number;
  score: number | null;
  moduleFinalGrade?: number | null;
  moduleStatus?: AcademicStatus;
  remarks?: string;
}

export function StudentBoletimSpreadsheetView({
  data,
  portalUrl,
  onPrint,
  onDownloadPdf,
  onSwitchFormat,
  watermarkText = 'INSTITUTO TRANSFORMA BRASIL',
  watermarkLogoUrl,
  watermarkGrayscale = true,
  logoUrl,
  showHeaderLogoLeft = true,
  showHeaderLogoRight = false,
}: StudentBoletimSpreadsheetViewProps) {
  const [downloading, setDownloading] = useState(false);

  const student = data?.student ?? { name: 'Aluno', id: '', classNames: [] };
  const classNames = student.classNames ?? [];
  const classTitle = classNames.length > 0 ? classNames.join(', ') : 'Turma';
  const portalCode = student.registrationNumber || student.id || '';
  const publicPortalUrl =
    portalUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/aluno/${encodeURIComponent(portalCode)}`
      : `https://erp.itbcursos.com/aluno/${encodeURIComponent(portalCode)}`);

  const documentTitle = formatPrintDocumentTitle([
    'Boletim Escolar Planilha',
    student.name,
    student.registrationNumber,
  ]);
  usePrintDocumentTitle(documentTitle);

  const handlePrint = () => {
    if (onPrint) onPrint();
    else printWithDocumentTitle(documentTitle);
  };

  const handleDownloadPdf = async () => {
    if (onDownloadPdf) {
      onDownloadPdf();
      return;
    }
    try {
      setDownloading(true);
      const { exportBoletimPdf } = await import('../../lib/boletim-pdf');
      await exportBoletimPdf(data, undefined, undefined, {
        portalUrl: publicPortalUrl,
        watermarkText,
        watermarkLogoUrl,
        watermarkGrayscale,
      });
    } finally {
      setDownloading(false);
    }
  };

  const modules = data?.modules ?? [];
  const totalClassesHeld = modules.reduce((sum, m) => sum + (Number(m.classesHeld) || 0), 0);
  const totalPresences = modules.reduce((sum, m) => sum + (Number(m.presences) || 0), 0);
  const totalAbsences = modules.reduce((sum, m) => sum + (Number(m.absences) || 0), 0);

  const formattedEmissionDate = (() => {
    try {
      if (!data?.issueDate) return '';
      const d = new Date(data.issueDate);
      if (Number.isNaN(d.getTime())) return data.issueDate;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return data?.issueDate || '';
    }
  })();

  // Flatten assessments across all modules into spreadsheet rows
  const spreadsheetRows: SpreadsheetRow[] = modules.flatMap((mod): SpreadsheetRow[] => {
    if (!mod.grades || mod.grades.length === 0) {
      return [
        {
          moduleName: mod.moduleName,
          className: mod.className,
          assessmentName: 'Sem avaliações lançadas',
          category: '—',
          weight: '—',
          maxScore: 10,
          score: null,
          moduleFinalGrade: mod.finalGrade,
          moduleStatus: mod.academicStatus,
          remarks: '—',
        },
      ];
    }
    return mod.grades.map((grade, idx) => ({
      moduleName: mod.moduleName,
      className: mod.className,
      assessmentName: grade.name,
      category: grade.category || 'Avaliação',
      weight: grade.weight != null ? grade.weight : 1,
      maxScore: grade.maxScore != null ? grade.maxScore : 10,
      score: grade.score,
      moduleFinalGrade: idx === 0 ? mod.finalGrade : undefined,
      moduleStatus: idx === 0 ? mod.academicStatus : undefined,
      remarks: '',
    }));
  });

  return (
    <div className="flex flex-col gap-4 text-left w-full max-w-5xl mx-auto print-landscape print:max-w-none print:w-full print:mx-0 relative">
      {/* ACTION BAR (Hidden in print) */}
      <div
        data-testid="print-hidden"
        className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-3 px-4 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-100">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-tight">
              Boletim Individual — Formato Planilha (Grade Tabular)
            </h3>
            <p className="text-[11px] text-slate-500">
              Visualização consolidada em linhas de módulo e avaliações
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchFormat && (
            <button
              type="button"
              onClick={() => onSwitchFormat('standard')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
              title="Alternar para o formato oficial com QR Code"
            >
              <FileText className="w-3.5 h-3.5 text-sky-500" />
              <span>Ver Formato Padrão</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimir</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>{downloading ? 'Gerando PDF...' : 'Baixar PDF'}</span>
          </button>
        </div>
      </div>

      {/* DOCUMENT WRAPPER (Printable) */}
      <div
        className="relative bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5 print:border-none print:shadow-none print:p-0 print:rounded-none"
      >
        <PrintWatermark
          text={watermarkText}
          logoUrl={watermarkLogoUrl}
          grayscale={watermarkGrayscale}
        />

        {/* 1. INSTITUTIONAL HEADER */}
        <div className="border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {showHeaderLogoLeft && (
                logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo da Instituição"
                    className="h-10 w-auto object-contain shrink-0"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shrink-0">
                    ITB
                  </div>
                )
              )}
              <div>
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight uppercase">
                  Instituto Transforma Brasil
                </h1>
                <p className="text-xs font-medium text-slate-500">
                  Boletim de Rendimento Escolar — Grade Tabular
                </p>
                {formattedEmissionDate && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Emitido em: {formattedEmissionDate}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200/80">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                Versão Planilha
              </span>
            </div>
          </div>
        </div>

        {/* 2. STUDENT & SUMMARY INFO BAR */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs print:bg-white">
          <div className="sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Aluno(a)
            </span>
            <div className="text-sm font-extrabold text-slate-900 leading-tight">
              {student.name}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
              Matrícula: <span className="font-mono font-bold text-slate-700">{student.registrationNumber || 'N/A'}</span> · Turma: <span className="font-semibold text-slate-800">{classTitle}</span>
            </div>
          </div>

          <div className="sm:col-span-1 border-t sm:border-t-0 sm:border-l border-slate-200/80 sm:pl-3 pt-2 sm:pt-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Frequência Geral
            </span>
            <div className="text-sm font-black text-slate-900 leading-tight">
              {totalClassesHeld > 0 ? `${data.overallAttendanceRate.toFixed(1).replace('.', ',')}%` : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {totalPresences}P / {totalAbsences}F ({totalClassesHeld} aulas)
            </div>
          </div>

          <div className="sm:col-span-1 border-t sm:border-t-0 sm:border-l border-slate-200/80 sm:pl-3 pt-2 sm:pt-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Média Geral & Status
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">
                {data.overallGpa !== null && data.overallGpa !== undefined ? formatGrade(data.overallGpa) : '—'}
              </span>
              <AcademicStatusBadge status={data.overallAcademicStatus} />
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Mínimo aprovação: 6,0 / 75%
            </div>
          </div>
        </div>

        {/* 3. SPREADSHEET TABLE OF EVALUATIONS */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 print:overflow-visible">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-bold text-[10px]">
                <th className="py-2.5 px-3">Etapa / Módulo</th>
                <th className="py-2.5 px-3">Avaliação</th>
                <th className="py-2.5 px-2.5">Tipo</th>
                <th className="py-2.5 px-2 text-center">Peso</th>
                <th className="py-2.5 px-2.5 text-center">Nota Máx.</th>
                <th className="py-2.5 px-3 text-center bg-slate-200/50">Nota Obtida</th>
                <th className="py-2.5 px-3 text-center bg-sky-50/50">Média Etapa</th>
                <th className="py-2.5 px-3 text-center">Situação</th>
                <th className="py-2.5 px-3">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {spreadsheetRows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50/75 print:hover:bg-white">
                  <td className="py-2 px-3 font-bold text-slate-900">{row.moduleName}</td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{row.assessmentName}</td>
                  <td className="py-2 px-2.5 text-slate-500">{row.category}</td>
                  <td className="py-2 px-2 text-center text-slate-600 font-mono">{row.weight}</td>
                  <td className="py-2 px-2.5 text-center text-slate-600 font-mono">
                    {typeof row.maxScore === 'number' ? formatGrade(row.maxScore) : row.maxScore}
                  </td>
                  <td className="py-2 px-3 text-center font-extrabold text-slate-900 bg-slate-50/60">
                    {row.score !== null && row.score !== undefined ? (
                      formatGrade(row.score)
                    ) : (
                      <span className="text-slate-400 font-normal">Pendente</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-black text-slate-950 bg-sky-50/30">
                    {row.moduleFinalGrade !== undefined ? (
                      row.moduleFinalGrade !== null ? formatGrade(row.moduleFinalGrade) : '—'
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {row.moduleStatus ? <AcademicStatusBadge status={row.moduleStatus} /> : null}
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-[11px]">
                    {row.remarks || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 4. SIGNATURES AREA FOR PRINT (no horizontal divider above signatures) */}
        <div className="mt-auto pt-6 grid grid-cols-2 gap-8 print:pt-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-48 sm:w-60 border-b border-slate-400 mb-1" />
            <span className="text-xs font-bold text-slate-800">
              Coordenação Pedagógica / Direção
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Instituto Transforma Brasil
            </span>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-48 sm:w-60 border-b border-slate-400 mb-1" />
            <span className="text-xs font-bold text-slate-800">
              Aluno(a) ou Responsável Legal
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Assinatura de Ciência
            </span>
          </div>
        </div>

        {/* 6. INSTITUTIONAL FOOTER */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-4 text-xs print:pt-4">
          <div className="text-[10px] text-slate-500">
            ERPITB — Documento oficial emitido em formato grade tabular / planilha.
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            Código: {data.student.registrationNumber || data.student.id}
          </div>
        </div>
      </div>
    </div>
  );
}
