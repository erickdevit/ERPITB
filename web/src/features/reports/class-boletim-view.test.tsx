// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassBoletimView } from './class-boletim-view';
import type { ClassBoletimData } from '../../lib/boletim';

describe('ClassBoletimView Component', () => {
  const mockClassData: ClassBoletimData = {
    classId: 'cls-1',
    className: '04 - SÁBADO 07-10 LAB1',
    courseName: 'Informática Profissional',
    totalStudents: 3,
    classAverage: 8.5,
    approvedCount: 2,
    issueDate: '2026-10-22T10:00:00Z',
    tables: [
      {
        id: 'tbl-1',
        name: 'Introdução à informatica',
        calculationMode: 'simple',
        calculationModeLabel: 'Média Simples',
        passingGrade: 6,
      },
      {
        id: 'tbl-2',
        name: 'Windows 11',
        calculationMode: 'simple',
        calculationModeLabel: 'Média Simples',
        passingGrade: 6,
      },
      {
        id: 'tbl-3',
        name: 'PowerPoint',
        calculationMode: 'simple',
        calculationModeLabel: 'Média Simples',
        passingGrade: 6,
      },
    ],
    students: [
      {
        studentId: 's-1',
        studentName: 'ALYANNE SILVA COSTA',
        registrationNumber: 'ITB-001',
        tableResults: [
          { tableId: 'tbl-1', average: null, evaluatedCount: 0, totalItems: 2, status: 'em_andamento', statusLabel: 'Em andamento' },
          { tableId: 'tbl-2', average: null, evaluatedCount: 0, totalItems: 0, status: 'sem_notas', statusLabel: 'Sem notas' },
          { tableId: 'tbl-3', average: null, evaluatedCount: 0, totalItems: 3, status: 'em_andamento', statusLabel: 'Em andamento' },
        ],
        overallAverage: null,
        attendanceRate: 100,
        attendanceRateLabel: '100,0%',
        overallStatus: 'em_andamento',
        overallStatusLabel: 'Em andamento',
      },
      {
        studentId: 's-2',
        studentName: 'AYLLA VITORIA SOUSA CARVALHO',
        registrationNumber: 'ITB-002',
        tableResults: [
          { tableId: 'tbl-1', average: null, evaluatedCount: 0, totalItems: 2, status: 'em_andamento', statusLabel: 'Em andamento' },
          { tableId: 'tbl-2', average: null, evaluatedCount: 0, totalItems: 0, status: 'sem_notas', statusLabel: 'Sem notas' },
          { tableId: 'tbl-3', average: 9.5, evaluatedCount: 2, totalItems: 3, status: 'em_andamento', statusLabel: 'Em andamento' },
        ],
        overallAverage: 9.5,
        attendanceRate: 100,
        attendanceRateLabel: '100,0%',
        overallStatus: 'em_andamento',
        overallStatusLabel: 'Em andamento',
      },
      {
        studentId: 's-3',
        studentName: 'ANTONIO GILVA DE JESUS DA CRUZ',
        registrationNumber: 'ITB-003',
        tableResults: [
          { tableId: 'tbl-1', average: null, evaluatedCount: 0, totalItems: 2, status: 'em_andamento', statusLabel: 'Em andamento' },
          { tableId: 'tbl-2', average: null, evaluatedCount: 0, totalItems: 0, status: 'sem_notas', statusLabel: 'Sem notas' },
          { tableId: 'tbl-3', average: null, evaluatedCount: 0, totalItems: 3, status: 'em_andamento', statusLabel: 'Em andamento' },
        ],
        overallAverage: null,
        attendanceRate: 0,
        attendanceRateLabel: '0,0%',
        overallStatus: 'em_andamento',
        overallStatusLabel: 'Em andamento',
      },
    ],
  };

  it('renders title and subtitle exactly as in screenshot', () => {
    render(<ClassBoletimView data={mockClassData} />);

    expect(screen.getByText('Boletim Consolidado — 04 - SÁBADO 07-10 LAB1')).toBeDefined();
    expect(
      screen.getByText('Visão geral de desempenho com médias calculadas conforme a configuração de cada etapa (Média Aritmética ou Maior Nota).')
    ).toBeDefined();
  });

  it('renders all column headers with calculation mode subheaders', () => {
    render(<ClassBoletimView data={mockClassData} />);

    expect(screen.getByText('Aluno')).toBeDefined();
    expect(screen.getByText('Introdução à informatica')).toBeDefined();
    expect(screen.getByText('Windows 11')).toBeDefined();
    expect(screen.getByText('PowerPoint')).toBeDefined();
    expect(screen.getAllByText('Média Simples').length).toBe(3);
    expect(screen.getByText('Média Geral')).toBeDefined();
    expect(screen.getByText('Frequência')).toBeDefined();
    expect(screen.getByText('Situação')).toBeDefined();
  });

  it('renders student rows, evaluations count and status badges', () => {
    render(<ClassBoletimView data={mockClassData} />);

    expect(screen.getByText('ALYANNE SILVA COSTA')).toBeDefined();
    expect(screen.getByText('AYLLA VITORIA SOUSA CARVALHO')).toBeDefined();
    expect(screen.getByText('ANTONIO GILVA DE JESUS DA CRUZ')).toBeDefined();

    // Grades and evaluated count
    expect(screen.getAllByText('9,5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2/3 aval.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0/2 aval.').length).toBeGreaterThan(0);

    // Status badges
    expect(screen.getAllByText('Em andamento').length).toBe(3);
  });

  it('triggers onPrint handler when "Imprimir" button is clicked', () => {
    const onPrintMock = vi.fn();
    render(<ClassBoletimView data={mockClassData} onPrint={onPrintMock} />);

    const printBtn = screen.getByRole('button', { name: /Imprimir Boletim/i });
    fireEvent.click(printBtn);
    expect(onPrintMock).toHaveBeenCalledTimes(1);
  });

  it('triggers onDownloadPdf handler when "Baixar PDF" is clicked', () => {
    const onDownloadMock = vi.fn();
    render(<ClassBoletimView data={mockClassData} onDownloadPdf={onDownloadMock} />);

    const downloadBtn = screen.getByRole('button', { name: /Baixar PDF/i });
    fireEvent.click(downloadBtn);
    expect(onDownloadMock).toHaveBeenCalledTimes(1);
  });

  it('renders "Organizar Tabelas" button when onOrganizeTables is provided', () => {
    const onOrganizeMock = vi.fn();
    render(<ClassBoletimView data={mockClassData} onOrganizeTables={onOrganizeMock} />);

    const organizeBtn = screen.getByRole('button', { name: /Organizar Tabelas/i });
    expect(organizeBtn).toBeDefined();
    fireEvent.click(organizeBtn);
    expect(onOrganizeMock).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectStudent when a student name is clicked', () => {
    const onSelectStudentMock = vi.fn();
    render(<ClassBoletimView data={mockClassData} onSelectStudent={onSelectStudentMock} />);

    const studentCell = screen.getByText('AYLLA VITORIA SOUSA CARVALHO');
    fireEvent.click(studentCell);
    expect(onSelectStudentMock).toHaveBeenCalledWith('s-2');
  });
});
