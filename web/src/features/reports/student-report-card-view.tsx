import React, { useState } from 'react';
import {
  Printer,
  Download,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  GraduationCap,
  Layers,
} from 'lucide-react';
import type { AcademicStatus, UnifiedBoletimData } from '../../lib/boletim';
import { exportBoletimPdf } from '../../lib/boletim-pdf';

export interface StudentReportCardViewProps {
  data: UnifiedBoletimData;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
}

export function AcademicStatusBadge({ status }: { status: AcademicStatus }) {
  switch (status) {
    case 'Aprovado':
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Aprovado
        </span>
      );
    case 'Reprovado por Nota':
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Reprovado por Nota
        </span>
      );
    case 'Reprovado por Frequência':
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Reprovado por Frequência
        </span>
      );
    case 'Reprovado por Nota e Frequência':
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          Reprovado por Nota e Frequência
        </span>
      );
    case 'Em Andamento':
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          Em Andamento
        </span>
      );
    case 'Sem Notas':
    default:
      return (
        <span
          data-testid="status-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Sem Notas
        </span>
      );
  }
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

  const isOverallFreqGood = data.overallAttendanceRate >= data.criteria.minAttendanceRate;
  const isOverallGradeGood =
    data.overallGpa !== null && data.overallGpa >= data.criteria.minPassingGrade;

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
              {data.student.classNames.length ? data.student.classNames.join(', ') : '—'}
            </span>
          </div>
        </div>

        {/* 3. CONSOLIDATED SINGLE MATRIX TABLE */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs print:border-slate-300 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5 whitespace-nowrap">Módulo / Turma</th>
                  <th className="py-3 px-2.5 text-center whitespace-nowrap">Aulas</th>
                  <th className="py-3 px-2.5 text-center whitespace-nowrap">Pres.</th>
                  <th className="py-3 px-2.5 text-center whitespace-nowrap">Faltas</th>
                  <th className="py-3 px-2.5 text-center whitespace-nowrap">Just.</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Freq. (%)</th>
                  <th className="py-3 px-3 whitespace-nowrap">Avaliações Parciais</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Média Final</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.modules.map((mod, index) => {
                  const isFreqPass = mod.attendanceRate >= data.criteria.minAttendanceRate;
                  const isGradePass =
                    mod.finalGrade !== null && mod.finalGrade >= data.criteria.minPassingGrade;

                  return (
                    <tr
                      key={mod.moduleId || index}
                      className="print-avoid-break break-inside-avoid hover:bg-slate-50/75 transition-colors"
                    >
                      {/* Module / Class */}
                      <td className="py-3 px-3.5 font-bold text-slate-900">
                        <div>{mod.moduleName}</div>
                        {mod.className && mod.className !== mod.moduleName && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            {mod.className}
                          </div>
                        )}
                      </td>

                      {/* Total Classes */}
                      <td className="py-3 px-2.5 text-center text-slate-700 font-medium">
                        {mod.classesHeld}
                      </td>

                      {/* Presences */}
                      <td className="py-3 px-2.5 text-center font-bold text-emerald-600">
                        {mod.presences}
                      </td>

                      {/* Absences */}
                      <td className="py-3 px-2.5 text-center font-bold text-rose-600">
                        {mod.absences}
                      </td>

                      {/* Justified */}
                      <td className="py-3 px-2.5 text-center text-slate-500 font-medium">
                        {mod.justified}
                      </td>

                      {/* Attendance % */}
                      <td className="py-3 px-3 text-center font-bold">
                        <span
                          className={
                            isFreqPass ? 'text-emerald-700' : 'text-rose-600 font-extrabold'
                          }
                        >
                          {mod.attendanceRate.toFixed(1)}%
                        </span>
                      </td>

                      {/* Evaluations */}
                      <td className="py-3 px-3 text-slate-700">
                        {mod.grades.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {mod.grades.map((grade, gIdx) => (
                              <span
                                key={gIdx}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700 font-medium border border-slate-200/80"
                              >
                                <span>{grade.name}:</span>
                                <span className="font-bold text-slate-900">
                                  {grade.score !== null ? grade.score.toFixed(1) : '—'}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Nenhuma avaliação</span>
                        )}
                      </td>

                      {/* Final Grade */}
                      <td className="py-3 px-3 text-center font-extrabold text-sm">
                        {mod.finalGrade !== null ? (
                          <span
                            className={isGradePass ? 'text-slate-900' : 'text-rose-600'}
                          >
                            {mod.finalGrade.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Academic Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <AcademicStatusBadge status={mod.academicStatus} />
                      </td>
                    </tr>
                  );
                })}

                {!data.modules.length && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                      Nenhum módulo ou turma encontrado para este aluno.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* SUMMARY ROW */}
              {data.modules.length > 0 && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 print-avoid-break break-inside-avoid">
                  <tr>
                    <td className="py-3 px-3.5 tracking-tight font-extrabold">
                      TOTAIS / MÉDIA GERAL
                    </td>
                    <td className="py-3 px-2.5 text-center font-bold text-slate-800">
                      {totalClassesHeld}
                    </td>
                    <td className="py-3 px-2.5 text-center font-bold text-emerald-700">
                      {totalPresences}
                    </td>
                    <td className="py-3 px-2.5 text-center font-bold text-rose-700">
                      {totalAbsences}
                    </td>
                    <td className="py-3 px-2.5 text-center font-bold text-slate-700">
                      {totalJustified}
                    </td>
                    <td className="py-3 px-3 text-center font-black">
                      <span
                        className={
                          isOverallFreqGood ? 'text-emerald-700' : 'text-rose-600'
                        }
                      >
                        {data.overallAttendanceRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-400">—</td>
                    <td className="py-3 px-3 text-center font-black text-sm">
                      {data.overallGpa !== null ? (
                        <span
                          className={
                            isOverallGradeGood ? 'text-slate-900' : 'text-rose-600'
                          }
                        >
                          {data.overallGpa.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <AcademicStatusBadge status={data.overallAcademicStatus} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* 4. CRITERIA LEGEND & ACADEMIC STANDING */}
        <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 text-xs text-slate-600 flex flex-col gap-1.5 print:bg-white print:border-slate-300 print-avoid-break break-inside-avoid">
          <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-0.5">
            Critérios de Avaliação e Legenda
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div>
              <span className="font-semibold text-slate-700">Frequência Mínima Exigida:</span>{' '}
              {data.criteria.minAttendanceRate.toFixed(1)}% das aulas ministradas.
            </div>
            <div>
              <span className="font-semibold text-slate-700">Média para Aprovação:</span>{' '}
              {data.criteria.minPassingGrade.toFixed(1)} (escala de 0,0 a 10,0).
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            <span className="font-semibold text-slate-700">Situações:</span> Aprovado | Reprovado por
            Nota | Reprovado por Frequência | Reprovado por Nota e Frequência | Em Andamento | Sem
            Notas.
          </div>
        </div>

        {/* 5. SIGNATURES AREA */}
        <div className="pt-10 sm:pt-14 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-16 print:pt-12 print-avoid-break break-inside-avoid">
          <div className="text-center flex flex-col items-center">
            <div className="w-full max-w-xs border-t border-slate-400/90 pt-2 flex flex-col items-center">
              <span className="font-bold text-xs text-slate-900">
                Coordenação Pedagógica / Direção
              </span>
              <span className="text-[11px] text-slate-400">
                Instituto Transforma Brasil
              </span>
            </div>
          </div>

          <div className="text-center flex flex-col items-center">
            <div className="w-full max-w-xs border-t border-slate-400/90 pt-2 flex flex-col items-center">
              <span className="font-bold text-xs text-slate-900">
                Aluno(a) ou Responsável Legal
              </span>
              <span className="text-[11px] text-slate-400">
                Assinatura do Aluno / Responsável
              </span>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3 print:border-slate-200">
          Documento gerado eletronicamente pelo Sistema de Frequência ITB. Autenticidade verificável nos registros institucionais.
        </div>
      </div>
    </div>
  );
}
