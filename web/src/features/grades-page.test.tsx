import { describe, expect, it, vi } from 'vitest';
import {
  moveArrayItem,
  parseScoreText,
  reorderGradeItems,
  reorderGradeTables,
  saveGradeItem,
  saveGradeTable,
  saveStudentGradesBatch,
  validateGradeItemInput,
  validateGradeTableInput,
} from './grades-model';

describe('grades-model', () => {
  it('validates grade table and item inputs including start and end dates', () => {
    expect(
      validateGradeTableInput({
        classId: '',
        name: 'Bimestre 1',
        calculationMode: 'simple',
        passingGrade: 6,
        published: true,
      }),
    ).toBe('Selecione uma turma válida.');

    expect(
      validateGradeTableInput({
        classId: 'c1',
        name: '1º Bimestre',
        calculationMode: 'weighted',
        passingGrade: 6.5,
        published: true,
        startDate: '2026-08-20',
        endDate: '2026-08-10',
      }),
    ).toBe('A data final da tabela não pode ser anterior à data inicial.');

    expect(
      validateGradeTableInput({
        classId: 'c1',
        name: '1º Bimestre',
        calculationMode: 'weighted',
        passingGrade: 6.5,
        published: true,
        startDate: '2026-08-01',
        endDate: '2026-09-30',
      }),
    ).toBeUndefined();

    expect(
      validateGradeItemInput({
        classId: 'c1',
        gradeTableId: 't1',
        name: 'Prova Prática 1',
        category: 'Atividade Prática',
        maxScore: 10,
        weight: 2,
      }),
    ).toBeUndefined();
  });

  it('parses decimal scores with comma or dot and handles empty cells as null', () => {
    expect(parseScoreText('')).toBeNull();
    expect(parseScoreText('   ')).toBeNull();
    expect(parseScoreText('8,5')).toBe(8.5);
    expect(parseScoreText('9.25')).toBe(9.25);
    expect(parseScoreText('0')).toBe(0);
    expect(parseScoreText('abc')).toBe('INVALID');
  });

  it('saves grade tables with dates, items, and batches of student grades', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const mutateBatch = vi.fn().mockResolvedValue(undefined);
    const sync = vi.fn().mockResolvedValue(undefined);

    const tableId = await saveGradeTable({ mutate }, sync, 'prof-1', {
      id: 'table-1',
      classId: 'class-1',
      name: 'Módulo 1',
      calculationMode: 'weighted',
      passingGrade: 6,
      published: true,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(tableId).toBe('table-1');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[1]?.start_date).toBe('2026-08-01');
    expect(mutate.mock.calls[0]?.[1]?.end_date).toBe('2026-08-31');

    const itemId = await saveGradeItem({ mutate }, sync, 'prof-1', {
      id: 'item-1',
      classId: 'class-1',
      gradeTableId: 'table-1',
      name: 'Prova 1',
      category: 'Prova',
      maxScore: 10,
      weight: 2,
    });
    expect(itemId).toBe('item-1');

    const count = await saveStudentGradesBatch({ mutateBatch }, sync, 'prof-1', 'class-1', 'table-1', [
      {
        studentId: 'student-1',
        gradeItemId: 'item-1',
        scoreText: '8,5',
        remarks: 'Muito bom',
        maxScore: 10,
      },
      {
        studentId: 'student-2',
        gradeItemId: 'item-1',
        scoreText: '',
        remarks: '',
        maxScore: 10,
      },
    ]);

    expect(count).toBe(1);
    expect(mutateBatch).toHaveBeenCalledTimes(1);
    expect(mutateBatch.mock.calls[0]?.[0]?.[0]?.data.score).toBe(8.5);
    expect(mutateBatch.mock.calls[0]?.[0]?.[0]?.data.remarks).toBe('Muito bom');
  });

  it('reorders grade tables and grade items updating sort_order', async () => {
    const mutateBatch = vi.fn().mockResolvedValue(undefined);
    const sync = vi.fn().mockResolvedValue(undefined);

    const tables = [
      { id: 't1', name: 'Tabela 1', sort_order: 1 },
      { id: 't2', name: 'Tabela 2', sort_order: 2 },
    ];
    const movedTables = moveArrayItem(tables, 1, 0);
    expect(movedTables.map((t) => t.id)).toEqual(['t2', 't1']);

    await reorderGradeTables({ mutateBatch }, sync, movedTables);
    expect(mutateBatch).toHaveBeenCalledTimes(1);
    expect(mutateBatch.mock.calls[0]?.[0]).toEqual([
      { entity: 'grade_tables', action: 'upsert', data: { id: 't2', name: 'Tabela 2', sort_order: 1 } },
      { entity: 'grade_tables', action: 'upsert', data: { id: 't1', name: 'Tabela 1', sort_order: 2 } },
    ]);

    const items = [
      { id: 'i1', name: 'Prova 1', sort_order: 1 },
      { id: 'i2', name: 'Prática 1', sort_order: 2 },
    ];
    const movedItems = moveArrayItem(items, 0, 1);
    await reorderGradeItems({ mutateBatch }, sync, movedItems);
    expect(mutateBatch).toHaveBeenCalledTimes(2);
    expect(mutateBatch.mock.calls[1]?.[0]).toEqual([
      { entity: 'grade_items', action: 'upsert', data: { id: 'i2', name: 'Prática 1', sort_order: 1 } },
      { entity: 'grade_items', action: 'upsert', data: { id: 'i1', name: 'Prova 1', sort_order: 2 } },
    ]);
  });
});
