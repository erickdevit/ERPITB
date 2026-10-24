# Project: ERPITB — ERP institucional integrado

## Architecture
ERP institucional em evolução, com módulos acadêmicos e administrativos; frequência, boletim e BI são capacidades atuais dentro de uma plataforma mais ampla.
- **Client**: React 19 + TypeScript PWA (`web/`) with Dexie.js (AES-256 encrypted IndexedDB) and Lucide React + Tailwind CSS.
- **Backend**: Cloudflare Workers + D1 Serverless SQLite (`backend/`) with REST APIs and sync engine.
- **Data Flow**: Offline-first Dexie caching + 100% online direct sync. Analytics and Boletim calculations run client-side on decrypted Dexie records (`classes`, `courses`, `students`, `enrollments`, `attendance_records`, `grade_tables`, `grade_items`, `student_grades`).
- **Export Flow**: Native `@media print` A4 stylesheet in `index.css` and vector PDF generator in `lib/boletim-pdf.ts` via `jspdf`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | BI Attendance Deduplication Fix | Replace local `latestAttendance` in `bi/model.ts` with canonical version from `lib/attendance.ts` | M1 | Survey 1 |
| F2 | Risk Calculation Alignment | Align dropout risk calculation in `lib/analytics.ts` by class (`student_id|class_id`) and include class name in top absentees | M1 | Survey 1 |
| F3 | Empty & Loading States UX | Add skeleton loaders and contextual empty states with icons in `dashboard-page.tsx` | M1 | Survey 1, ORIGINAL_REQUEST R1 |
| F4 | Dashboard KPI & Chart Completeness | Add Justificativas/Reposições metrics and "Sem chamadas" label for 0-record classes in comparative chart | M1 | Survey 1, ORIGINAL_REQUEST R1 |
| F5 | Dashboard Component Tests | Implement comprehensive component tests in `dashboard-page.test.tsx` | M1 | Survey 1, ORIGINAL_REQUEST R4 |
| F6 | Unified Boletim Calculation Engine | Build `lib/boletim.ts` calculating attendance, grades (simple/weighted/sum), GPA, and academic status | M2 | Survey 2, ORIGINAL_REQUEST R2 |
| F7 | Unified Boletim Report Card UI | Build `features/reports/student-report-card-view.tsx` with ITB header, student info, consolidated matrix, legend, and signature | M3 | Survey 3, ORIGINAL_REQUEST R2 |
| F8 | Access Point: Reports Center | Add `studentBoletim` report type in `features/reports/` with class & student filters | M3 | Survey 3, ORIGINAL_REQUEST R3.1 |
| F9 | Access Point: Student Details & List | Add "Emitir Boletim" quick action in `StudentDetailPage` and `students-page.tsx` opening modal preview | M3 | Survey 3, ORIGINAL_REQUEST R3.2 |
| F10 | A4 Print Stylesheet (@media print) | Inject `@media print` rules in `index.css` for clean A4 printing, hiding navbar/sidebar/buttons | M3 | Survey 3, ORIGINAL_REQUEST R3 |
| F11 | Direct Browser Print & PDF Export | Connect `window.print()` and native `jsPDF` vector generator in `lib/boletim-pdf.ts` | M3 | Survey 3, ORIGINAL_REQUEST R3 |
| F12 | Comprehensive E2E & Automated Tests | 4-Tier test suite covering analytics, calculations, UI components, print/export, and passing 100% | M4 / Test Track | Survey 1,2,3, ORIGINAL_REQUEST R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Analytics & Dashboards Review & Refinement | F1, F2, F3, F4, F5 in `web/src/lib/analytics.ts`, `bi/model.ts`, `dashboard-page.tsx`, `dashboard-page.test.tsx` | none | DONE |
| M2 | Boletim Escolar Data Model & Calculation Engine | F6 in `web/src/lib/boletim.ts`, `boletim.test.ts` | none | DONE |
| M3 | Unified Boletim UI, Access Points, Print & PDF Export | F7, F8, F9, F10, F11 in `reports/`, `entity-detail-pages.tsx`, `students-page.tsx`, `index.css`, `boletim-pdf.ts` | M2 | DONE |
| M4 | Final Milestone: 100% E2E Pass & Adversarial Hardening | F12: Run full E2E test suite (Tiers 1-4) and adversarial hardening (Tier 5) | M1, M2, M3, TEST_READY | DONE |

