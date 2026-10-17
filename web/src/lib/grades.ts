import type { LocalRecord } from '../types';

export type CalculationMode = 'simple' | 'weighted' | 'sum';
export type GradeStatus = 'aprovado' | 'recuperacao' | 'reprovado' | 'em_andamento' | 'sem_notas';

export interface EvaluatedItemScore {
  itemId: string;
  itemName: string;
  category: string;
  evaluationDate: string | null;
  maxScore: number;
  weight: number;
  score: number | null;
  normalizedScore: number | null;
  remarks: string | null;
  recordId?: string;
  syncVersion?: number;
}

export interface StudentTableGradeResult {
  tableId: string;
  tableName: string;
  calculationMode: CalculationMode;
  passingGrade: number;
  published: boolean;
  average: number | null;
  totalItems: number;
  evaluatedCount: number;
  pendingCount: number;
  status: GradeStatus;
  statusLabel: string;
  items: EvaluatedItemScore[];
}

export interface StudentClassGradeSummary {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  tableResults: StudentTableGradeResult[];
  overallAverage: number | null;
  passingGrade: number;
  overallStatus: GradeStatus;
  overallStatusLabel: string;
  totalAssessments: number;
  evaluatedAssessments: number;
}

export interface CategoryGradeMetric {
  category: string;
  itemCount: number;
  evaluatedEntries: number;
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
}

export const DEFAULT_CATEGORY_SUGGESTIONS = [
  'Prova',
  'Atividade Prática',
  'Trabalho / Projeto',
  'Participação',
  'Exercício em Laboratório',
  'Recuperação',
] as const;

export function roundGrade(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function calculationModeLabel(mode: string): string {
  if (mode === 'weighted') return 'Média Ponderada';
  if (mode === 'sum') return 'Soma de Pontos';
  return 'Média Simples';
}

export function gradeStatusLabel(status: GradeStatus): string {
  switch (status) {
    case 'aprovado':
      return 'Aprovado';
    case 'recuperacao':
      return 'Em Recuperação';
    case 'reprovado':
      return 'Reprovado';
    case 'em_andamento':
      return 'Em andamento';
    default:
      return 'Sem notas';
  }
}

export function normalizeScoreToTen(score: number | null | undefined, maxScore = 10): number | null {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const max = Number(maxScore) > 0 ? Number(maxScore) : 10;
  return roundGrade((Number(score) / max) * 10);
}

export function classifyTableStatus(
  average: number | null,
  passingGrade: number,
  calculationMode: CalculationMode,
  totalItems: number,
  evaluatedCount: number,
): GradeStatus {
  if (totalItems === 0 || evaluatedCount === 0 || average === null) {
    return totalItems > 0 ? 'em_andamento' : 'sem_notas';
  }
  const pass = Number(passingGrade || 6.0);
  const recoveryFloor = Math.max(4.0, pass - 2.0);

  if (evaluatedCount < totalItems) {
    if (calculationMode === 'sum' && average >= pass) return 'aprovado';
    return 'em_andamento';
  }

  if (average >= pass) return 'aprovado';
  if (average >= recoveryFloor) return 'recuperacao';
  return 'reprovado';
}

export function computeTableAverage(
  calculationMode: CalculationMode,
  items: Array<{ score: number | null; maxScore: number; weight: number }>,
): number | null {
  const evaluated = items.filter((item) => item.score !== null && item.score !== undefined && !Number.isNaN(Number(item.score)));
  if (evaluated.length === 0) return null;

  if (calculationMode === 'sum') {
    const sum = evaluated.reduce((acc, item) => acc + Number(item.score ?? 0), 0);
    return roundGrade(Math.min(10, sum));
  }

  if (calculationMode === 'weighted') {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const item of evaluated) {
      const w = Number(item.weight) > 0 ? Number(item.weight) : 1;
      const norm = normalizeScoreToTen(item.score, item.maxScore) ?? 0;
      weightedSum += norm * w;
      totalWeight += w;
    }
    return totalWeight > 0 ? roundGrade(weightedSum / totalWeight) : null;
  }

  // simple average
  const sumNorm = evaluated.reduce((acc, item) => acc + (normalizeScoreToTen(item.score, item.maxScore) ?? 0), 0);
  return roundGrade(sumNorm / evaluated.length);
}

