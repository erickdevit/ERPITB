// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentReportCardView } from './student-report-card-view';
import { ClassBoletimView } from './class-boletim-view';
import { ClassBatchBoletimPrintView } from './class-batch-boletim-view';
import { StudentBoletimSpreadsheetView } from './student-boletim-spreadsheet-view';
import { ReportResult } from './report-result';
import type { UnifiedBoletimData, ClassBoletimData } from '../../lib/boletim';
import * as boletimPdf from '../../lib/boletim-pdf';
import * as exportsLib from '../../lib/exports';
import * as printHelper from '../../lib/print-helper';
import type { ReportView } from './model';

const mockStudentBoletim: UnifiedBoletimData = {
  student: {
    id: 'student-100',
    name: 'Ana Júlia de Souza',
    registrationNumber: 'MAT-2026-999',
    courseName: 'Engenharia de Software',
    courseId: 'course-eng',
    classNames: ['Turma 2026-A'],
  },
  issueDate: '2026-10-25T14:30:00Z',
  modules: [
    {
      moduleId: 'mod-1',
      moduleName: 'Módulo 1: Arquitetura Web',
      className: 'Turma 2026-A',
      classesHeld: 30,
      presences: 29,
      absences: 1,
      justified: 0,
      attendanceRate: 96.7,
      grades: [
        { name: 'Avaliação 1', score: 9.5, maxScore: 10, weight: 1 },
      ],
      finalGrade: 9.5,
      academicStatus: 'Aprovado',
    },
  ],
  overallAttendanceRate: 96.7,
  overallGpa: 9.5,
  overallAcademicStatus: 'Aprovado',
  criteria: {
    minAttendanceRate: 75.0,
    minPassingGrade: 7.0,
  },
};

const mockClassBoletim: ClassBoletimData = {
  classId: 'class-eng-1',
  className: 'Turma 2026-A',
  courseName: 'Engenharia de Software',
  totalStudents: 1,
  classAverage: 9.5,
  approvedCount: 1,
  issueDate: '2026-10-25T14:30:00Z',
  tables: [
    {
      id: 'tab-1',
      name: 'Módulo 1: Arquitetura Web',
      calculationMode: 'simple',
      calculationModeLabel: 'Média Simples',
      passingGrade: 7.0,
    },
  ],
  students: [
    {
      studentId: 'student-100',
      studentName: 'Ana Júlia de Souza',
      registrationNumber: 'MAT-2026-999',
      overallAverage: 9.5,
      overallStatus: 'aprovado',
      overallStatusLabel: 'Aprovado',
      attendanceRate: 96.7,
      attendanceRateLabel: '96.7%',
      tableResults: [
        {
          tableId: 'tab-1',
          average: 9.5,
          evaluatedCount: 1,
          totalItems: 1,
          status: 'aprovado',
          statusLabel: 'Aprovado',
        },
      ],
    },
  ],
};

