import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { formatDate, todayInSaoPaulo } from '../../lib/date';
import { useEntity } from '../../lib/use-entity';
import { buildClassBoletimData, buildUnifiedBoletimData, type ClassBoletimData } from '../../lib/boletim';
import { exportClassBoletimPdf } from '../../lib/boletim-pdf';
import { ClassBoletimView } from '../reports/class-boletim-view';
import { StudentReportCardView } from '../reports/student-report-card-view';
import { BiFilterBar } from './bi-filter-bar';
import { AnalyticsChart, ExportActions, initialFilters } from './bi-page';
import type { BiFilters } from './model';
import { useBiData } from './use-bi-data';
import { buildBiView } from './views';

export function BiGradesPage() {
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId') ?? '';

  const [filters, setFilters] = useState<BiFilters>({
    ...defaults,
    classId: initialClassId || undefined,
  });
  const [viewMode, setViewMode] = useState<'boletim' | 'analytics'>('boletim');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data, directory, options, loading } = useBiData(filters, today);

  const classes = useEntity('classes', true);
  const courses = useEntity('courses', true);
  const students = useEntity('students', true);
  const enrollments = useEntity('enrollments', true);
  const attendance = useEntity('attendance_records', true);
  const gradeTables = useEntity('grade_tables', true);
  const gradeItems = useEntity('grade_items', true);
  const studentGrades = useEntity('student_grades', true);

  const activeClasses = useMemo(
    () => (classes.items ?? []).filter((c) => !c.deleted_at && c.active !== 0 && c.active !== false),
    [classes.items],
  );

  // If no classId is selected in filters, pick the first active class so boletim is immediately visible
  const effectiveClassId = useMemo(() => {
    if (filters.classId) return filters.classId;
    return activeClasses.length > 0 ? activeClasses[0]!.id : '';
  }, [filters.classId, activeClasses]);

  useEffect(() => {
    if (!filters.classId && activeClasses.length > 0) {
      setFilters((prev) => ({ ...prev, classId: activeClasses[0]!.id }));
    }
  }, [activeClasses, filters.classId]);

  const handleFilterChange = (next: BiFilters) => {
    setFilters(next);
    if (next.classId) {
      setSearchParams({ classId: next.classId });
    } else {
      setSearchParams({});
    }
  };

  // Build Consolidated Class Boletim Data (matches reference layout)
  const classBoletimData = useMemo<ClassBoletimData | null>(() => {
    if (!effectiveClassId) return null;
    return buildClassBoletimData({
      classId: effectiveClassId,
      classes: classes.items ?? [],
      courses: courses.items ?? [],
      gradeTables: gradeTables.items ?? [],
      gradeItems: gradeItems.items ?? [],
      studentGrades: studentGrades.items ?? [],
      students: students.items ?? [],
      enrollments: enrollments.items ?? [],
      attendanceRecords: attendance.items ?? [],
    });
  }, [
    effectiveClassId,
    classes.items,
    courses.items,
    gradeTables.items,
    gradeItems.items,
    studentGrades.items,
    students.items,
    enrollments.items,
    attendance.items,
  ]);

  // Build Student Boletim Data (when student is clicked for modal preview)
  const studentBoletimData = useMemo(() => {
    if (!selectedStudentId) return null;
    return buildUnifiedBoletimData({
      studentId: selectedStudentId,
      students: students.items ?? [],
      enrollments: enrollments.items ?? [],
      classes: classes.items ?? [],
      courses: courses.items ?? [],
      attendanceRecords: attendance.items ?? [],
      gradeTables: gradeTables.items ?? [],
      gradeItems: gradeItems.items ?? [],
      studentGrades: studentGrades.items ?? [],
    });
  }, [
    selectedStudentId,
    students.items,
    enrollments.items,
    classes.items,
    courses.items,
    attendance.items,
    gradeTables.items,
    gradeItems.items,
    studentGrades.items,
  ]);

  // Analytics View for grades
  const biView = useMemo(() => buildBiView('grades', data), [data]);
  const context = useMemo(
    () => [`Período: ${formatDate(filters.from)} a ${formatDate(filters.to)}`],
    [filters.from, filters.to],
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadClassPdf = async () => {
    if (!classBoletimData) return;
    try {
      setDownloadingPdf(true);
      await exportClassBoletimPdf(classBoletimData);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const currentClass = activeClasses.find((c) => c.id === effectiveClassId);

  return (
    <div className="flex flex-col gap-4 text-left">
      {/* 1. FILTER BAR (Hidden in print) */}
      <div className="print:hidden">
        <BiFilterBar
          filters={filters}
          onChange={handleFilterChange}
          {...options}
          teachers={directory}
          onReset={() => handleFilterChange(defaults)}
        />
      </div>

      {/* 2. TOP TOOLBAR & VIEW SWITCHER (Hidden in print) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 px-3.5 shadow-2xs">
        {/* View Switcher Tabs */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
          <button
            type="button"
            onClick={() => setViewMode('boletim')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'boletim'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-sky-600" />
            <span>Boletim Consolidado da Turma</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'analytics'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Visão Analítica B.I</span>
          </button>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handlePrint}
            aria-label="Imprimir"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-700" />
            <span>Imprimir</span>
          </button>

          {viewMode === 'boletim' && classBoletimData && (
            <button
              type="button"
              onClick={() => void handleDownloadClassPdf()}
              disabled={downloadingPdf}
              aria-label="Baixar PDF do Boletim"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>{downloadingPdf ? 'Gerando...' : 'Baixar PDF'}</span>
            </button>
          )}

          {viewMode === 'analytics' && (
            <ExportActions
              title={biView.title}
              context={context}
              headers={biView.headers ?? []}
              rows={biView.rows ?? []}
              payload={biView.payload}
              metrics={biView.metrics ?? []}
              onPrint={handlePrint}
            />
          )}
        </div>
      </div>

      {loading && (
        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden print:hidden" aria-label="Carregando">
          <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
        </div>
      )}

      {/* 3. VIEW 1: BOLETIM CONSOLIDADO DA TURMA (EXACT REFERENCE LAYOUT) */}
      {viewMode === 'boletim' && (
        <div className={selectedStudentId ? 'print:hidden' : ''}>
          {classBoletimData && classBoletimData.tables.length > 0 ? (
            <ClassBoletimView
              data={classBoletimData}
              onSelectStudent={(studentId) => setSelectedStudentId(studentId)}
              onPrint={handlePrint}
              onDownloadPdf={() => void handleDownloadClassPdf()}
            />
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center shadow-2xs max-w-xl mx-auto my-6 print:border-none">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-3">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Nenhum boletim disponível para {currentClass ? String(currentClass.name ?? '') : 'esta turma'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
                As tabelas de notas e avaliações desta turma ainda não foram cadastradas ou não possuem notas registradas.
              </p>
              {effectiveClassId && (
                <a
                  href={`/notas?classId=${effectiveClassId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <Award className="w-4 h-4 text-sky-400" />
                  <span>Gerenciar Notas da Turma</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. VIEW 2: VISÃO ANALÍTICA B.I */}
      {viewMode === 'analytics' && (
        <div className="flex flex-col gap-4">
          {/* Metrics Ribbon */}
          <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200/90 rounded-2xl p-2.5 px-3.5 shadow-2xs">
            {(biView.metrics ?? []).map((metric) => (
              <div
                key={metric.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <span className="text-slate-500 font-medium text-[11px]">{metric.label}:</span>
                <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight">{metric.value}</span>
              </div>
            ))}
          </div>

          {/* Analytics Chart */}
          {biView.chart && (
            <div className="w-full">
              <AnalyticsChart chart={biView.chart} />
            </div>
          )}

          {/* Comparative Data Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{biView.tableTitle}</h2>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {(biView.rows ?? []).length.toLocaleString('pt-BR')} linha(s) consolidada(s)
                </p>
              </div>
            </div>

            {!(biView.rows ?? []).length ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                Nenhum dado analítico para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[560px]">
                <table className="w-full text-left text-xs border-collapse" aria-label={biView.tableTitle}>
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-1 border-b border-slate-200">
                    <tr className="text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                      {(biView.headers ?? []).map((header, index) => (
                        <th key={`${header}-${index}`} className="py-2.5 px-3.5 whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(biView.rows ?? []).map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-slate-50/75 transition-colors">
                        {(Array.isArray(row) ? row : [row]).map((value, index) => (
                          <td
                            key={`${rowIndex}-${index}`}
                            className={`py-2 px-3.5 ${index === 0 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
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
      )}

      {/* 5. MODAL: STUDENT INDIVIDUAL REPORT CARD (WHEN CLICKED FROM TABLE) */}
      {selectedStudentId && studentBoletimData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 print:p-0">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity print:hidden"
            onClick={() => setSelectedStudentId(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Boletim Escolar de ${studentBoletimData.student.name}`}
            className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 sm:p-6 z-10 transition-all text-left print:max-w-none print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Boletim Individual — {studentBoletimData.student.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <StudentReportCardView data={studentBoletimData} />
          </div>
        </div>
      )}
    </div>
  );
}
