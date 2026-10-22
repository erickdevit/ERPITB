import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  MessageSquare,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../app-context';
import { PageDialog, SelectField } from '../components';
import { latestAttendance } from '../lib/attendance';
import { buildUnifiedBoletimData, type ClassBoletimData } from '../lib/boletim';
import {
  buildClassGradeSummary,
  calculationModeLabel,
  computeTableAverage,
  DEFAULT_CATEGORY_SUGGESTIONS,
  formatGrade,
  gradeStatusLabel,
  type CalculationMode,
  type GradeStatus,
} from '../lib/grades';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import { ClassBoletimView } from './reports/class-boletim-view';
import { StudentReportCardView } from './reports/student-report-card-view';
import {
  deleteGradeItemCascade,
  deleteGradeTableCascade,
  moveArrayItem,
  parseScoreText,
  reorderGradeItems,
  reorderGradeTables,
  saveGradeItem,
  saveGradeTable,
  saveStudentGradesBatch,
} from './grades-model';

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');

function formatDatePt(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatTablePeriod(startDate?: unknown, endDate?: unknown): string {
  const sd = typeof startDate === 'string' ? startDate.trim() : '';
  const ed = typeof endDate === 'string' ? endDate.trim() : '';
  if (sd && ed) return `${formatDatePt(sd)} a ${formatDatePt(ed)}`;
  if (sd) return `Início: ${formatDatePt(sd)}`;
  if (ed) return `Fim: ${formatDatePt(ed)}`;
  return '';
}

function statusBadgeStyle(status: GradeStatus): string {
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

interface TableModalState {
  open: boolean;
  existing?: LocalRecord;
  name: string;
  calculationMode: CalculationMode;
  passingGrade: string;
  published: boolean;
  startDate: string;
  endDate: string;
  notes: string;
  error?: string;
}

interface ItemModalState {
  open: boolean;
  existing?: LocalRecord;
  name: string;
  category: string;
  evaluationDate: string;
  maxScore: string;
  weight: string;
  notes: string;
  error?: string;
}

interface RemarkModalState {
  open: boolean;
  cellKey: string;
  studentName: string;
  itemName: string;
  remarks: string;
}

interface OrganizeModalState {
  open: boolean;
  tables: LocalRecord[];
  items: LocalRecord[];
}

export function GradesPage() {
  const { store, sync, session } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const attendance = useEntity('attendance_records');
  const gradeTables = useEntity('grade_tables');
  const gradeItems = useEntity('grade_items');
  const studentGrades = useEntity('student_grades');

  const initialClassId = searchParams.get('classId') ?? '';
  const [classId, setClassId] = useState(initialClassId);
  const [viewMode, setViewMode] = useState<'sheet' | 'reportCard'>('sheet');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedStudentForBoletim, setSelectedStudentForBoletim] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string }>();

  // Draft cells: key = `${studentId}:${itemId}` -> { scoreText, remarks }
  const [draftCells, setDraftCells] = useState<Record<string, { scoreText: string; remarks: string }>>({});
  const [dirty, setDirty] = useState(false);

  const [tableModal, setTableModal] = useState<TableModalState>({
    open: false,
    name: '',
    calculationMode: 'simple',
    passingGrade: '6,0',
    published: true,
    startDate: '',
    endDate: '',
    notes: '',
  });

  const [itemModal, setItemModal] = useState<ItemModalState>({
    open: false,
    name: '',
    category: 'Prova',
    evaluationDate: '',
    maxScore: '10',
    weight: '1',
    notes: '',
  });

  const [remarkModal, setRemarkModal] = useState<RemarkModalState>({
    open: false,
    cellKey: '',
    studentName: '',
    itemName: '',
    remarks: '',
  });

  const [organizeModal, setOrganizeModal] = useState<OrganizeModalState>({
    open: false,
    tables: [],
    items: [],
  });

  const activeClasses = useMemo(
    () => classes.items.filter((c) => !c.deleted_at && c.active !== 0 && c.active !== false),
    [classes.items],
  );

  useEffect(() => {
    if (!classId && activeClasses.length > 0) {
      setClassId(activeClasses[0]!.id);
    }
  }, [classId, activeClasses]);

  const classTables = useMemo(
    () =>
      gradeTables.items
        .filter((t) => !t.deleted_at && String(t.class_id) === classId)
        .sort(
          (a, b) =>
            Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
            String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
        ),
    [gradeTables.items, classId],
  );

  useEffect(() => {
    if (classTables.length === 0) {
      setSelectedTableId('');
      return;
    }
    if (!selectedTableId || !classTables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId(classTables[0]!.id);
    }
  }, [classTables, selectedTableId]);

  const currentTable = useMemo(
    () => classTables.find((t) => t.id === selectedTableId),
    [classTables, selectedTableId],
  );

  const tableItems = useMemo(
    () =>
      gradeItems.items
        .filter((i) => !i.deleted_at && String(i.grade_table_id) === selectedTableId)
        .sort(
          (a, b) =>
            Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
            String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
        ),
    [gradeItems.items, selectedTableId],
  );

  const enrolledStudents = useMemo(() => {
    const activeStudentIds = new Set(
      enrollments.items
        .filter((e) => !e.deleted_at && e.class_id === classId && e.status === 'ativa')
        .map((e) => String(e.student_id)),
    );
    const gradedStudentIds = new Set(
      studentGrades.items
        .filter(
          (g) =>
            !g.deleted_at &&
            String(g.grade_table_id) === selectedTableId &&
            g.score !== null &&
            g.score !== undefined,
        )
        .map((g) => String(g.student_id)),
    );
    const studentMap = new Map(
      students.items.filter((s) => !s.deleted_at && s.active !== 0 && s.active !== false).map((s) => [s.id, s]),
    );
    const candidateIds = new Set([...activeStudentIds, ...gradedStudentIds]);
    return Array.from(candidateIds)
      .map((id) => studentMap.get(id))
      .filter((s): s is LocalRecord => Boolean(s))
      .map((s) => ({
        id: s.id,
        name: text(s, 'name'),
        registrationNumber: text(s, 'registration_number'),
        isTransferred: !activeStudentIds.has(s.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrollments.items, students.items, studentGrades.items, selectedTableId, classId]);

  // Existing grades map for current table: key = `${studentId}:${itemId}`
  const existingGradesMap = useMemo(() => {
    const map = new Map<string, LocalRecord>();
    for (const g of studentGrades.items) {
      if (g.deleted_at || String(g.grade_table_id) !== selectedTableId) continue;
      const key = `${g.student_id}:${g.grade_item_id}`;
      const prev = map.get(key);
      if (!prev || String(g.updated_at ?? '') >= String(prev.updated_at ?? '')) {
        map.set(key, g);
      }
    }
    return map;
  }, [studentGrades.items, selectedTableId]);

  // Synchronize draftCells whenever selectedTableId, tableItems, enrolledStudents, or existingGradesMap changes
  useEffect(() => {
    const next: Record<string, { scoreText: string; remarks: string }> = {};
    for (const student of enrolledStudents) {
      for (const item of tableItems) {
        const key = `${student.id}:${item.id}`;
        const existing = existingGradesMap.get(key);
        const hasScore = existing?.score !== null && existing?.score !== undefined && existing?.score !== '';
        next[key] = {
          scoreText: hasScore ? String(existing!.score).replace('.', ',') : '',
          remarks: existing?.remarks ? String(existing.remarks) : '',
        };
      }
    }
    setDraftCells(next);
    setDirty(false);
  }, [selectedTableId, tableItems, enrolledStudents, existingGradesMap]);

  const classSummary = useMemo(
    () =>
      buildClassGradeSummary({
        classId,
        tables: gradeTables.items,
        items: gradeItems.items,
        studentGrades: studentGrades.items,
        students: enrolledStudents,
      }),
    [classId, gradeTables.items, gradeItems.items, studentGrades.items, enrolledStudents],
  );

  // Attendance rate per student in this class
  const studentAttendanceRate = useMemo(() => {
    const classRecords = latestAttendance(attendance.items).filter(
      (r) => !r.deleted_at && String(r.class_id) === classId,
    );
    const map = new Map<string, { present: number; total: number }>();
    for (const r of classRecords) {
      const sid = String(r.student_id);
      const curr = map.get(sid) ?? { present: 0, total: 0 };
      curr.total += 1;
      if (r.status === 'P' || r.status === 'RC') curr.present += 1;
      map.set(sid, curr);
    }
    const rates = new Map<string, number | null>();
    for (const [sid, data] of map.entries()) {
      rates.set(sid, data.total > 0 ? Math.round((data.present / data.total) * 1000) / 10 : null);
    }
    return rates;
  }, [attendance.items, classId]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrolledStudents;
    return enrolledStudents.filter(
      (s) => s.name.toLowerCase().includes(q) || s.registrationNumber.toLowerCase().includes(q),
    );
  }, [enrolledStudents, search]);

  const handleClassChange = (nextClassId: string) => {
    setClassId(nextClassId);
    setSearchParams(nextClassId ? { classId: nextClassId } : {});
    setNotice(undefined);
  };

  const openNewTableModal = () => {
    setTableModal({
      open: true,
      name: classTables.length === 0 ? '1ª Etapa / Avaliações' : `${classTables.length + 1}ª Etapa`,
      calculationMode: 'simple',
      passingGrade: '6,0',
      published: true,
      startDate: '',
      endDate: '',
      notes: '',
    });
  };

  const openEditTableModal = (table: LocalRecord) => {
    setTableModal({
      open: true,
      existing: table,
      name: text(table, 'name'),
      calculationMode: (['simple', 'weighted', 'sum'].includes(text(table, 'calculation_mode'))
        ? text(table, 'calculation_mode')
        : 'simple') as CalculationMode,
      passingGrade: String(table.passing_grade ?? 6).replace('.', ','),
      published: table.published !== 0 && table.published !== false,
      startDate: text(table, 'start_date'),
      endDate: text(table, 'end_date'),
      notes: text(table, 'notes'),
    });
  };

  const handleSaveTable = async () => {
    try {
      const passingGrade = Number(tableModal.passingGrade.replace(',', '.'));
      const savedId = await saveGradeTable(store, sync, session.id, {
        classId,
        name: tableModal.name,
        calculationMode: tableModal.calculationMode,
        passingGrade,
        published: tableModal.published,
        sortOrder: tableModal.existing ? Number(tableModal.existing.sort_order ?? 0) : classTables.length + 1,
        startDate: tableModal.startDate,
        endDate: tableModal.endDate,
        notes: tableModal.notes,
        existing: tableModal.existing,
      });
      setTableModal((prev) => ({ ...prev, open: false, error: undefined }));
      setSelectedTableId(savedId);
      setNotice({
        severity: 'success',
        message: tableModal.existing ? 'Tabela de notas atualizada com sucesso.' : 'Nova tabela de notas criada com sucesso.',
      });
    } catch (err) {
      setTableModal((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Erro ao salvar tabela de notas.',
      }));
    }
  };

  const handleDeleteTable = async (table: LocalRecord) => {
    try {
      await deleteGradeTableCascade(store, sync, table, gradeItems.items, studentGrades.items);
      setNotice({ severity: 'success', message: `Tabela "${text(table, 'name')}" removida.` });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível excluir a tabela.',
      });
    }
  };

  const handleTogglePublished = async (table: LocalRecord) => {
    try {
      const currentlyPublished = table.published !== 0 && table.published !== false;
      await saveGradeTable(store, sync, session.id, {
        classId,
        name: text(table, 'name'),
        calculationMode: (text(table, 'calculation_mode') || 'simple') as CalculationMode,
        passingGrade: Number(table.passing_grade ?? 6),
        published: !currentlyPublished,
        sortOrder: Number(table.sort_order ?? 0),
        startDate: text(table, 'start_date'),
        endDate: text(table, 'end_date'),
        notes: text(table, 'notes'),
        existing: table,
      });
      setNotice({
        severity: 'success',
        message: !currentlyPublished
          ? 'Tabela publicada no Boletim Público do aluno.'
          : 'Tabela ocultada do Boletim Público (modo rascunho).',
      });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Erro ao alterar visibilidade da tabela.',
      });
    }
  };

  const handleMoveTableInline = async (fromIndex: number, toIndex: number) => {
    const reordered = moveArrayItem(classTables, fromIndex, toIndex);
    try {
      await reorderGradeTables(store, sync, reordered);
      setNotice({ severity: 'success', message: 'Ordem das tabelas atualizada.' });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Erro ao reordenar tabelas.',
      });
    }
  };

  const handleMoveItemInline = async (fromIndex: number, toIndex: number) => {
    const reordered = moveArrayItem(tableItems, fromIndex, toIndex);
    try {
      await reorderGradeItems(store, sync, reordered);
      setNotice({ severity: 'success', message: 'Ordem das colunas de avaliação atualizada.' });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Erro ao reordenar colunas de avaliação.',
      });
    }
  };

  const openOrganizeModal = () => {
    setOrganizeModal({
      open: true,
      tables: [...classTables],
      items: [...tableItems],
    });
  };

  const handleSaveOrganization = async () => {
    try {
      await reorderGradeTables(store, sync, organizeModal.tables);
      await reorderGradeItems(store, sync, organizeModal.items);
      setOrganizeModal((prev) => ({ ...prev, open: false }));
      setNotice({ severity: 'success', message: 'Organização de tabelas e colunas salva com sucesso.' });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Erro ao salvar organização.',
      });
    }
  };

  const openNewItemModal = () => {
    setItemModal({
      open: true,
      name: '',
      category: 'Prova',
      evaluationDate: new Date().toISOString().slice(0, 10),
      maxScore: '10',
      weight: '1',
      notes: '',
    });
  };

  const openEditItemModal = (item: LocalRecord) => {
    setItemModal({
      open: true,
      existing: item,
      name: text(item, 'name'),
      category: text(item, 'category') || 'Prova',
      evaluationDate: text(item, 'evaluation_date'),
      maxScore: String(item.max_score ?? 10).replace('.', ','),
      weight: String(item.weight ?? 1).replace('.', ','),
      notes: text(item, 'notes'),
    });
  };

  const handleSaveItem = async () => {
    if (!currentTable) return;
    try {
      const maxScore = Number(itemModal.maxScore.replace(',', '.'));
      const weight = Number(itemModal.weight.replace(',', '.'));
      await saveGradeItem(store, sync, session.id, {
        classId,
        gradeTableId: currentTable.id,
        name: itemModal.name,
        category: itemModal.category,
        evaluationDate: itemModal.evaluationDate,
        maxScore,
        weight,
        sortOrder: itemModal.existing ? Number(itemModal.existing.sort_order ?? 0) : tableItems.length + 1,
        notes: itemModal.notes,
        existing: itemModal.existing,
      });
      setItemModal((prev) => ({ ...prev, open: false, error: undefined }));
      setNotice({
        severity: 'success',
        message: itemModal.existing ? 'Avaliação atualizada.' : 'Nova coluna de avaliação adicionada à tabela.',
      });
    } catch (err) {
      setItemModal((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Erro ao salvar avaliação.',
      }));
    }
  };

  const handleDeleteItem = async (item: LocalRecord) => {
    try {
      await deleteGradeItemCascade(store, sync, item, studentGrades.items);
      setNotice({ severity: 'success', message: `Avaliação "${text(item, 'name')}" removida.` });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Erro ao remover avaliação.',
      });
    }
  };

  const handleSaveGrades = async () => {
    if (!currentTable) return;
    setSaving(true);
    setNotice(undefined);
    try {
      const entries = [];
      for (const student of enrolledStudents) {
        for (const item of tableItems) {
          const key = `${student.id}:${item.id}`;
          const draft = draftCells[key] ?? { scoreText: '', remarks: '' };
          entries.push({
            studentId: student.id,
            gradeItemId: item.id,
            scoreText: draft.scoreText,
            remarks: draft.remarks,
            maxScore: Number(item.max_score ?? 10) || 10,
            existing: existingGradesMap.get(key),
          });
        }
      }
      const changedCount = await saveStudentGradesBatch(store, sync, session.id, classId, currentTable.id, entries);
      setDirty(false);
      setNotice({
        severity: 'success',
        message:
          changedCount > 0
            ? `${changedCount} lançamento(s) de nota salvos e sincronizados com sucesso.`
            : 'Nenhuma alteração pendente para salvar.',
      });
    } catch (err) {
      setNotice({
        severity: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível salvar as notas.',
      });
    } finally {
      setSaving(false);
    }
  };

  const currentClass = activeClasses.find((c) => c.id === classId);
  const currentCourse = courses.items.find((c) => c.id === currentClass?.course_id);

  const classBoletimData = useMemo<ClassBoletimData | null>(() => {
    if (!currentClass) return null;
    return {
      classId: currentClass.id,
      className: text(currentClass, 'name'),
      courseName: currentCourse ? text(currentCourse, 'name') : undefined,
      tables: classTables.map((t) => {
        const mode = (['simple', 'weighted', 'sum'].includes(text(t, 'calculation_mode'))
          ? text(t, 'calculation_mode')
          : 'simple') as CalculationMode;
        return {
          id: t.id,
          name: text(t, 'name'),
          calculationMode: mode,
          calculationModeLabel: calculationModeLabel(mode),
          startDate: text(t, 'start_date') || null,
          endDate: text(t, 'end_date') || null,
          periodLabel: formatTablePeriod(t.start_date, t.end_date) || null,
          passingGrade: Number(t.passing_grade ?? 6) || 6,
        };
      }),
      students: classSummary.studentSummaries
        .filter((s) => {
          const q = search.trim().toLowerCase();
          return !q || s.studentName.toLowerCase().includes(q) || s.registrationNumber.toLowerCase().includes(q);
        })
        .map((s) => {
          const attRate = studentAttendanceRate.get(s.studentId);
          return {
            studentId: s.studentId,
            studentName: s.studentName,
            registrationNumber: s.registrationNumber,
            tableResults: s.tableResults,
            overallAverage: s.overallAverage,
            attendanceRate: attRate ?? null,
            attendanceRateLabel: attRate !== null && attRate !== undefined ? `${attRate.toFixed(1).replace('.', ',')}%` : '—',
            overallStatus: s.overallStatus,
            overallStatusLabel: s.overallStatusLabel,
          };
        }),
      classAverage: classSummary.classAverage,
      approvedCount: classSummary.approvedCount,
      totalStudents: classSummary.studentSummaries.length,
      issueDate: new Date().toISOString(),
    };
  }, [classSummary, classTables, currentClass, currentCourse, search, studentAttendanceRate]);

  const studentBoletimData = useMemo(() => {
    if (!selectedStudentForBoletim || !classId) return null;
    return buildUnifiedBoletimData({
      studentId: selectedStudentForBoletim,
      classId,
      students: students.items ?? [],
      enrollments: enrollments.items ?? [],
      classes: classes.items ?? [],
      courses: courses.items ?? [],
      attendanceRecords: attendance.items ?? [],
      gradeTables: gradeTables.items ?? [],
      gradeItems: gradeItems.items ?? [],
      studentGrades: studentGrades.items ?? [],
    });
  }, [selectedStudentForBoletim, classId, students.items, enrollments.items, classes.items, courses.items, attendance.items, gradeTables.items, gradeItems.items, studentGrades.items]);

  return (
    <div className="space-y-6 text-left">
      {/* Top Filter & View Switcher Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-2xl">
            <SelectField
              label="Turma"
              value={classId}
              onChange={handleClassChange}
              options={activeClasses.map((c) => ({
                value: c.id,
                label: text(c, 'name'),
              }))}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-700">Buscar aluno</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou matrícula..."
                  className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
                />
              </div>
            </div>
          </div>

          {/* View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('sheet')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'sheet'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Tabelas e Lançamento</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('reportCard')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'reportCard'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Boletim Consolidado da Turma</span>
              </button>
            </div>

            {classId && (
              <button
                type="button"
                onClick={openNewTableModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Tabela de Notas</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            notice.severity === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(undefined)}
            className="text-[11px] underline ml-4 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Empty State if no tables exist yet */}
      {classId && classTables.length === 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center shadow-2xs max-w-xl mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            Nenhuma tabela de notas criada para {currentClass ? text(currentClass, 'name') : 'esta turma'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
            Crie tabelas flexíveis (ex.: Módulo 1, 1º Bimestre, Avaliações Práticas) e adicione quantas colunas de provas, trabalhos ou atividades práticas desejar.
          </p>
          <button
            type="button"
            onClick={openNewTableModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Criar primeira tabela de notas</span>
          </button>
        </div>
      )}

      {/* VIEW 1: GRADEBOOK SHEET PER TABLE */}
      {viewMode === 'sheet' && classTables.length > 0 && currentTable && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          {/* Table Tabs Bar */}
          <div className="px-4 sm:px-5 pt-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3">
              {classTables.map((table, tableIdx) => {
                const active = table.id === currentTable.id;
                const isPub = table.published !== 0 && table.published !== false;
                const period = formatTablePeriod(table.start_date, table.end_date);
                return (
                  <div
                    key={table.id}
                    className={`inline-flex items-center rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {classTables.length > 1 && active && (
                      <button
                        type="button"
                        disabled={tableIdx === 0}
                        onClick={() => void handleMoveTableInline(tableIdx, tableIdx - 1)}
                        title="Mover tabela para a esquerda"
                        className="pl-2 pr-1 py-2 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
                      className={`inline-flex items-center gap-2 py-2 cursor-pointer ${
                        classTables.length > 1 && active ? 'px-1.5' : 'px-3.5'
                      }`}
                    >
                      <span>{text(table, 'name')}</span>
                      {period && (
                        <span
                          className={`text-[10px] font-normal ${
                            active ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          ({period})
                        </span>
                      )}
                      {!isPub && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                          Rascunho
                        </span>
                      )}
                    </button>
                    {classTables.length > 1 && active && (
                      <button
                        type="button"
                        disabled={tableIdx === classTables.length - 1}
                        onClick={() => void handleMoveTableInline(tableIdx, tableIdx + 1)}
                        title="Mover tabela para a direita"
                        className="pl-1 pr-2 py-2 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active Table Controls */}
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <span className="text-[11px] font-medium text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200 inline-flex items-center gap-1.5">
                <span>
                  {calculationModeLabel(text(currentTable, 'calculation_mode'))} • Média mín.:{' '}
                  <strong className="text-slate-800">{formatGrade(Number(currentTable.passing_grade ?? 6))}</strong>
                </span>
                {formatTablePeriod(currentTable.start_date, currentTable.end_date) && (
                  <span className="inline-flex items-center gap-1 text-slate-600 border-l border-slate-200 pl-1.5">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{formatTablePeriod(currentTable.start_date, currentTable.end_date)}</span>
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => void handleTogglePublished(currentTable)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                title="Alternar visibilidade desta tabela no Boletim Público do Aluno"
              >
                {currentTable.published !== 0 && currentTable.published !== false ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Visível no Boletim</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                    <span>Oculta (Rascunho)</span>
                  </>
                )}
              </button>

              {(classTables.length > 1 || tableItems.length > 1) && (
                <button
                  type="button"
                  onClick={openOrganizeModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                  title="Organizar ordem das tabelas e colunas de avaliação"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Organizar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => openEditTableModal(currentTable)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Configurar Tabela</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteTable(currentTable)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-xs font-medium text-rose-700 cursor-pointer"
                title="Excluir tabela de notas"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={openNewItemModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Avaliação</span>
              </button>
            </div>
          </div>

          {/* Assessment Columns & Student Grade Matrix */}
          {tableItems.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-slate-500 mb-3">
                Esta tabela ainda não possui colunas de avaliação (ex.: Prova 1, Atividade Prática, Trabalho).
              </p>
              <button
                type="button"
                onClick={openNewItemModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar primeira avaliação</span>
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                      <th className="py-3 px-4 min-w-[210px] sticky left-0 bg-slate-50 z-10">Aluno</th>
                      {tableItems.map((item, itemIdx) => (
                        <th key={item.id} className="py-2.5 px-3 min-w-[175px] border-l border-slate-200/70">
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{text(item, 'name')}</div>
                              <div className="inline-flex items-center gap-1 mt-0.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-700 text-[10px] font-semibold">
                                  {text(item, 'category')}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Máx: {formatGrade(Number(item.max_score ?? 10))}
                                  {currentTable.calculation_mode === 'weighted'
                                    ? ` • Peso: ${formatGrade(Number(item.weight ?? 1))}`
                                    : ''}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {tableItems.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={itemIdx === 0}
                                    onClick={() => void handleMoveItemInline(itemIdx, itemIdx - 1)}
                                    className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                    title="Mover coluna para a esquerda"
                                  >
                                    <ChevronLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={itemIdx === tableItems.length - 1}
                                    onClick={() => void handleMoveItemInline(itemIdx, itemIdx + 1)}
                                    className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                    title="Mover coluna para a direita"
                                  >
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditItemModal(item)}
                                className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 cursor-pointer"
                                title="Editar avaliação"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteItem(item)}
                                className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Remover avaliação"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-4 min-w-[110px] border-l border-slate-200/70 text-center">
                        Média / Nota
                      </th>
                      <th className="py-3 px-4 min-w-[130px] text-center">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredStudents.map((student) => {
                      const calcMode = (text(currentTable, 'calculation_mode') || 'simple') as CalculationMode;
                      const passing = Number(currentTable.passing_grade ?? 6);
                      const rowEvalItems = tableItems.map((item) => {
                        const cellKey = `${student.id}:${item.id}`;
                        const draft = draftCells[cellKey] ?? { scoreText: '', remarks: '' };
                        const parsed = parseScoreText(draft.scoreText);
                        return {
                          score: parsed === 'INVALID' ? null : parsed,
                          maxScore: Number(item.max_score ?? 10) || 10,
                          weight: Number(item.weight ?? 1) || 1,
                        };
                      });
                      const evaluatedCount = rowEvalItems.filter((i) => i.score !== null).length;
                      const avg = computeTableAverage(calcMode, rowEvalItems);
                      let rowStatus: GradeStatus = 'em_andamento';
                      if (evaluatedCount === 0) rowStatus = 'em_andamento';
                      else if (evaluatedCount === tableItems.length && avg !== null) {
                        if (avg >= passing) rowStatus = 'aprovado';
                        else if (avg >= Math.max(4, passing - 2)) rowStatus = 'recuperacao';
                        else rowStatus = 'reprovado';
                      } else if (calcMode === 'sum' && avg !== null && avg >= passing) {
                        rowStatus = 'aprovado';
                      }

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 sticky left-0 bg-white z-10">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{student.name}</span>
                              {student.isTransferred && (
                                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                  Histórico
                                </span>
                              )}
                            </div>
                          </td>
                          {tableItems.map((item) => {
                            const cellKey = `${student.id}:${item.id}`;
                            const cell = draftCells[cellKey] ?? { scoreText: '', remarks: '' };
                            const maxScore = Number(item.max_score ?? 10) || 10;
                            const parsed = parseScoreText(cell.scoreText);
                            const invalid =
                              parsed === 'INVALID' || (parsed !== null && (parsed < 0 || parsed > maxScore));

                            return (
                              <td key={item.id} className="py-2 px-3 border-l border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    aria-label={`Nota de ${student.name} em ${text(item, 'name')}`}
                                    value={cell.scoreText}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDraftCells((prev) => ({
                                        ...prev,
                                        [cellKey]: {
                                          scoreText: val,
                                          remarks: prev[cellKey]?.remarks ?? '',
                                        },
                                      }));
                                      setDirty(true);
                                    }}
                                    placeholder="—"
                                    className={`w-20 h-8 px-2.5 rounded-lg border text-xs font-semibold text-center focus:outline-none focus:ring-2 ${
                                      invalid
                                        ? 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-rose-200'
                                        : 'border-slate-200 bg-white text-slate-900 focus:border-slate-900 focus:ring-slate-900/10'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRemarkModal({
                                        open: true,
                                        cellKey,
                                        studentName: student.name,
                                        itemName: text(item, 'name'),
                                        remarks: cell.remarks,
                                      })
                                    }
                                    title={cell.remarks ? `Observação: ${cell.remarks}` : 'Adicionar feedback/observação'}
                                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                      cell.remarks
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-700'
                                    }`}
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-4 border-l border-slate-100 text-center font-bold text-slate-900">
                            {formatGrade(avg)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusBadgeStyle(
                                rowStatus,
                              )}`}
                            >
                              {gradeStatusLabel(rowStatus)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer Save Action Bar */}
              <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {dirty ? (
                    <span className="text-amber-700 font-semibold">
                      Existem notas alteradas ainda não salvas nesta tabela.
                    </span>
                  ) : (
                    <span>Todas as notas lançadas estão sincronizadas.</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveGrades()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Salvando...' : 'Salvar Notas da Tabela'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW 2: CONSOLIDATED CLASS REPORT CARD & CATEGORY BREAKDOWN */}
      {viewMode === 'reportCard' && classTables.length > 0 && (
        <div className="space-y-6">
          {/* Category Breakdown Cards */}
          {classSummary.categoryBreakdown.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Desempenho da Turma por Tipo de Avaliação
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {classSummary.categoryBreakdown.map((cat) => (
                  <div
                    key={cat.category}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{cat.category}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {cat.itemCount} avaliação(ões) • {cat.evaluatedEntries} nota(s)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">{formatGrade(cat.averageScore)}</div>
                      <div className="text-[10px] text-slate-400">média</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consolidated Class Boletim Table */}
          {classBoletimData && (
            <ClassBoletimView
              data={classBoletimData}
              onOrganizeTables={classTables.length > 1 ? openOrganizeModal : undefined}
              onSelectStudent={(studentId) => setSelectedStudentForBoletim(studentId)}
              showSearch={false}
            />
          )}
        </div>
      )}

      {/* Modal: Create / Edit Grade Table */}
      <PageDialog
        open={tableModal.open}
        title={tableModal.existing ? 'Configurar Tabela de Notas' : 'Nova Tabela de Notas'}
        onClose={() => setTableModal((prev) => ({ ...prev, open: false, error: undefined }))}
        onSave={() => void handleSaveTable()}
        saveText="Salvar Tabela"
      >
        {tableModal.error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {tableModal.error}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-700">Nome da Tabela / Etapa</label>
          <input
            type="text"
            value={tableModal.name}
            onChange={(e) => setTableModal((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ex.: Módulo 1 - Fundamentos, 1º Bimestre, Avaliações Práticas..."
            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Modo de Cálculo da Nota"
            value={tableModal.calculationMode}
            onChange={(val) => setTableModal((prev) => ({ ...prev, calculationMode: val as CalculationMode }))}
            options={[
              { value: 'simple', label: 'Média Simples (0 a 10)' },
              { value: 'weighted', label: 'Média Ponderada por Peso' },
              { value: 'sum', label: 'Soma de Pontos (até 10)' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Média Mínima de Aprovação (0 a 10)</label>
            <input
              type="text"
              inputMode="decimal"
              value={tableModal.passingGrade}
              onChange={(e) => setTableModal((prev) => ({ ...prev, passingGrade: e.target.value }))}
              placeholder="6,0"
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Data Inicial da Tabela (opcional)</label>
            <input
              type="date"
              aria-label="Data Inicial da Tabela"
              value={tableModal.startDate}
              onChange={(e) => setTableModal((prev) => ({ ...prev, startDate: e.target.value }))}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Data Final da Tabela (opcional)</label>
            <input
              type="date"
              aria-label="Data Final da Tabela"
              value={tableModal.endDate}
              onChange={(e) => setTableModal((prev) => ({ ...prev, endDate: e.target.value }))}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={tableModal.published}
            onChange={(e) => setTableModal((prev) => ({ ...prev, published: e.target.checked }))}
            className="rounded border-slate-300 text-slate-900"
          />
          <span>Publicar imediatamente no Boletim Público do Aluno</span>
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-700">Observações da Tabela (opcional)</label>
          <textarea
            rows={2}
            value={tableModal.notes}
            onChange={(e) => setTableModal((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Critérios ou observações gerais sobre esta etapa..."
            className="p-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
          />
        </div>
      </PageDialog>

      {/* Modal: Create / Edit Grade Item (Assessment Column) */}
      <PageDialog
        open={itemModal.open}
        title={itemModal.existing ? 'Editar Avaliação' : 'Nova Coluna de Avaliação'}
        onClose={() => setItemModal((prev) => ({ ...prev, open: false, error: undefined }))}
        onSave={() => void handleSaveItem()}
        saveText="Salvar Avaliação"
      >
        {itemModal.error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {itemModal.error}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-700">Título da Avaliação</label>
          <input
            type="text"
            value={itemModal.name}
            onChange={(e) => setItemModal((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ex.: Prova Teórica 1, Laboratório de Redes, Projeto Final..."
            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-700">
            Tipo / Categoria da Nota (texto livre)
          </label>
          <input
            type="text"
            value={itemModal.category}
            onChange={(e) => setItemModal((prev) => ({ ...prev, category: e.target.value }))}
            placeholder="Digite qualquer categoria (ex.: Prova, Atividade Prática, Seminário...)"
            className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
          />
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-slate-400">Sugestões rápidas:</span>
            {DEFAULT_CATEGORY_SUGGESTIONS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setItemModal((prev) => ({ ...prev, category: cat }))}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                  itemModal.category === cat
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Valor Máximo</label>
            <input
              type="text"
              inputMode="decimal"
              value={itemModal.maxScore}
              onChange={(e) => setItemModal((prev) => ({ ...prev, maxScore: e.target.value }))}
              placeholder="10"
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Peso</label>
            <input
              type="text"
              inputMode="decimal"
              value={itemModal.weight}
              onChange={(e) => setItemModal((prev) => ({ ...prev, weight: e.target.value }))}
              placeholder="1"
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">Data (opcional)</label>
            <input
              type="date"
              value={itemModal.evaluationDate}
              onChange={(e) => setItemModal((prev) => ({ ...prev, evaluationDate: e.target.value }))}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-900"
            />
          </div>
        </div>
      </PageDialog>

      {/* Modal: Organize Tables and Assessment Columns */}
      <PageDialog
        open={organizeModal.open}
        title="Organizar Tabelas e Colunas de Avaliação"
        onClose={() => setOrganizeModal((prev) => ({ ...prev, open: false }))}
        onSave={() => void handleSaveOrganization()}
        saveText="Salvar Organização"
      >
        <div className="space-y-4">
          {organizeModal.tables.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Ordem das Tabelas da Turma ({organizeModal.tables.length})
              </label>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                {organizeModal.tables.map((t, idx) => {
                  const period = formatTablePeriod(t.start_date, t.end_date);
                  return (
                    <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-900">
                          {idx + 1}. {text(t, 'name')}
                        </span>
                        {period && <span className="text-[11px] text-slate-400 ml-2">({period})</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() =>
                            setOrganizeModal((prev) => ({
                              ...prev,
                              tables: moveArrayItem(prev.tables, idx, idx - 1),
                            }))
                          }
                          title="Mover tabela para cima"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === organizeModal.tables.length - 1}
                          onClick={() =>
                            setOrganizeModal((prev) => ({
                              ...prev,
                              tables: moveArrayItem(prev.tables, idx, idx + 1),
                            }))
                          }
                          title="Mover tabela para baixo"
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentTable && organizeModal.items.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Ordem das Colunas em &ldquo;{text(currentTable, 'name')}&rdquo; ({organizeModal.items.length})
              </label>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                {organizeModal.items.map((item, idx) => (
                  <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {idx + 1}. {text(item, 'name')}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        {text(item, 'category')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() =>
                          setOrganizeModal((prev) => ({
                            ...prev,
                            items: moveArrayItem(prev.items, idx, idx - 1),
                          }))
                        }
                        title="Mover coluna para cima"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === organizeModal.items.length - 1}
                        onClick={() =>
                          setOrganizeModal((prev) => ({
                            ...prev,
                            items: moveArrayItem(prev.items, idx, idx + 1),
                          }))
                        }
                        title="Mover coluna para baixo"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageDialog>

      {/* Modal: Student Assessment Remark / Feedback */}
      <PageDialog
        open={remarkModal.open}
        title={`Feedback — ${remarkModal.studentName}`}
        onClose={() => setRemarkModal((prev) => ({ ...prev, open: false }))}
        onSave={() => {
          setDraftCells((prev) => ({
            ...prev,
            [remarkModal.cellKey]: {
              scoreText: prev[remarkModal.cellKey]?.scoreText ?? '',
              remarks: remarkModal.remarks,
            },
          }));
          setDirty(true);
          setRemarkModal((prev) => ({ ...prev, open: false }));
        }}
        saveText="Aplicar Observação"
      >
        <p className="text-xs text-slate-500">
          Avaliação: <strong className="text-slate-800">{remarkModal.itemName}</strong>. Esta observação ficará visível no boletim do aluno.
        </p>
        <textarea
          rows={3}
          value={remarkModal.remarks}
          onChange={(e) => setRemarkModal((prev) => ({ ...prev, remarks: e.target.value }))}
          placeholder="Ex.: Excelente domínio prático; entregou atividade extra..."
          className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-900"
        />
      </PageDialog>

      {/* Modal: Student Individual Boletim */}
      {selectedStudentForBoletim && studentBoletimData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-xl relative text-left">
            <button
              type="button"
              onClick={() => setSelectedStudentForBoletim(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-lg cursor-pointer"
              aria-label="Fechar"
            >
              ✕
            </button>
            <StudentReportCardView data={studentBoletimData} />
          </div>
        </div>
      )}
    </div>
  );
}
