import React, { useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Download,
  Printer,
  Search,
} from 'lucide-react';
import type { ClassBoletimData } from '../../lib/boletim';
import { exportClassBoletimPdf } from '../../lib/boletim-pdf';
import { formatGrade, type GradeStatus } from '../../lib/grades';

export function statusBadgeStyle(status: GradeStatus): string {
  switch (status) {
    case 'aprovado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'recuperacao':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'reprovado':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'em_andamento':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export interface ClassBoletimViewProps {
  data: ClassBoletimData;
  onOrganizeTables?: () => void;
  onSelectStudent?: (studentId: string) => void;
  onPrint?: () => void;
  onDownloadPdf?: () => void;
  showSearch?: boolean;
}

export function ClassBoletimView({
  data,
  onOrganizeTables,
  onSelectStudent,
  onPrint,
  onDownloadPdf,
  showSearch = true,
}: ClassBoletimViewProps) {
  const [search, setSearch] = useState('');
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
      await exportClassBoletimPdf(data);
    } finally {
      setDownloading(false);
    }
  };

  const filteredStudents = data.students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.studentName.toLowerCase().includes(q) ||
      s.registrationNumber.toLowerCase().includes(q)
    );
  });

  const formattedEmissionDate = (() => {
    try {
      const d = data.issueDate ? new Date(data.issueDate) : new Date();
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  return (
    <div className="flex flex-col gap-3 text-left w-full">
      {/* PRINT-ONLY INSTITUTIONAL HEADER */}
      <div className="hidden print:flex flex-col gap-3 pb-4 border-b border-slate-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-950 flex items-center justify-center text-white font-black text-sm">
              ITB
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-600 block">
                Instituto Transforma Brasil
              </span>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                Boletim Consolidado da Turma — {data.className}
              </h1>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <span className="block font-semibold">Data de Emissão</span>
            <span className="font-mono text-slate-800">{formattedEmissionDate}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div>
            <span className="text-slate-500 font-medium">Curso: </span>
            <span className="font-semibold text-slate-900">{data.courseName || '—'}</span>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Turma: </span>
            <span className="font-semibold text-slate-900">{data.className}</span>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Total de Alunos: </span>
            <span className="font-semibold text-slate-900">{data.totalStudents}</span>
          </div>
        </div>
      </div>

      {/* CONSOLIDATED BOLETIM CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden print:border-none print:shadow-none">
        {/* CARD TOOLBAR / HEADER */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Boletim Consolidado — {data.className}
            </h3>
            <p className="text-xs text-slate-500">
              Visão geral de desempenho com médias calculadas conforme a configuração de cada etapa (Média Aritmética ou Maior Nota).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {showSearch && data.students.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar aluno..."
                  className="h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 text-xs bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 w-36 sm:w-44"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handlePrint}
              aria-label="Imprimir Boletim"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              aria-label="Baixar PDF"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>{downloading ? 'Gerando...' : 'Baixar PDF'}</span>
            </button>

            {onOrganizeTables && data.tables.length > 1 && (
              <button
                type="button"
                onClick={onOrganizeTables}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Organizar Tabelas</span>
              </button>
            )}
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse print:w-full" aria-label={`Boletim Consolidado — ${data.className}`}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4 whitespace-nowrap">Aluno</th>
                {data.tables.map((t) => (
                  <th key={t.id} className="py-3 px-3 text-center border-l border-slate-200/60 whitespace-nowrap">
                    <div>{t.name}</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {t.calculationModeLabel}
                    </div>
                    {t.periodLabel && (
                      <div className="text-[10px] font-normal text-slate-400">{t.periodLabel}</div>
                    )}
                  </th>
                ))}
                <th className="py-3 px-4 text-center border-l border-slate-200/60 whitespace-nowrap">
                  Média Geral
                </th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Frequência</th>
                <th className="py-3 px-4 text-center whitespace-nowrap print:hidden">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.tables.length + 4}
                    className="py-8 text-center text-slate-400 font-medium"
                  >
                    Nenhum aluno encontrado para este filtro.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr
                    key={student.studentId}
                    className="hover:bg-slate-50/70 transition-colors print:break-inside-avoid"
                  >
                    <td
                      className={`py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap ${
                        onSelectStudent ? 'cursor-pointer hover:text-sky-700 hover:underline' : ''
                      }`}
                      onClick={() => onSelectStudent?.(student.studentId)}
                    >
                      {student.studentName}
                    </td>

                    {student.tableResults.map((tr) => (
                      <td
                        key={tr.tableId}
                        className="py-2.5 px-3 text-center border-l border-slate-100 font-semibold text-slate-800 whitespace-nowrap"
                      >
                        <div>{formatGrade(tr.average)}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {tr.evaluatedCount}/{tr.totalItems} aval.
                        </div>
                      </td>
                    ))}

                    <td className="py-2.5 px-4 text-center border-l border-slate-100 font-black text-slate-950 whitespace-nowrap">
                      {formatGrade(student.overallAverage)}
                    </td>

                    <td className="py-2.5 px-3 text-center font-medium text-slate-700 whitespace-nowrap">
                      {student.attendanceRateLabel}
                    </td>

                    <td className="py-2.5 px-4 text-center whitespace-nowrap print:hidden">
                      <span
                        data-testid="status-badge"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadgeStyle(
                          student.overallStatus,
                        )}`}
                      >
                        {student.overallStatus === 'aprovado' && <CheckCircle2 className="w-3 h-3" />}
                        <span>{student.overallStatusLabel}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PRINT-ONLY FOOTER SIGNATURES & CRITERIA */}
        <div className="hidden print:flex flex-col gap-6 p-6 border-t border-slate-300 mt-4 text-xs">
          <div className="text-[11px] text-slate-500">
            <span className="font-bold text-slate-700">Critérios de Aprovação: </span>
            Frequência mínima de 75,0% e média mínima 6,0. As médias respeitam a metodologia de cálculo de cada etapa (Média Simples, Média Ponderada ou Soma de Pontos) na escala de 0 a 10.
          </div>
          <div className="grid grid-cols-2 gap-12 pt-6">
            <div className="text-center">
              <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-800">
                Coordenação Pedagógica
              </div>
              <div className="text-[10px] text-slate-500">Instituto Transforma Brasil</div>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-800">
                Professor(a) Responsável
              </div>
              <div className="text-[10px] text-slate-500">Assinatura / Validação</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
