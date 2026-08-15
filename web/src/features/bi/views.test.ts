import { describe, expect, it } from 'vitest';
import type { BiDataset } from './model';
import { buildBiView, type BiViewKey } from './views';

const dataset = {
  filters: { from: '2026-08-01', to: '2026-08-31' },
  analytics: { present: 1, absent: 1, justified: 0, delayed: 0, replacements: 0, records: 2, attendanceRate: 50, distinctCalls: 1, activeStudents: 2, riskStudents: 1, evolution: [{ date: '2026-08-01', rate: 50, records: 2 }], byClass: [], topAbsentees: [], teacherWorkload: [] },
  attendance: [], classes: [], courses: [], calls: 1,
  classRows: [{ id: 'c1', name: 'Turma A', courseName: 'Curso', shift: 'manha', activeStudents: 2, calls: 1, rate: 50, present: 1, absent: 1, justified: 0, delayed: 0, replacements: 0, records: 2 }],
  courseRows: [{ id: 'course', name: 'Curso', classes: 1, activeStudents: 2, calls: 1, rate: 50, present: 1, absent: 1, justified: 0, delayed: 0, replacements: 0, records: 2 }],
  riskRows: [{ studentId: 's1', name: 'Ana', registrationNumber: '001', className: 'Turma A', absences: 1, consecutiveAbsences: 1, records: 2, rate: 50, reasons: ['Frequência abaixo de 75%'] }],
  replacementRows: [], teacherRows: [], laboratoryRows: [], qualityIssues: [],
  replacementSummary: { notScheduled: 0, pending: 0, overdue: 0, completed: 0, completionRate: 0 },
  limitations: ['Regra de frequência.', 'Sem calendário.', 'Colisões potenciais.'],
} satisfies BiDataset;

describe('buildBiView', () => {
  it('creates all eight independent views from the same dataset', () => {
    const keys: BiViewKey[] = ['institutional', 'attendance', 'risk', 'replacements', 'courses', 'teachers', 'laboratories', 'quality'];
    const views = keys.map((key) => buildBiView(key, dataset));

    expect(views.map((view) => view.key)).toEqual(keys);
    expect(views.every((view) => view.title.startsWith('B.I'))).toBe(true);
    expect(buildBiView('attendance', dataset).rows[0]).toContain('50,0%');
    expect(buildBiView('risk', dataset).payload).toMatchObject({ students: dataset.riskRows });
  });
});