const activeRecord = (r: LocalRecord) => !r.deleted_at;

export function buildStudentTableResult(
  table: LocalRecord,
  tableItems: LocalRecord[],
  studentGradesMap: Map<string, LocalRecord>,
): StudentTableGradeResult {
  const calculationMode = (['simple', 'weighted', 'sum'].includes(String(table.calculation_mode))
    ? String(table.calculation_mode)
    : 'simple') as CalculationMode;
  const passingGrade = Number(table.passing_grade ?? 6.0);
  const published = table.published !== 0 && table.published !== false;

  const sortedItems = [...tableItems]
    .filter(activeRecord)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

  const items: EvaluatedItemScore[] = sortedItems.map((item) => {
    const grade = studentGradesMap.get(`${item.id}`);
    const rawScore = grade?.score !== null && grade?.score !== undefined && grade?.score !== '' ? Number(grade.score) : null;
    const score = rawScore !== null && !Number.isNaN(rawScore) ? rawScore : null;
    const maxScore = Number(item.max_score ?? 10) || 10;
    const weight = Number(item.weight ?? 1) || 1;
    const normalizedScore = normalizeScoreToTen(score, maxScore);
    return {
      itemId: item.id,
      itemName: String(item.name ?? ''),
      category: String(item.category ?? 'Avaliação').trim() || 'Avaliação',
      evaluationDate: item.evaluation_date ? String(item.evaluation_date) : null,
      maxScore,
      weight,
      score,
      normalizedScore,
      remarks: grade?.remarks ? String(grade.remarks) : null,
      recordId: grade?.id,
      syncVersion: grade?.sync_version !== undefined ? Number(grade.sync_version) : undefined,
    };
  });

  const evaluatedCount = items.filter((i) => i.score !== null).length;
  const average = computeTableAverage(calculationMode, items);
  const status = classifyTableStatus(average, passingGrade, calculationMode, items.length, evaluatedCount);

  return {
    tableId: table.id,
    tableName: String(table.name ?? ''),
    calculationMode,
    passingGrade,
    published,
    average,
    totalItems: items.length,
    evaluatedCount,
    pendingCount: items.length - evaluatedCount,
    status,
    statusLabel: gradeStatusLabel(status),
    items,
  };
}

