// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  StudentReportCardView,
  AcademicStatusBadge,
} from './student-report-card-view';
import type { UnifiedBoletimData } from '../../lib/boletim';

describe('StudentReportCardView Component', () => {
  const mockData: UnifiedBoletimData = {
    student: {
      id: 'std-42',
      name: 'Mariana Lima Santos',
      registrationNumber: 'ITB-2026-9081',
      courseName: 'Desenvolvimento Web Full Stack',
      courseId: 'crs-1',
      classNames: ['Turma Alpha (Manhã)', 'Turma Beta (Tarde)'],
    },
    issueDate: '2026-10-22T14:30:00Z',
    modules: [
      {
        moduleId: 'mod-1',
        moduleName: 'Módulo 1: Frontend React',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 40,
        presences: 36,
        absences: 4,
        justified: 0,
        attendanceRate: 90.0,
        grades: [
          { name: 'P1', score: 8.5, maxScore: 10, weight: 1 },
          { name: 'Projeto', score: 9.5, maxScore: 10, weight: 1 },
        ],
        finalGrade: 9.0,
        academicStatus: 'Aprovado',
      },
      {
        moduleId: 'mod-2',
        moduleName: 'Módulo 2: Backend Node.js',
        className: 'Turma Beta (Tarde)',
        classesHeld: 40,
        presences: 28,
        absences: 10,
        justified: 2,
        attendanceRate: 70.0,
        grades: [
          { name: 'P1', score: 7.0, maxScore: 10, weight: 1 },
        ],
        finalGrade: 7.0,
        academicStatus: 'Reprovado por Frequência',
      },
      {
        moduleId: 'mod-3',
        moduleName: 'Módulo 3: Banco de Dados',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 20,
        presences: 18,
        absences: 2,
        justified: 0,
        attendanceRate: 90.0,
        grades: [
          { name: 'Prova', score: 5.0, maxScore: 10, weight: 1 },
        ],
        finalGrade: 5.0,
        academicStatus: 'Reprovado por Nota',
      },
      {
        moduleId: 'mod-4',
        moduleName: 'Módulo 4: DevOps e Cloud',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 20,
        presences: 12,
        absences: 8,
        justified: 0,
        attendanceRate: 60.0,
        grades: [
          { name: 'Prática', score: 4.5, maxScore: 10, weight: 1 },
        ],
        finalGrade: 4.5,
        academicStatus: 'Reprovado por Nota e Frequência',
      },
      {
        moduleId: 'mod-5',
        moduleName: 'Módulo 5: Mobile React Native',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 30,
        presences: 28,
        absences: 2,
        justified: 0,
        attendanceRate: 93.3,
        grades: [
          { name: 'Atividade 1', score: 8.0, maxScore: 10, weight: 1 },
          { name: 'Atividade 2', score: null, maxScore: 10, weight: 1 },
        ],
        finalGrade: 8.0,
        academicStatus: 'Em Andamento',
      },
      {
        moduleId: 'mod-6',
        moduleName: 'Módulo 6: Orientação de Carreira',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 10,
        presences: 10,
        absences: 0,
        justified: 0,
        attendanceRate: 100.0,
        grades: [],
        finalGrade: null,
        academicStatus: 'Sem Notas',
      },
    ],
    overallAttendanceRate: 81.3,
    overallGpa: 6.7,
    overallAcademicStatus: 'Em Andamento',
    criteria: {
      minAttendanceRate: 75.0,
      minPassingGrade: 6.0,
    },
  };

  it('renders institutional ITB header and document titles', () => {
    render(<StudentReportCardView data={mockData} />);

    expect(screen.getAllByText(/Instituto Transforma Brasil/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('BOLETIM ESCOLAR INDIVIDUAL')).toBeDefined();
    expect(
      screen.getByText('Sistema de Controle de Frequência e Desempenho Acadêmico')
    ).toBeDefined();
    expect(screen.getByText(/Data de Emissão/i)).toBeDefined();
  });

  it('renders student credentials with name, registration, course and class names', () => {
    render(<StudentReportCardView data={mockData} />);

    expect(screen.getAllByText('Mariana Lima Santos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ITB-2026-9081')).toBeDefined();
    expect(screen.getByText('Desenvolvimento Web Full Stack')).toBeDefined();
    expect(screen.getByText('Turma Alpha (Manhã), Turma Beta (Tarde)')).toBeDefined();
  });

  it('renders all table headers and module data accurately', () => {
    render(<StudentReportCardView data={mockData} />);

    expect(screen.getByText('Aluno')).toBeDefined();
    expect(screen.getByText('Média Geral')).toBeDefined();
    expect(screen.getByText('Frequência')).toBeDefined();
    const situacaoTh = screen.getByText('Situação');
    expect(situacaoTh).toBeDefined();
    expect(situacaoTh.closest('th')?.classList.contains('print:hidden')).toBe(true);

    expect(screen.getAllByText('Módulo 1: Frontend React').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulo 2: Backend Node.js').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulo 3: Banco de Dados').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulo 4: DevOps e Cloud').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulo 5: Mobile React Native').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Módulo 6: Orientação de Carreira').length).toBeGreaterThan(0);
  });

  it('renders distinct academic status badges for all status types', () => {
    const { container } = render(<StudentReportCardView data={mockData} />);

    const badges = container.querySelectorAll('[data-testid="status-badge"]');
    expect(badges.length).toBeGreaterThanOrEqual(6);

    expect(screen.getAllByText('Aprovado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reprovado por Frequência').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reprovado por Nota').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reprovado por Nota e Frequência').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Em Andamento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem Notas').length).toBeGreaterThan(0);
  });

  it('renders summary footer with overall attendance, overall GPA and criteria legend', () => {
    render(<StudentReportCardView data={mockData} />);

    expect(screen.getByText('81,3%')).toBeDefined();
    expect(screen.getByText('6,7')).toBeDefined();

    expect(screen.getByText(/Critérios de Avaliação e Legenda/i)).toBeDefined();
    expect(screen.getByText(/das aulas ministradas/i)).toBeDefined();
    expect(screen.getByText(/escala de 0,0 a 10,0/i)).toBeDefined();
  });

  it('renders signatures area for ITB coordination and student guardian', () => {
    render(<StudentReportCardView data={mockData} />);

    expect(screen.getByText('Coordenação Pedagógica / Direção')).toBeDefined();
    expect(screen.getByText('Aluno(a) ou Responsável Legal')).toBeDefined();
    expect(screen.getByText('Assinatura do Aluno / Responsável')).toBeDefined();
  });

  it('triggers onPrint handler when "Imprimir" button is clicked', () => {
    const onPrintMock = vi.fn();
    render(<StudentReportCardView data={mockData} onPrint={onPrintMock} />);

    const printButton = screen.getByRole('button', { name: /Imprimir Boletim/i });
    expect(printButton).toBeDefined();

    fireEvent.click(printButton);
    expect(onPrintMock).toHaveBeenCalledTimes(1);
  });

  it('triggers onDownloadPdf handler when "Baixar PDF" button is clicked', () => {
    const onDownloadMock = vi.fn();
    render(<StudentReportCardView data={mockData} onDownloadPdf={onDownloadMock} />);

    const pdfButton = screen.getByRole('button', { name: /Baixar PDF/i });
    expect(pdfButton).toBeDefined();

    fireEvent.click(pdfButton);
    expect(onDownloadMock).toHaveBeenCalledTimes(1);
  });

  it('action bar contains print:hidden or print-hidden attribute to hide during print', () => {
    render(<StudentReportCardView data={mockData} />);

    const printHiddenElement = screen.getByTestId('print-hidden');
    expect(printHiddenElement.className).toContain('print:hidden');
  });

  it('AcademicStatusBadge renders fallback cleanly for unknown status', () => {
    // @ts-expect-error testing invalid status fallback
    render(<AcademicStatusBadge status="Desconhecido" />);
    expect(screen.getByText('Sem Notas')).toBeDefined();
  });
});