## Interface Contracts

### M2: `web/src/lib/boletim.ts`
```typescript
export interface BoletimStudentInfo {
  id: string;
  name: string;
  registrationNumber: string;
  courseName: string;
  courseId: string;
  classNames: string[];
}

export type AcademicStatus =
  | 'Aprovado'
  | 'Reprovado por Nota'
  | 'Reprovado por Frequência'
  | 'Reprovado por Nota e Frequência'
  | 'Em Andamento'
  | 'Sem Notas';

export interface BoletimModuleRow {
  moduleId: string;
  moduleName: string;
  className: string;
  classesHeld: number;
  presences: number;
  absences: number;
  justified: number;
  attendanceRate: number; // 0 to 100
  grades: { name: string; score: number | null; maxScore: number; weight?: number }[];
  finalGrade: number | null; // 0 to 10 scale
  academicStatus: AcademicStatus;
}

export interface UnifiedBoletimData {
  student: BoletimStudentInfo;
  issueDate: string; // ISO date string or formatted date
  modules: BoletimModuleRow[];
  overallAttendanceRate: number; // 0 to 100
  overallGpa: number | null; // 0 to 10 scale
  overallAcademicStatus: AcademicStatus;
  criteria: {
    minAttendanceRate: number; // 75%
    minPassingGrade: number; // 6.0
  };
}

export function buildUnifiedBoletimData(params: {
  studentId: string;
  classId?: string;
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classes: LocalRecord[];
  courses: LocalRecord[];
  attendanceRecords: LocalRecord[];
  gradeTables: LocalRecord[];
  gradeItems: LocalRecord[];
  studentGrades: LocalRecord[];
}): UnifiedBoletimData | null;
```

### M3: `web/src/lib/boletim-pdf.ts`
```typescript
export async function exportBoletimPdf(data: UnifiedBoletimData): Promise<void>;
```

## Code Layout
- `web/src/lib/analytics.ts` — Home dashboard analytics engine (M1)
- `web/src/lib/analytics.test.ts` — Analytics tests (M1)
- `web/src/features/bi/model.ts` — B.I. dataset engine & canonical attendance deduplication (M1)
- `web/src/features/dashboard-page.tsx` — Home dashboard component & visual refinement (M1)
- `web/src/features/dashboard-page.test.tsx` — Home dashboard unit and component tests (M1)
- `web/src/lib/boletim.ts` — Unified Boletim Escolar data calculation engine (M2)
- `web/src/lib/boletim.test.ts` — Boletim calculations unit tests (M2)
- `web/src/features/reports/student-report-card-view.tsx` — Unified report card printable component (M3)
- `web/src/features/reports/model.ts` — Reports center model with `studentBoletim` (M3)
- `web/src/features/reports/report-filters.tsx` — Report filters with Turma/Aluno selectors (M3)
- `web/src/features/reports/report-result.tsx` — Report renderer integration (M3)
- `web/src/features/entity-detail-pages.tsx` — StudentDetailPage with "Emitir Boletim" action (M3)
- `web/src/features/students-page.tsx` — StudentsPage with "Emitir Boletim" row action (M3)
- `web/src/index.css` — Global CSS with `@media print` A4 stylesheet (M3)
- `web/src/lib/boletim-pdf.ts` — Vector PDF generator via `jspdf` (M3)
- `web/src/lib/boletim-pdf.test.ts` — PDF generator tests (M3)
- `web/test/e2e/` — Opaque-box E2E test suite (Test Track)