export function buildClassGradeSummary(input: {
  classId: string;
  tables: LocalRecord[];
  items: LocalRecord[];
  studentGrades: LocalRecord[];
  students: Array<{ id: string; name: string; registrationNumber: string }>;
  publishedOnly?: boolean;
}) {
  const classTables = input.tables
    .filter((t) => activeRecord(t) && String(t.class_id) === input.classId && (!input.publishedOnly || (t.published !== 0 && t.published !== false)))
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

  const itemsByTable = new Map<string, LocalRecord[]>();
  for (const item of input.items) {
    if (!activeRecord(item) || String(item.class_id) !== input.classId) continue;
    const tid = String(item.grade_table_id);
    const list = itemsByTable.get(tid) ?? [];
    list.push(item);
    itemsByTable.set(tid, list);
  }

  // Map studentId -> Map<itemId, LocalRecord>
  const gradesByStudent = new Map<string, Map<string, LocalRecord>>();
  for (const g of input.studentGrades) {
    if (!activeRecord(g) || String(g.class_id) !== input.classId) continue;
    const sid = String(g.student_id);
    const iid = String(g.grade_item_id);
    let map = gradesByStudent.get(sid);
    if (!map) {
      map = new Map();
      gradesByStudent.set(sid, map);
    }
    const existing = map.get(iid);
    if (!existing || String(g.updated_at ?? '') >= String(existing.updated_at ?? '')) {
      map.set(iid, g);
    }
  }

  const studentSummaries: StudentClassGradeSummary[] = input.students.map((student) => {
    const sMap = gradesByStudent.get(student.id) ?? new Map<string, LocalRecord>();
    const tableResults = classTables.map((table) =>
      buildStudentTableResult(table, itemsByTable.get(table.id) ?? [], sMap),
    );
    const tablesWithAvg = tableResults.filter((t) => t.average !== null);
    const overallAverage = tablesWithAvg.length > 0
      ? roundGrade(tablesWithAvg.reduce((acc, t) => acc + (t.average ?? 0), 0) / tablesWithAvg.length)
      : null;
    const avgPassing = classTables.length > 0
      ? roundGrade(classTables.reduce((acc, t) => acc + Number(t.passing_grade ?? 6.0), 0) / classTables.length)
      : 6.0;

    let overallStatus: GradeStatus = 'sem_notas';
    if (tableResults.length > 0 && overallAverage !== null) {
      const allCompleted = tableResults.every((t) => t.totalItems > 0 && t.evaluatedCount === t.totalItems);
      if (!allCompleted) {
        overallStatus = 'em_andamento';
      } else if (overallAverage >= avgPassing) {
        overallStatus = 'aprovado';
      } else if (overallAverage >= Math.max(4.0, avgPassing - 2.0)) {
        overallStatus = 'recuperacao';
      } else {
        overallStatus = 'reprovado';
      }
    } else if (tableResults.some((t) => t.totalItems > 0)) {
      overallStatus = 'em_andamento';
    }

    return {
      studentId: student.id,
      studentName: student.name,
      registrationNumber: student.registrationNumber,
      tableResults,
      overallAverage,
      passingGrade: avgPassing,
      overallStatus,
      overallStatusLabel: gradeStatusLabel(overallStatus),
      totalAssessments: tableResults.reduce((acc, t) => acc + t.totalItems, 0),
      evaluatedAssessments: tableResults.reduce((acc, t) => acc + t.evaluatedCount, 0),
    };
  });

  // Category breakdown across class
  const categoryStats = new Map<string, { itemIds: Set<string>; scores: number[] }>();
  for (const t of classTables) {
    for (const item of itemsByTable.get(t.id) ?? []) {
      const cat = String(item.category ?? 'Avaliação').trim() || 'Avaliação';
      const entry = categoryStats.get(cat) ?? { itemIds: new Set<string>(), scores: [] };
      entry.itemIds.add(item.id);
      categoryStats.set(cat, entry);
    }
  }
  for (const s of studentSummaries) {
    for (const tr of s.tableResults) {
      for (const item of tr.items) {
        if (item.normalizedScore !== null) {
          const entry = categoryStats.get(item.category);
          if (entry) entry.scores.push(item.normalizedScore);
        }
      }
    }
  }

  const categoryBreakdown: CategoryGradeMetric[] = Array.from(categoryStats.entries())
    .map(([category, data]) => ({
      category,
      itemCount: data.itemIds.size,
      evaluatedEntries: data.scores.length,
      averageScore: data.scores.length > 0
        ? roundGrade(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : null,
      minScore: data.scores.length > 0 ? roundGrade(Math.min(...data.scores)) : null,
      maxScore: data.scores.length > 0 ? roundGrade(Math.max(...data.scores)) : null,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const studentsWithAvg = studentSummaries.filter((s) => s.overallAverage !== null);
  const classAverage = studentsWithAvg.length > 0
    ? roundGrade(studentsWithAvg.reduce((acc, s) => acc + (s.overallAverage ?? 0), 0) / studentsWithAvg.length)
    : null;

  return {
    tables: classTables,
    studentSummaries,
    categoryBreakdown,
    classAverage,
    approvedCount: studentSummaries.filter((s) => s.overallStatus === 'aprovado').length,
    recoveryCount: studentSummaries.filter((s) => s.overallStatus === 'recuperacao').length,
    failedCount: studentSummaries.filter((s) => s.overallStatus === 'reprovado').length,
    inProgressCount: studentSummaries.filter((s) => s.overallStatus === 'em_andamento').length,
  };
}
