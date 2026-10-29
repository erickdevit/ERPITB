// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StudentBoletimSpreadsheetView } from './student-boletim-spreadsheet-view';
import type { UnifiedBoletimData } from '../../lib/boletim';

describe('StudentBoletimSpreadsheetView Component', () => {
  const mockData: UnifiedBoletimData = {
    student: {
      id: 'std-100',
      name: 'Iago Marcelo Costa Viera',
      registrationNumber: 'ITB-2026-0440',
      courseName: 'Informática Básica',
      courseId: 'crs-1',
      classNames: ['Turma 101 - Informática'],
    },
    issueDate: '2026-10-27T12:00:00Z',
    modules: [
      {
        moduleId: 'mod-1',
        moduleName: 'Módulo 1: Fundamentos',
        className: 'Turma 101 - Informática',
        classesHeld: 20,
        presences: 19,
        absences: 1,
        justified: 0,
        attendanceRate: 95.0,
        grades: [
          { name: 'Avaliação Teórica 1', score: 9.0, maxScore: 10, weight: 1, category: 'Prova' },
          { name: 'Trabalho Prático', score: 8.5, maxScore: 10, weight: 2, category: 'Trabalho' },
        ],
        finalGrade: 8.7,
        academicStatus: 'Aprovado',
      },
    ],
    overallAttendanceRate: 95.0,
    overallGpa: 8.7,
    overallAcademicStatus: 'Aprovado',
    criteria: {
      minAttendanceRate: 75,
      minPassingGrade: 6.0,
    },
  };

  it('renders student name, registration number and spreadsheet title', () => {
    render(<StudentBoletimSpreadsheetView data={mockData} />);

    expect(screen.getByText('Iago Marcelo Costa Viera')).toBeDefined();
    expect(screen.getByText('ITB-2026-0440')).toBeDefined();
    expect(screen.getByText('Versão Planilha')).toBeDefined();
    expect(screen.getByText('Boletim de Rendimento Escolar — Grade Tabular')).toBeDefined();
  });

  it('renders assessments and weights in the spreadsheet table', () => {
    render(<StudentBoletimSpreadsheetView data={mockData} />);

    expect(screen.getAllByText('Módulo 1: Fundamentos').length).toBeGreaterThan(0);
    expect(screen.getByText('Avaliação Teórica 1')).toBeDefined();
    expect(screen.getByText('Trabalho Prático')).toBeDefined();
    expect(screen.getByText('9,0')).toBeDefined();
    expect(screen.getByText('8,5')).toBeDefined();
  });

  it('shows overall attendance in header without the legacy attendance bar', () => {
    render(<StudentBoletimSpreadsheetView data={mockData} />);

    expect(screen.queryByText('Espelho de Frequência Consolidado')).toBeNull();
    expect(screen.getAllByText('95,0%').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSwitchFormat when the format switcher button is clicked', () => {
    const handleSwitch = vi.fn();
    render(<StudentBoletimSpreadsheetView data={mockData} onSwitchFormat={handleSwitch} />);

    const switchBtn = screen.getByRole('button', { name: /ver formato padrão/i });
    fireEvent.click(switchBtn);

    expect(handleSwitch).toHaveBeenCalledWith('standard');
  });

  it('calls onPrint when the print button is clicked', () => {
    const handlePrint = vi.fn();
    render(<StudentBoletimSpreadsheetView data={mockData} onPrint={handlePrint} />);

    const printBtn = screen.getByRole('button', { name: /imprimir/i });
    fireEvent.click(printBtn);

    expect(handlePrint).toHaveBeenCalled();
  });
});
