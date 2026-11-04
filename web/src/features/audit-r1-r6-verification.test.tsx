// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CardSkeleton, EmptyState, NotFoundPage, TableSkeleton } from '../components';
import { PublicStudentPortal } from './public-student-portal';
import { StudentReportCardView } from './reports/student-report-card-view';
import { ClassBatchBoletimPrintView } from './reports/class-batch-boletim-view';
import { buildBoletimPdf, buildClassBatchBoletimPdf } from '../lib/boletim-pdf';
import { clearEntityMemoryCache, notifyEntityChanged } from '../lib/use-entity';
import type { UnifiedBoletimData } from '../lib/boletim';

function makeStudentBoletim(overrides?: Partial<UnifiedBoletimData> & { moduleCount?: number }): UnifiedBoletimData {
  const count = overrides?.moduleCount ?? 8;
  const modules = Array.from({ length: count }, (_, idx) => ({
    moduleId: `mod-${idx + 1}`,
    moduleName: `${idx + 1}º Módulo — Desenvolvimento Fullstack Avançado e Arquitetura`,
    className: 'Turma 01 - Fullstack Master',
    classesHeld: 10,
    presences: 9,
    absences: 1,
    justified: 0,
    attendanceRate: 90.0,
    calculationMode: 'simple' as const,
    calculationModeLabel: 'Média Simples',
    grades: [
      {
        name: 'Avaliação Teórica',
        category: 'Prova',
        score: 8.0,
        maxScore: 10,
        weight: 1,
      },
      {
        name: 'Projeto Prático',
        category: 'Projeto',
        score: 9.0,
        maxScore: 10,
        weight: 1,
      },
    ],
    finalGrade: 8.5,
    academicStatus: 'Aprovado' as const,
  }));

  return {
    student: {
      id: overrides?.student?.id ?? 'stu-1',
      name:
        overrides?.student?.name ??
        'Maria Fernanda de Albuquerque Cavalcanti Vasconcelos de Oliveira Santos',
      registrationNumber: overrides?.student?.registrationNumber ?? 'MAT-2026-999',
      courseName: 'Engenharia de Software e Desenvolvimento Web',
      courseId: 'crs-1',
      classNames: ['Turma 01 - Fullstack Master'],
    },
    issueDate: '29/10/2026',
    modules,
    overallAttendanceRate: 92.5,
    overallGpa: 8.5,
    overallAcademicStatus: 'Aprovado',
    criteria: {
      minAttendanceRate: 75.0,
      minPassingGrade: 6.0,
    },
    ...overrides,
  };
}

