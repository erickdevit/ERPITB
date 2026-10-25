import { describe, expect, it, vi } from 'vitest';
import type { jsPDF } from 'jspdf';
import {
  buildBoletimPdf,
  buildClassBoletimPdf,
  exportBoletimPdf,
  exportClassBoletimPdf,
  getBoletimPdfFilename,
  urlToDataUrl,
} from './boletim-pdf';
import type { ClassBoletimData, UnifiedBoletimData } from './boletim';

describe('Boletim PDF Generator — Native Vector jsPDF', () => {
  const mockBoletimData: UnifiedBoletimData = {
    student: {
      id: 'student-100',
      name: 'João da Silva Santos',
      registrationNumber: 'ITB-2026-042',
      courseName: 'Desenvolvimento Web Full Stack',
      courseId: 'course-1',
      classNames: ['Turma Alpha (Manhã)'],
    },
    issueDate: '2026-10-22T12:00:00Z',
    modules: [
      {
        moduleId: 'mod-1',
        moduleName: 'Módulo 1: Frontend React',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 40,
        presences: 38,
        absences: 2,
        justified: 0,
        attendanceRate: 95.0,
        grades: [
          { name: 'P1', score: 8.5, maxScore: 10, weight: 1 },
          { name: 'Projeto', score: 9.0, maxScore: 10, weight: 1 },
        ],
        finalGrade: 8.8,
        academicStatus: 'Aprovado',
      },
      {
        moduleId: 'mod-2',
        moduleName: 'Módulo 2: Backend Node.js',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 40,
        presences: 36,
        absences: 3,
        justified: 1,
        attendanceRate: 90.0,
        grades: [
          { name: 'P1', score: 7.0, maxScore: 10, weight: 1 },
          { name: 'API REST', score: 8.0, maxScore: 10, weight: 1 },
        ],
        finalGrade: 7.5,
        academicStatus: 'Aprovado',
      },
      {
        moduleId: 'mod-3',
        moduleName: 'Módulo 3: Banco de Dados SQL',
        className: 'Turma Alpha (Manhã)',
        classesHeld: 20,
        presences: 12,
        absences: 8,
        justified: 0,
        attendanceRate: 60.0,
        grades: [
          { name: 'Modelagem', score: 8.0, maxScore: 10, weight: 1 },
        ],
        finalGrade: 8.0,
        academicStatus: 'Reprovado por Frequência',
      },
    ],
    overallAttendanceRate: 86.0,
    overallGpa: 8.1,
    overallAcademicStatus: 'Reprovado por Frequência',
    criteria: {
      minAttendanceRate: 75.0,
      minPassingGrade: 6.0,
    },
  };

  it('buildBoletimPdf builds a valid A4 landscape jsPDF instance without Situação column', () => {
    const doc = buildBoletimPdf(mockBoletimData);

    expect(doc).toBeDefined();
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    // Verify binary output buffer
    const arrayBuffer = doc.output('arraybuffer');
    expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
    expect(arrayBuffer.byteLength).toBeGreaterThan(2000);
  });

  it('handles student with no grades (Sem Notas) cleanly', () => {
    const dataWithoutGrades: UnifiedBoletimData = {
      ...mockBoletimData,
      modules: [
        {
          moduleId: 'mod-none',
          moduleName: 'Módulo de Orientação',
          className: 'Turma Alpha',
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
      overallAttendanceRate: 100.0,
      overallGpa: null,
      overallAcademicStatus: 'Sem Notas',
    };

    const doc = buildBoletimPdf(dataWithoutGrades);
    expect(doc).toBeDefined();
    const arrayBuffer = doc.output('arraybuffer');
    expect(arrayBuffer.byteLength).toBeGreaterThan(1500);
  });

  it('handles long names and multiple classes gracefully without throwing', () => {
    const longData: UnifiedBoletimData = {
      ...mockBoletimData,
      student: {
        id: 'std-long',
        name: 'Maria Francisca Leopoldina de Guimarães Alencastro e Albuquerque dos Santos',
        registrationNumber: 'ITB-2026-9999-EXTENDED',
        courseName: 'Curso Integrado Avançado de Engenharia de Software e Desenvolvimento Full Stack em Nuvem',
        courseId: 'course-long',
        classNames: ['Turma Alpha 2026/1 (Manhã)', 'Turma Beta 2026/2 (Noite)'],
      },
    };

    const doc = buildBoletimPdf(longData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('getBoletimPdfFilename normalizes student name and extensions', () => {
    expect(getBoletimPdfFilename(mockBoletimData)).toBe('Boletim_Joao_da_Silva_Santos.pdf');
    expect(getBoletimPdfFilename(mockBoletimData, 'custom_name.pdf')).toBe('custom_name.pdf');
  });

  it('exportBoletimPdf invokes doc.save with formatted filename', async () => {
    const saveMock = vi.fn();
    const mockDoc = {
      save: saveMock,
    } as unknown as jsPDF;

    await exportBoletimPdf(mockBoletimData, undefined, mockDoc);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('Boletim_Joao_da_Silva_Santos.pdf');
  });

  it('exportBoletimPdf respects customFilename if provided', async () => {
    const saveMock = vi.fn();
    const mockDoc = {
      save: saveMock,
    } as unknown as jsPDF;

    await exportBoletimPdf(mockBoletimData, 'Meu_Boletim_Customizado.pdf', mockDoc);
    expect(saveMock).toHaveBeenCalledWith('Meu_Boletim_Customizado.pdf');
  });

  it('buildClassBoletimPdf builds valid jsPDF for class boletim and exportClassBoletimPdf saves it', async () => {
    const classData: ClassBoletimData = {
      classId: 'c1',
      className: '04 - SÁBADO 07-10 LAB1',
      courseName: 'Informática',
      tables: [
        { id: 't1', name: 'Windows 11', calculationMode: 'simple', calculationModeLabel: 'Média Simples', passingGrade: 6 },
        { id: 't2', name: 'PowerPoint', calculationMode: 'simple', calculationModeLabel: 'Média Simples', passingGrade: 6 },
      ],
      students: [
        {
          studentId: 's1',
          studentName: 'AYLLA VITORIA',
          registrationNumber: 'ITB-001',
          tableResults: [
            { tableId: 't1', average: 9.5, evaluatedCount: 2, totalItems: 3, status: 'aprovado', statusLabel: 'Aprovado' },
            { tableId: 't2', average: 8.0, evaluatedCount: 1, totalItems: 1, status: 'aprovado', statusLabel: 'Aprovado' },
          ],
          overallAverage: 8.8,
          attendanceRate: 100,
          attendanceRateLabel: '100,0%',
          overallStatus: 'aprovado',
          overallStatusLabel: 'Aprovado',
        },
      ],
      classAverage: 8.8,
      approvedCount: 1,
      totalStudents: 1,
      issueDate: '2026-10-22T12:00:00Z',
    };

    const doc = buildClassBoletimPdf(classData);
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const saveMock = vi.fn();
    const mockDoc = { save: saveMock } as unknown as jsPDF;
    await exportClassBoletimPdf(classData, undefined, mockDoc);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('Boletim_Consolidado_04_-_SABADO_07-10_LAB1.pdf');
  });

  it('renders watermark image in PDF if watermarkLogoDataUrl is provided', () => {
    // 1x1 transparent PNG data url
    const dummyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const doc = buildBoletimPdf(mockBoletimData, {
      watermarkLogoDataUrl: dummyPngDataUrl,
    });
    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('urlToDataUrl returns data url as-is or null if url is undefined', async () => {
    expect(await urlToDataUrl(undefined)).toBeNull();
    const dataUrl = 'data:image/png;base64,abc123';
    expect(await urlToDataUrl(dataUrl)).toBe(dataUrl);
  });
});
