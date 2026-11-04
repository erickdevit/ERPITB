import { describe, expect, it } from 'vitest';
import {
  buildClassGradeSummary,
  computeTableAverage,
  formatGrade,
  normalizeScoreToTen,
} from './grades';

describe('grades calculation engine', () => {
  it('computes simple, weighted, and sum averages accurately', () => {
    const items = [
      { score: 8, maxScore: 10, weight: 2 },
      { score: 5, maxScore: 10, weight: 1 },
      { score: null, maxScore: 10, weight: 1 }, // pending item does not pull partial average down
    ];

    expect(computeTableAverage('simple', items)).toBe(6.5);
    expect(computeTableAverage('weighted', items)).toBe(7.0); // (8*2 + 5*1) / 3 = 21/3 = 7.0
    expect(computeTableAverage('sum', [
      { score: 3.5, maxScore: 4, weight: 1 },
      { score: 4.0, maxScore: 6, weight: 1 },
    ])).toBe(7.5);
  });

  it('distinguishes explicit zero (0) from pending (null)', () => {
    expect(
      computeTableAverage('simple', [
        { score: 8, maxScore: 10, weight: 1 },
        { score: null, maxScore: 10, weight: 1 },
      ]),
    ).toBe(8.0);

    expect(
      computeTableAverage('simple', [
        { score: 8, maxScore: 10, weight: 1 },
        { score: 0, maxScore: 10, weight: 1 },
      ]),
    ).toBe(4.0);
  });

  it('builds class grade summary with multiple tables and custom free-text categories', () => {
    const summary = buildClassGradeSummary({
      classId: 'c1',
      tables: [
        { id: 't1', class_id: 'c1', name: 'Módulo 1', calculation_mode: 'weighted', passing_grade: 6.0, published: 1, sort_order: 1 },
        { id: 't2', class_id: 'c1', name: 'Módulo 2', calculation_mode: 'simple', passing_grade: 6.0, published: 1, sort_order: 2 },
      ],
      items: [
        { id: 'i1', class_id: 'c1', grade_table_id: 't1', name: 'Prova Teórica', category: 'Prova', max_score: 10, weight: 2, sort_order: 1 },
        { id: 'i2', class_id: 'c1', grade_table_id: 't1', name: 'Laboratório Linux', category: 'Atividade Prática', max_score: 10, weight: 1, sort_order: 2 },
        { id: 'i3', class_id: 'c1', grade_table_id: 't2', name: 'Projeto Final', category: 'Atividade Prática', max_score: 10, weight: 1, sort_order: 1 },
      ],
      studentGrades: [
        { id: 'g1', class_id: 'c1', grade_table_id: 't1', grade_item_id: 'i1', student_id: 's1', score: 9 },
        { id: 'g2', class_id: 'c1', grade_table_id: 't1', grade_item_id: 'i2', student_id: 's1', score: 6 },
        { id: 'g3', class_id: 'c1', grade_table_id: 't2', grade_item_id: 'i3', student_id: 's1', score: 7 },
      ],
      students: [{ id: 's1', name: 'Ana Beatriz', registrationNumber: '2026001' }],
    });

    expect(summary.studentSummaries).toHaveLength(1);
    const s1 = summary.studentSummaries[0]!;
    expect(s1.tableResults[0]?.average).toBe(8.0); // (9*2 + 6*1)/3
    expect(s1.tableResults[1]?.average).toBe(7.0);
    expect(s1.overallAverage).toBe(7.5);
    expect(s1.overallStatus).toBe('aprovado');
    expect(summary.classAverage).toBe(7.5);
    expect(summary.approvedCount).toBe(1);

    const praticaCat = summary.categoryBreakdown.find((c) => c.category === 'Atividade Prática');
    expect(praticaCat?.itemCount).toBe(2);
    expect(praticaCat?.averageScore).toBe(6.5);
    expect(normalizeScoreToTen(4, 5)).toBe(8.0);
    expect(formatGrade(7.5)).toBe('7,5');
  });
});