describe('Dynamic Branding and PDF-Based Printing Parity Across All Reports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.print = vi.fn();
  });

  it('1. StudentReportCardView: renders custom institution branding and delegates print to printBoletimPdf', async () => {
    const printSpy = vi.spyOn(boletimPdf, 'printBoletimPdf').mockResolvedValue(undefined);

    const { container } = render(
      <StudentReportCardView
        data={mockStudentBoletim}
        institutionName="Colégio Inovação Tecnológica"
        logoUrl="/custom-school-logo.svg"
        watermarkText="Colégio Inovação - Documento Oficial"
        watermarkLogoUrl="/custom-school-logo.svg"
      />,
    );

    // Verify institutional name in header and footer
    expect(screen.getAllByText('Colégio Inovação Tecnológica').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Colégio Inovação Tecnológica — Relatório Acadêmico/i)).toBeDefined();

    // Verify logo
    const logoImg = screen.getByTestId('print-logo-left');
    expect(logoImg.getAttribute('src')).toBe('/custom-school-logo.svg');

    // Verify watermark image
    const watermarkImg = container.querySelector('.watermark-image');
    expect(watermarkImg?.getAttribute('src')).toBe('/custom-school-logo.svg');

    // Clicking "Imprimir" must call printBoletimPdf with dynamic options
    const printButton = screen.getByRole('button', { name: /imprimir/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    const callArgs = printSpy.mock.calls[0]!;
    expect(callArgs[0]).toEqual(mockStudentBoletim);
    expect(callArgs[1]?.institutionName).toBe('Colégio Inovação Tecnológica');
    expect(callArgs[1]?.watermarkText).toBe('Colégio Inovação - Documento Oficial');
  });

  it('2. ClassBoletimView: renders custom branding and delegates print to printClassBoletimPdf', async () => {
    const printClassSpy = vi.spyOn(boletimPdf, 'printClassBoletimPdf').mockResolvedValue(undefined);

    render(
      <ClassBoletimView
        data={mockClassBoletim}
        institutionName="Instituto Alpha de Educação"
        logoUrl="/alpha-logo.svg"
        watermarkText="Instituto Alpha - Oficial"
      />,
    );

    // Verify header branding
    expect(screen.getAllByText('Instituto Alpha de Educação').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Instituto Alpha - Oficial')).toBeDefined();

    // Clicking "Imprimir" calls printClassBoletimPdf
    const printButton = screen.getByRole('button', { name: /imprimir/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(printClassSpy).toHaveBeenCalledTimes(1);
    });

    const callArgs = printClassSpy.mock.calls[0]!;
    expect(callArgs[0]).toEqual(mockClassBoletim);
    expect(callArgs[1]?.institutionName).toBe('Instituto Alpha de Educação');
    expect(callArgs[1]?.watermarkText).toBe('Instituto Alpha - Oficial');
  });

  it('3. ClassBatchBoletimPrintView: propagates custom branding and delegates print to printClassBatchBoletimPdf', async () => {
    const printBatchSpy = vi.spyOn(boletimPdf, 'printClassBatchBoletimPdf').mockResolvedValue(undefined);

    render(
      <ClassBatchBoletimPrintView
        studentsData={[mockStudentBoletim]}
        className="Turma 2026-A"
        institutionName="Escola Politécnica Sigma"
        logoUrl="/sigma-logo.svg"
        watermarkText="Escola Sigma - Uso Oficial"
      />,
    );

    expect(screen.getAllByText('Escola Politécnica Sigma').length).toBeGreaterThanOrEqual(1);

    const printButton = screen.getByRole('button', { name: /imprimir/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(printBatchSpy).toHaveBeenCalledTimes(1);
    });

    const callArgs = printBatchSpy.mock.calls[0]!;
    expect(callArgs[0]).toHaveLength(1);
    expect(callArgs[1]).toBe('Turma 2026-A');
    expect(callArgs[2]?.institutionName).toBe('Escola Politécnica Sigma');
    expect(callArgs[2]?.watermarkText).toBe('Escola Sigma - Uso Oficial');
  });

  it('4. StudentBoletimSpreadsheetView: renders custom branding and delegates print to printBoletimPdf', async () => {
    const printSpy = vi.spyOn(boletimPdf, 'printBoletimPdf').mockResolvedValue(undefined);

    render(
      <StudentBoletimSpreadsheetView
        data={mockStudentBoletim}
        institutionName="Centro Universitário Omega"
        logoUrl="/omega-logo.svg"
        watermarkText="Centro Universitário Omega - Grade Oficial"
      />,
    );

    expect(screen.getAllByText('Centro Universitário Omega').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Centro Universitário Omega - Grade Oficial')).toBeDefined();

    const printButton = screen.getByRole('button', { name: /imprimir/i });
    fireEvent.click(printButton);

    await waitFor(() => {
      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    const callArgs = printSpy.mock.calls[0]!;
    expect(callArgs[1]?.institutionName).toBe('Centro Universitário Omega');
    expect(callArgs[1]?.watermarkText).toBe('Centro Universitário Omega - Grade Oficial');
  });

  it('5. ReportResult for tabular views: renders institutional print header with dynamic appName', () => {
    const mockTabularView: ReportView = {
      type: 'institutional',
      title: 'Relatório Geral de Cursos',
      tableTitle: 'Cursos Ativos',
      description: 'Visão consolidada',
      ready: true,
      context: ['Período: 01/01/2026 a 30/06/2026'],
      headers: ['Curso', 'Alunos', 'Frequência'],
      rows: [['Informática', 45, '88%']],
      metrics: [],
      notices: [],
      matrix: false,
    };

    render(<ReportResult view={mockTabularView} />);

    expect(screen.getAllByText('Cursos Ativos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Informática')).toBeDefined();
    // Default fallback brand name
    expect(screen.getAllByText('opschool').length).toBeGreaterThanOrEqual(1);
  });

  it('6. printSimplePdf builds vector PDF and triggers printPdfBlob', async () => {
    const printBlobSpy = vi.spyOn(printHelper, 'printPdfBlob').mockResolvedValue(undefined);

    await exportsLib.printSimplePdf(
      'Demonstrativo de Faturamento',
      ['Período: Outubro/2026'],
      ['Item', 'Valor'],
      [['Mensalidade', 'R$ 500,00']],
      {
        institutionName: 'Escola Modelo',
        watermarkText: 'Escola Modelo - Confidencial',
      },
    );

    expect(printBlobSpy).toHaveBeenCalledTimes(1);
    expect(printBlobSpy.mock.calls[0]![1]).toBe('Demonstrativo de Faturamento');
  });
});