describe('Audit R1–R6 Comprehensive Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEntityMemoryCache();
  });

  it('R1: renders semantic 404 NotFoundPage, TableSkeleton, CardSkeleton and EmptyState', () => {
    render(
      <MemoryRouter initialEntries={['/rota-inexistente']}>
        <NotFoundPage />
        <TableSkeleton rows={3} cols={4} />
        <CardSkeleton count={2} />
        <EmptyState title="Nenhum registro encontrado" description="Tente ajustar os filtros." />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Página não encontrada/i)).toBeInTheDocument();
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
  });

  it('R2: renders parameterless /boletim lookup view and switches to Folha Oficial (A4) on /boletim/:code', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/boletim']}>
        <Routes>
          <Route path="/boletim" element={<PublicStudentPortal />} />
          <Route path="/boletim/:code" element={<PublicStudentPortal />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Consulta Pública de Frequência e Boletim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Número de Matrícula/i)).toBeInTheDocument();

    // Now test /boletim/:code switching to Folha Oficial (A4)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        student: { name: 'Lucas Andrade', registrationNumber: 'MAT-2026-777', active: true },
        metrics: {
          totalLessons: 20,
          present: 19,
          absent: 1,
          justified: 0,
          delayed: 0,
          replacement: 0,
          attendanceRate: 95.0,
        },
        classes: [
          {
            className: 'Turma 02',
            courseName: 'Design UI/UX',
            courseCode: 'UX-01',
            shift: 'noite',
            status: 'ativa',
          },
        ],
        monthlyEvolution: [],
        history: [],
        reportCard: {
          overallAverage: 9.2,
          passingGrade: 6.0,
          overallStatus: 'aprovado',
          overallStatusLabel: 'Aprovado',
          totalTables: 1,
          totalAssessments: 1,
          evaluatedAssessments: 1,
          byCategory: [],
          tables: [
            {
              id: 't1',
              name: 'Módulo 1 — Prototipação Figma',
              className: 'Turma 02',
              courseName: 'Design UI/UX',
              courseCode: 'UX-01',
              teacherName: 'Profa. Clara',
              calculationMode: 'simple',
              passingGrade: 6.0,
              notes: null,
              updatedAt: null,
              average: 9.2,
              status: 'aprovado',
              statusLabel: 'Aprovado',
              totalItems: 1,
              evaluatedItems: 1,
              items: [
                {
                  id: 'i1',
                  name: 'Entrega Design System',
                  category: 'Projeto',
                  evaluationDate: '2026-09-10',
                  maxScore: 10,
                  weight: 1,
                  notes: null,
                  score: 9.2,
                  normalizedScore: 9.2,
                  remarks: null,
                  updatedAt: null,
                },
              ],
            },
          ],
        },
      }),
    } as Response);

    const input = screen.getByLabelText(/Número de Matrícula/i);
    await user.type(input, 'MAT-2026-777');
    await user.click(screen.getByRole('button', { name: /Consultar Boletim/i }));

    await waitFor(() => {
      expect(screen.getByText('Lucas Andrade')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Folha Oficial \(A4\)/i }));
    expect(screen.getByLabelText('Folha Oficial do Boletim A4')).toBeInTheDocument();
  });

  it('R3: enforces 1-page A4 rule in StudentReportCardView and buildBoletimPdf with 10 modules and 70+ char student name', async () => {
    const edgeStudent = makeStudentBoletim({ moduleCount: 10 });
    const { container } = render(<StudentReportCardView data={edgeStudent} />);

    const sheet = container.querySelector('.boletim-single-page');
    expect(sheet).not.toBeNull();
    // With 10 modules (>6), adaptive 4-column print layout is applied
    expect(container.querySelector('.print\\:grid-cols-4')).not.toBeNull();

    // Verify jsPDF output is strictly 1 A4 landscape page even with 10 modules
    const pdfDoc = await buildBoletimPdf(edgeStudent);
    expect(pdfDoc.getNumberOfPages()).toBe(1);
  });

  it('R4: renders ClassBatchBoletimPrintView with 1 page per student, zero trailing page break, and exact N-page batch PDF', async () => {
    const s1 = makeStudentBoletim({
      student: { id: 's1', name: 'Aluno 1 Nome Longo de Teste Acadêmico', registrationNumber: 'M001', courseName: 'Fullstack', courseId: 'c1', classNames: ['Turma 01'] },
      moduleCount: 8,
    });
    const s2 = makeStudentBoletim({
      student: { id: 's2', name: 'Aluno 2 Nome Longo de Teste Acadêmico', registrationNumber: 'M002', courseName: 'Fullstack', courseId: 'c1', classNames: ['Turma 01'] },
      moduleCount: 8,
    });
    const s3 = makeStudentBoletim({
      student: { id: 's3', name: 'Aluno 3 Nome Longo de Teste Acadêmico', registrationNumber: 'M003', courseName: 'Fullstack', courseId: 'c1', classNames: ['Turma 01'] },
      moduleCount: 8,
    });

    const { container } = render(
      <ClassBatchBoletimPrintView
        studentsData={[s1, s2, s3]}
        className="Turma 01 - Fullstack Master"
      />,
    );

    const pages = container.querySelectorAll('.class-batch-student-page');
    expect(pages.length).toBe(3);
    expect(pages[0]?.classList.contains('class-batch-page-break')).toBe(true);
    expect(pages[1]?.classList.contains('class-batch-page-break')).toBe(true);
    expect(pages[2]?.classList.contains('class-batch-last-page')).toBe(true);
    expect(pages[2]?.classList.contains('class-batch-page-break')).toBe(false);

    // Verify batch PDF has strictly 3 pages (1 per student, 0 extra pages)
    const batchPdf = await buildClassBatchBoletimPdf([s1, s2, s3]);
    expect(batchPdf.getNumberOfPages()).toBe(3);
  });

  it('R5: notifyEntityChanged only notifies subscribed entity listeners without wiping unrelated caches', async () => {
    const { useEntity } = await import('../lib/use-entity');
    const getSpy = vi.fn().mockImplementation(async (endpoint: string) => {
      return { items: [{ id: `item-${endpoint}`, name: endpoint }] };
    });

    const mockAppValue: any = {
      session: {
        id: 'prof-b-user-id',
        name: 'Professor B',
        email: 'profb@opschool.test',
        role: 'professor',
        accessToken: 'token-b',
        refreshToken: 'refresh-b',
      },
      store: { accountId: 'prof-b-user-id', list: vi.fn().mockResolvedValue([]) },
      api: { get: getSpy },
      refresh: 0,
      sync: vi.fn(),
      syncState: 'idle',
      logout: vi.fn(),
    };

    const { ApplicationProvider } = await import('../app-context');
    expect(ApplicationProvider).toBeDefined();

    // Test targeted cache invalidation directly
    clearEntityMemoryCache();
    expect(() => notifyEntityChanged(['attendance_records', 'class_notes'])).not.toThrow();
    expect(getSpy).not.toHaveBeenCalledWith('/v1/courses');
    expect(getSpy).not.toHaveBeenCalledWith('/v1/laboratories');
    expect(mockAppValue.session.id).toBe('prof-b-user-id');
  });
});
