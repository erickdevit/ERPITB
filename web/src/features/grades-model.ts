import type { LocalMutation } from '../lib/db';
import type { CalculationMode } from '../lib/grades';
import type { LocalRecord } from '../types';

export interface GradeTableInput {
  id?: string;
  classId: string;
  name: string;
  calculationMode: CalculationMode;
  passingGrade: number;
  published: boolean;
  sortOrder?: number;
  startDate?: string;
  endDate?: string;
  notes?: string;
  existing?: LocalRecord;
}

export interface GradeItemInput {
  id?: string;
  classId: string;
  gradeTableId: string;
  name: string;
  category: string;
  evaluationDate?: string;
  maxScore: number;
  weight: number;
  sortOrder?: number;
  notes?: string;
  existing?: LocalRecord;
}

export interface StudentGradeDraftEntry {
  studentId: string;
  gradeItemId: string;
  scoreText: string;
  remarks: string;
  maxScore: number;
  existing?: LocalRecord;
}

export function validateGradeTableInput(input: GradeTableInput): string | undefined {
  if (!input.classId) return 'Selecione uma turma válida.';
  if (!input.name || input.name.trim().length < 2) return 'Informe um nome para a tabela de notas (mínimo 2 caracteres).';
  if (!['simple', 'weighted', 'sum'].includes(input.calculationMode)) return 'Modo de cálculo inválido.';
  if (Number.isNaN(input.passingGrade) || input.passingGrade < 0 || input.passingGrade > 10) {
    return 'A média mínima deve estar entre 0 e 10.';
  }
  const sd = input.startDate?.trim() ?? '';
  const ed = input.endDate?.trim() ?? '';
  if (sd && !/^\d{4}-\d{2}-\d{2}$/.test(sd)) return 'Data inicial inválida.';
  if (ed && !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return 'Data final inválida.';
  if (sd && ed && sd > ed) {
    return 'A data final da tabela não pode ser anterior à data inicial.';
  }
  return undefined;
}

export function validateGradeItemInput(input: GradeItemInput): string | undefined {
  if (!input.classId || !input.gradeTableId) return 'Selecione uma tabela de notas válida.';
  if (!input.name || input.name.trim().length < 2) return 'Informe o nome da avaliação (ex.: Prova 1, Atividade Prática).';
  if (!input.category || input.category.trim().length < 2) return 'Informe o tipo/categoria da avaliação.';
  if (Number.isNaN(input.maxScore) || input.maxScore <= 0 || input.maxScore > 100) {
    return 'O valor máximo da avaliação deve ser maior que 0 e até 100.';
  }
  if (Number.isNaN(input.weight) || input.weight <= 0 || input.weight > 100) {
    return 'O peso da avaliação deve ser maior que 0.';
  }
  return undefined;
}

export function parseScoreText(raw: string): number | null | 'INVALID' {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (Number.isNaN(num)) return 'INVALID';
  return Math.round(num * 100) / 100;
}

export async function saveGradeTable(
  store: { mutate: (entity: 'grade_tables', data: LocalRecord, action?: 'upsert' | 'delete') => Promise<void> },
  sync: () => Promise<unknown>,
  userId: string,
  input: GradeTableInput,
): Promise<string> {
  const err = validateGradeTableInput(input);
  if (err) throw new Error(err);

  const id = input.existing?.id ?? input.id ?? crypto.randomUUID();
  const startDate =
    input.startDate !== undefined
      ? input.startDate.trim() || null
      : (input.existing?.start_date ? String(input.existing.start_date) : null);
  const endDate =
    input.endDate !== undefined
      ? input.endDate.trim() || null
      : (input.existing?.end_date ? String(input.existing.end_date) : null);

  await store.mutate('grade_tables', {
    ...input.existing,
    id,
    class_id: input.classId,
    name: input.name.trim(),
    calculation_mode: input.calculationMode,
    passing_grade: Number(input.passingGrade),
    published: input.published ? 1 : 0,
    sort_order: Number(input.sortOrder ?? input.existing?.sort_order ?? 0),
    start_date: startDate,
    end_date: endDate,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    created_by_user_id: String(input.existing?.created_by_user_id ?? userId),
  });
  await sync();
  return id;
}

export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved !== undefined) {
    next.splice(toIndex, 0, moved);
  }
  return next;
}

export async function reorderGradeTables(
  store: { mutateBatch: (mutations: LocalMutation[]) => Promise<void> },
  sync: () => Promise<unknown>,
  orderedTables: LocalRecord[],
): Promise<void> {
  const mutations: LocalMutation[] = [];
  orderedTables.forEach((table, idx) => {
    const nextOrder = idx + 1;
    if (Number(table.sort_order ?? 0) !== nextOrder) {
      mutations.push({
        entity: 'grade_tables',
        action: 'upsert',
        data: {
          ...table,
          sort_order: nextOrder,
        },
      });
    }
  });
  if (mutations.length > 0) {
    await store.mutateBatch(mutations);
    await sync();
  }
}

