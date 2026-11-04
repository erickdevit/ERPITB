import { describe, expect, it } from 'vitest';
import { summarizeReport } from './report';

describe('summarizeReport', () => {
  it('calcula os indicadores e mantém todos os estados de frequência', () => {
    const summary = summarizeReport([
      { id: '1', student_id: 'aluno-1', status: 'P' },
      { id: '2', student_id: 'aluno-1', status: 'F' },
      { id: '3', student_id: 'aluno-2', status: 'J' },
      { id: '4', student_id: 'aluno-3', status: 'A' },
      { id: '5', student_id: 'aluno-3', status: 'R' },
    ]);

    expect(summary).toMatchObject({ records: 5, students: 3, present: 1, absences: 1, attendanceRate: 20 });
    expect(summary.byStatus).toEqual({ P: 1, F: 1, J: 1, A: 1, R: 1 });
  });

  it('retorna indicadores vazios para um período sem marcações', () => {
    expect(summarizeReport([])).toEqual({ records: 0, students: 0, present: 0, absences: 0, attendanceRate: 0, byStatus: { P: 0, F: 0, J: 0, A: 0, R: 0 } });
  });
});
