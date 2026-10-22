import React, { useState } from 'react';
import {
  Printer,
  Download,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import type { AcademicStatus, UnifiedBoletimData } from '../../lib/boletim';
import { exportBoletimPdf } from '../../lib/boletim-pdf';
import { formatGrade } from '../../lib/grades';

export function statusBadgeStyle(status: string): string {
  switch (status.toLowerCase()) {
    case 'aprovado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'recuperacao':
    case 'reprovado por frequência':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'reprovado':
    case 'reprovado por nota':
    case 'reprovado por nota e frequência':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'em andamento':
    case 'em_andamento':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'sem notas':
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function AcademicStatusBadge({ status }: { status: AcademicStatus }) {
  const knownStatuses = [
    'Aprovado',
    'Reprovado por Nota',
    'Reprovado por Frequência',
    'Reprovado por Nota e Frequência',
    'Em Andamento',
    'Sem Notas',
  ];
  const isKnown = knownStatuses.includes(status);
  const label = isKnown ? status : 'Sem Notas';
  const badgeClass = statusBadgeStyle(label);
  const isApproved = label === 'Aprovado';

  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}
    >
      {isApproved && <CheckCircle2 className="w-3 h-3" />}
      <span>{label}</span>
    </span>
  );
}

export interface StudentReportCardViewProps {
  data: UnifiedBoletimData;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
}

export function StudentReportCardView({
  data,
  onPrint,
  onDownloadPdf,
}: StudentReportCardViewProps) {
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleDownloadPdf = async () => {
    if (onDownloadPdf) {
      onDownloadPdf();
      return;
    }
    try {
      setDownloading(true);
      await exportBoletimPdf(data);
    } finally {
      setDownloading(false);
    }
  };

  const totalClassesHeld = data.modules.reduce((sum, m) => sum + m.classesHeld, 0);
  const totalPresences = data.modules.reduce((sum, m) => sum + m.presences, 0);
  const totalAbsences = data.modules.reduce((sum, m) => sum + m.absences, 0);
  const totalJustified = data.modules.reduce((sum, m) => sum + m.justified, 0);

  const formattedEmissionDate = (() => {
    try {
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
      return data.issueDate;
    }
  })();

  const classTitle = data.student.classNames.length > 0 ? data.student.classNames.join(', ') : 'Turma';

  return (
    <div className="flex flex-col gap-4 text-left w-full max-w-5xl mx-auto">
      {/* ACTION BAR (Hidden in print) */}
      <div
        data-testid="print-hidden"
        className="print:hidden flex items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-3 px-4 shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs border border-sky-100">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-900 tracking-tight">
              Boletim Escolar Individual
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Documento oficial de frequência e notas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            aria-label="Imprimir Boletim"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimir</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            aria-label="Baixar PDF"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>{downloading ? 'Gerando...' : 'Baixar PDF'}</span>
          </button>
        </div>
      </div>

      {/* PRINTABLE BOLETIM SHEET */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xs print:border-none print:p-0 print:shadow-none flex flex-col gap-6">
        {/* 1. INSTITUTIONAL ITB HEADER */}
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center text-white font-black text-lg tracking-wider shadow-xs shrink-0">
              ITB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Instituto Transforma Brasil
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight leading-snug">
                BOLETIM ESCOLAR INDIVIDUAL
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Sistema de Controle de Frequência e Desempenho Acadêmico
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-[11px] font-semibold text-slate-400 block">
              Data de Emissão
            </span>
            <span className="text-xs font-bold text-slate-800">
              {formattedEmissionDate}
            </span>
          </div>
        </div>

        {/* 2. STUDENT CREDENTIALS CARD */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 print:bg-white print:border-slate-300">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block">
              Nome do Aluno
            </span>
            <span className="text-xs font-bold text-slate-900 block truncate">
              {data.student.name}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block">
              Matrícula
            </span>
            <span className="text-xs font-bold text-slate-900 block font-mono">
              {data.student.registrationNumber || '—'}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block">
              Curso
            </span>
            <span className="text-xs font-bold text-slate-900 block truncate">
              {data.student.courseName || '—'}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block">
              Turma(s)
            </span>
            <span className="text-xs font-bold text-slate-900 block truncate">
              {classTitle}
            </span>
          </div>
        </div>

        {/* 3. CONSOLIDATED CLASS-STYLE TABLE (MATCHING SCREENSHOT) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden print:border print:border-slate-300 print:shadow-none">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Boletim Consolidado — {classTitle}
              </h3>
              <p className="text-xs text-slate-500">
                Visão geral de desempenho com médias calculadas conforme a configuração de cada etapa (Média Aritmética ou Maior Nota).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" aria-label={`Boletim Consolidado — ${classTitle}`}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4 whitespace-nowrap">Aluno</th>
                  {data.modules.map((m) => (
                    <th key={m.moduleId} className="py-3 px-3 text-center border-l border-slate-200/60 whitespace-nowrap">
                      <div>{m.moduleName}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {m.calculationModeLabel || 'Média Simples'}
                      </div>
                    </th>
                  ))}
                  <th className="py-3 px-4 text-center border-l border-slate-200/60 whitespace-nowrap">
                    Média Geral
                  </th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Frequência</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                <tr className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {data.student.name}
                  </td>
                  {data.modules.map((m) => {
                    const evalCount = m.grades.filter((g) => g.score !== null).length;
                    return (
                      <td
                        key={m.moduleId}
                        className="py-2.5 px-3 text-center border-l border-slate-100 font-semibold text-slate-800 whitespace-nowrap"
                      >
                        <div>{formatGrade(m.finalGrade)}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {evalCount}/{m.grades.length} aval.
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-4 text-center border-l border-slate-100 font-black text-slate-950 whitespace-nowrap">
                    {formatGrade(data.overallGpa)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-medium text-slate-700 whitespace-nowrap">
                    {data.overallAttendanceRate.toFixed(1).replace('.', ',')}%
                  </td>
                  <td className="py-2.5 px-4 text-center whitespace-nowrap">
                    <span
                      data-testid="status-badge"
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeStyle(
                        data.overallAcademicStatus,
                      )}`}
                    >
                      {data.overallAcademicStatus === 'Aprovado' && <CheckCircle2 className="w-3 h-3" />}
                      <span>{data.overallAcademicStatus}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. DETAILED EVALUATIONS BREAKDOWN BY TABLE/MODULE */}
        {data.modules.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Detalhamento das Avaliações por Etapa
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.modules.map((m) => (
                <div
                  key={m.moduleId}
                  className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3.5 flex flex-col gap-2.5 print:bg-white print:border-slate-300"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{m.moduleName}</div>
                      <div className="text-[10px] text-slate-500">{m.calculationModeLabel || 'Média Simples'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AcademicStatusBadge status={m.academicStatus} />
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-slate-900">{formatGrade(m.finalGrade)}</div>
                        <div className="text-[10px] text-slate-400">média da etapa</div>
                      </div>
                    </div>
                  </div>

                  {m.grades.length > 0 ? (
                    <div className="space-y-1.5">
                      {m.grades.map((grade, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white border border-slate-200/60"
                        >
                          <span className="font-medium text-slate-700 truncate max-w-[60%]">{grade.name}</span>
                          <span className="font-mono font-bold text-slate-900">
                            {grade.score !== null ? grade.score.toFixed(1).replace('.', ',') : '—'}
                            <span className="text-[10px] font-normal text-slate-400 ml-1">/ {grade.maxScore}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic py-2 text-center">
                      Nenhuma avaliação lançada nesta etapa.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. SUMMARY FOOTER & CRITERIA */}
        <div className="bg-slate-50/60 border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:bg-white print:border-slate-300">
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Critérios de Avaliação e Legenda
            </h4>
            <p className="text-[11px] text-slate-500">
              • <strong>Frequência Mínima:</strong> {data.criteria.minAttendanceRate.toFixed(1)}% das aulas ministradas para aprovação.
            </p>
            <p className="text-[11px] text-slate-500">
              • <strong>Média de Aprovação:</strong> Nota igual ou superior a {data.criteria.minPassingGrade.toFixed(1)} na escala de 0,0 a 10,0.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Aulas</span>
              <span className="text-sm font-black text-slate-900">{totalClassesHeld}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Presenças</span>
              <span className="text-sm font-black text-emerald-700">{totalPresences}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Faltas</span>
              <span className="text-sm font-black text-rose-700">{totalAbsences}</span>
            </div>
            {totalJustified > 0 && (
              <div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block">Justificadas</span>
                <span className="text-sm font-black text-sky-700">{totalJustified}</span>
              </div>
            )}
          </div>
        </div>

        {/* 6. SIGNATURES AREA FOR PRINT */}
        <div className="pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 print:pt-8 print:border-slate-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-48 sm:w-64 border-b border-slate-400 mb-1" />
            <span className="text-xs font-bold text-slate-800">
              Coordenação Pedagógica / Direção
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Instituto Transforma Brasil
            </span>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-48 sm:w-64 border-b border-slate-400 mb-1" />
            <span className="text-xs font-bold text-slate-800">
              Aluno(a) ou Responsável Legal
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Assinatura do Aluno / Responsável
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