export async function reorderGradeItems(
  store: { mutateBatch: (mutations: LocalMutation[]) => Promise<void> },
  sync: () => Promise<unknown>,
  orderedItems: LocalRecord[],
): Promise<void> {
  const mutations: LocalMutation[] = [];
  orderedItems.forEach((item, idx) => {
    const nextOrder = idx + 1;
    if (Number(item.sort_order ?? 0) !== nextOrder) {
      mutations.push({
        entity: 'grade_items',
        action: 'upsert',
        data: {
          ...item,
          sort_order: nextOrder,
        },
      });
    }
  });
  if (mutations.length > 0) {
    await store.mutateBatch(mutations);
    await sync();
  }
}

export async function deleteGradeTableCascade(
  store: { mutateBatch: (mutations: LocalMutation[]) => Promise<void> },
  sync: () => Promise<unknown>,
  table: LocalRecord,
  allItems: LocalRecord[],
  allGrades: LocalRecord[],
): Promise<void> {
  const mutations: LocalMutation[] = [];
  const tableGrades = allGrades.filter((g) => !g.deleted_at && g.grade_table_id === table.id);
  const tableItems = allItems.filter((i) => !i.deleted_at && i.grade_table_id === table.id);

  for (const g of tableGrades) {
    mutations.push({ entity: 'student_grades', data: g, action: 'delete' });
  }
  for (const i of tableItems) {
    mutations.push({ entity: 'grade_items', data: i, action: 'delete' });
  }
  mutations.push({ entity: 'grade_tables', data: table, action: 'delete' });

  await store.mutateBatch(mutations);
  await sync();
}

export async function saveGradeItem(
  store: { mutate: (entity: 'grade_items', data: LocalRecord, action?: 'upsert' | 'delete') => Promise<void> },
  sync: () => Promise<unknown>,
  userId: string,
  input: GradeItemInput,
): Promise<string> {
  const err = validateGradeItemInput(input);
  if (err) throw new Error(err);

  const id = input.existing?.id ?? input.id ?? crypto.randomUUID();
  await store.mutate('grade_items', {
    ...input.existing,
    id,
    class_id: input.classId,
    grade_table_id: input.gradeTableId,
    name: input.name.trim(),
    category: input.category.trim(),
    evaluation_date: input.evaluationDate?.trim() ? input.evaluationDate.trim() : null,
    max_score: Number(input.maxScore),
    weight: Number(input.weight),
    sort_order: Number(input.sortOrder ?? input.existing?.sort_order ?? 0),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    created_by_user_id: String(input.existing?.created_by_user_id ?? userId),
  });
  await sync();
  return id;
}

export async function deleteGradeItemCascade(
  store: { mutateBatch: (mutations: LocalMutation[]) => Promise<void> },
  sync: () => Promise<unknown>,
  item: LocalRecord,
  allGrades: LocalRecord[],
): Promise<void> {
  const mutations: LocalMutation[] = [];
  const itemGrades = allGrades.filter((g) => !g.deleted_at && g.grade_item_id === item.id);
  for (const g of itemGrades) {
    mutations.push({ entity: 'student_grades', data: g, action: 'delete' });
  }
  mutations.push({ entity: 'grade_items', data: item, action: 'delete' });
  await store.mutateBatch(mutations);
  await sync();
}

export async function saveStudentGradesBatch(
  store: { mutateBatch: (mutations: LocalMutation[]) => Promise<void> },
  sync: () => Promise<unknown>,
  userId: string,
  classId: string,
  gradeTableId: string,
  entries: StudentGradeDraftEntry[],
): Promise<number> {
  const mutations: LocalMutation[] = [];

  for (const entry of entries) {
    const parsedScore = parseScoreText(entry.scoreText);
    if (parsedScore === 'INVALID') {
      throw new Error('Existe uma nota com formato numérico inválido.');
    }
    if (parsedScore !== null && (parsedScore < 0 || parsedScore > entry.maxScore)) {
      throw new Error(`As notas devem estar entre 0 e o valor máximo da avaliação (${entry.maxScore}).`);
    }

    const cleanRemarks = entry.remarks.trim() ? entry.remarks.trim() : null;
    const prevScore =
      entry.existing?.score !== undefined && entry.existing?.score !== null && entry.existing?.score !== ''
        ? Number(entry.existing.score)
        : null;
    const prevRemarks = entry.existing?.remarks ? String(entry.existing.remarks) : null;

    if (!entry.existing && parsedScore === null && cleanRemarks === null) {
      continue;
    }
    if (entry.existing && prevScore === parsedScore && prevRemarks === cleanRemarks) {
      continue;
    }

    mutations.push({
      entity: 'student_grades',
      action: 'upsert',
      data: {
        ...entry.existing,
        id: entry.existing?.id ?? crypto.randomUUID(),
        class_id: classId,
        grade_table_id: gradeTableId,
        grade_item_id: entry.gradeItemId,
        student_id: entry.studentId,
        score: parsedScore,
        remarks: cleanRemarks,
        recorded_by_user_id: userId,
      },
    });
  }

  if (mutations.length > 0) {
    await store.mutateBatch(mutations);
    await sync();
  }
  return mutations.length;
}
