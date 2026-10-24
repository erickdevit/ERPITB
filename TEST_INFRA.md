# TEST_INFRA.md — Dual-Track Test Architecture & 4-Tier Test Methodology

**Project**: ERPITB — ERP institucional (frequência e boletim escolar)
**Version**: 1.0.0
**Scope**: End-to-End (E2E), Integration, and Component Verification Architecture

---

## 1. Dual-Track Test Architecture

The test architecture for ERPITB employs a strict **Dual-Track** strategy ensuring comprehensive verification across both implementation and specification levels:

```
+----------------------------------------------------------------------------------------------------+
|                                    DUAL-TRACK TEST ARCHITECTURE                                    |
+--------------------------------------------------+-------------------------------------------------+
| Track A: White-Box Unit & Integration Suite      | Track B: Opaque-Box Requirement-Driven E2E Suite|
| Location: `web/src/**/*.test.ts(x)`              | Location: `web/test/e2e/**/*.e2e.test.ts`       |
| Scope: Internal state, local stores, UI hooks,   | Scope: Black-box contracts derived strictly from|
| helper algorithms, and component lifecycles.     | `ORIGINAL_REQUEST.md` (R1, R2, R3, R4).         |
+--------------------------------------------------+-------------------------------------------------+
```

### Track A: Implementation Verification
- Co-located with application code in `web/src/`.
- Verifies Dexie reactive stores, encryption/decryption hooks, individual component lifecycle behaviors, and sub-module unit functions (`analytics.test.ts`, `attendance.test.ts`, `grades.test.ts`, `bi/model.test.ts`).

### Track B: Opaque-Box Requirement-Driven E2E Suite
- Dedicated root directory at `web/test/e2e/`.
- Evaluates the application purely as an opaque system against the specifications in `ORIGINAL_REQUEST.md`.
- Tests do not rely on private internal helper functions, instead verifying observable outputs against authoritative mathematical and educational oracles.

---

## 2. 4-Tier Test Methodology

The E2E test suite adheres to a structured 4-tier hierarchy providing progressive depth, adversarial robustness, and real-world operational confidence:

```
+----------------------------------------------------------------------------------------------------+
|                                      4-TIER TEST HIERARCHY                                         |
+----------------------------------------------------------------------------------------------------+
| Tier 1: Feature Coverage (≥5 tests per feature area)                                               |
|   Covers primary happy paths, canonical calculations, and core workflows for all functional areas.|
+----------------------------------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (≥5 tests per feature area)                                        |
|   Exercises edge thresholds (74.9% vs 75.0%, 5.94 vs 6.0), 0-record states, empty inputs, etc.     |
+----------------------------------------------------------------------------------------------------+
| Tier 3: Cross-Feature Interactions (Pairwise combinations)                                         |
|   Tests systemic coupling: Attendance deduplication ↔ BI risk, Class transfer ↔ Boletim matrix,    |
|   Replacement resolution (R -> RC) ↔ GPA & passing status.                                         |
+----------------------------------------------------------------------------------------------------+
| Tier 4: Real-World Scenarios (≥5 end-to-end semester workflows)                                    |
|   Simulates full semester student journeys: Approval, Attendance failure, Grade failure, Ongoing,  |
|   and Historical Multi-class transfer.                                                             |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Specification by Feature Area

### Area 1: Analytics & Dashboards (R1, F1-F5)
*Target: `web/test/e2e/analytics.e2e.test.ts`*

- **Tier 1: Feature Coverage (≥5 tests)**:
  1. *Preset 7-Day Window*: Calculates exact date range, totals, and daily attendance distribution.
  2. *Preset 30-Day Window*: Aggregates monthly calls, presences, absences, and active enrollment totals.
  3. *Preset 90-Day Window*: Captures quarter trends without cumulative drift.
  4. *Custom Date Window*: Accurately restricts records to custom `from` and `to` ISO boundaries.
  5. *Absentee Ranking*: Identifies and ranks top absentees with correct class attribution.
  6. *KPI Metrics Completeness*: Reconciles presence, absence, justified (`J`), delayed (`A`), and replacement (`R`/`RC`) metrics.
- **Tier 2: Boundary & Corner Cases (≥5 tests)**:
  1. *Zero Attendance Records*: Clean handling of active classes with 0 call records (no division by zero).
  2. *Inverted Date Range (`from > to`)*: Graceful handling without unhandled exceptions or NaN values.
  3. *Single Isolated Record*: Exact 100% or 0% rate calculations for 1-student 1-day sessions.
  4. *Month/Year Boundary*: Verification across year transitions (e.g., Dec 31 to Jan 01) and leap years.
  5. *All Absences Streak*: Verification that 3+ consecutive `F` marks trigger risk flag, but `P`, `J`, or `A` reset streak.
- **Tier 3: Interactions**:
  1. Attendance deduplication: Same `${class_id}:${student_id}:${date}` with different record IDs resolves to latest timestamp in both Home Analytics and BI Dataset.
  2. Risk Alignment: Consistent student dropout risk classification between `lib/analytics.ts` and `bi/model.ts`.

---

### Area 2: Boletim Escolar Calculation Engine (R2, F6)
*Target: `web/test/e2e/boletim-engine.e2e.test.ts`*

- **Tier 1: Feature Coverage (≥5 tests)**:
  1. *Attendance Calculations*: Evaluates classes held, presences, absences, justified, and attendance rate %.
  2. *Simple Average Mode*: Computes arithmetic mean of normalized 0-10 evaluations.
  3. *Weighted Average Mode*: Computes weighted mean based on evaluation weight parameters.
  4. *Sum Mode*: Computes capped sum (max 10.0) of evaluation scores.
  5. *Consolidated Matrix Construction*: Generates multi-module table rows with correct headers and metadata.
  6. *Overall Academic Status Resolution*: Validates statuses: `Aprovado`, `Reprovado por Nota`, `Reprovado por Frequência`, `Reprovado por Nota e Frequência`, `Em Andamento`, `Sem Notas`.
- **Tier 2: Boundary & Corner Cases (≥5 tests)**:
  1. *Attendance Boundary (74.9% vs 75.0%)*: Exactly 74.94% resolves to `Reprovado por Frequência`, 75.00% meets passing threshold.
  2. *Grade Passing Boundary (5.94 vs 6.0)*: Final grade of 5.94 resolves to `Reprovado por Nota`, 6.00 resolves to `Aprovado`.
  3. *Classes with Zero Sessions*: Returns 100.0% attendance rate default, preventing division by zero.
  4. *Non-10 Max Score Normalization*: Scores based on max 20, 50, or 100 correctly scale to standard 0-10.
  5. *Unpublished or Pending Evaluations*: Items without recorded grades do not penalize completed evaluations in ongoing status.
- **Tier 3: Interactions**:
  1. Concluded replacement (`RC`) converting absence to presence updates attendance rate and recovers student from failing status.
  2. Multi-class enrollment consolidation maintains distinct module rows per class while aggregating overall GPA.

---

### Area 3: Reports Center, Boletim UI & Print/PDF (R3, F7-F11)
*Target: `web/test/e2e/boletim-ui-print.e2e.test.ts`*

- **Tier 1: Feature Coverage (≥5 tests)**:
  1. *Report Filter Integration*: Reports page exposes `studentBoletim` report option with Class and Student selectors.
  2. *Student Selection Dynamic Filtering*: Changing class dynamically updates available students enrolled in that class.
  3. *Print Stylesheet Rules*: Global `@media print` rules hide navigation, header, buttons, and reset overflow containers.
  4. *Page-Break Protection*: Tables and module rows specify `page-break-inside: avoid` / `break-inside: avoid`.
  5. *PDF Export Function Contract*: `exportBoletimPdf` generates valid A4 document with student data, matrix, and signature blocks.
- **Tier 2: Boundary & Corner Cases (≥5 tests)**:
  1. *Student with Missing Contact/CPF*: Masked or omitted gracefully without layout breakage.
  2. *Class without Grade Tables*: Renders attendance-only table with em-dash (`—`) in grade columns.
  3. *Long Module Names*: Table columns accommodate long text with word wrap and no horizontal clipping.
  4. *Modal Triggering*: Fast action button in student detail and student list triggers preview dialog with clean state.
  5. *Browser Print Fallback*: `window.print` execution occurs cleanly in browser environment.
- **Tier 3: Interactions**:
  1. Changing student in report filters immediately refreshes the rendered report card matrix.
  2. Action trigger from `/alunos` navigates or displays dialog with preselected student and active class.

---

### Area 4: Real-World Scenarios (R1-R4, F12)
*Target: `web/test/e2e/real-world-scenarios.e2e.test.ts`*

- **Tier 4: End-to-End Semester Workflows (≥5 scenarios)**:
  1. *Scenario 1 — Fully Approved High Achiever*:
     - Student attends 38 of 40 sessions (95.0% attendance).
     - Obtains grades: 9.0, 8.5, 9.5 across 3 modules.
     - Result: `Aprovado`, GPA = 9.0, 0 dropout risk, clean printable report card.
  2. *Scenario 2 — Attendance Failure Despite High Grades*:
     - Student attends 28 of 40 sessions (70.0% attendance, < 75% threshold).
     - Obtains high grades: 8.5, 9.0, 8.0.
     - Result: `Reprovado por Frequência` (attendance is strictly mandatory), flagged in Home/BI dropout risk.
  3. *Scenario 3 — Grade Failure with Perfect Attendance*:
     - Student attends 40 of 40 sessions (100.0% attendance).
     - Obtains low grades: 4.5, 5.0, 5.5 (mean < 6.0).
     - Result: `Reprovado por Nota`, attendance rate 100%, 0 attendance risk.
  4. *Scenario 4 — Mid-Semester In-Progress Trajectory*:
     - Module 1 complete (Grade: 8.0, Attendance: 90%).
     - Module 2 in progress (Grade item 1 recorded, Grade item 2 pending).
     - Module 3 not yet started.
     - Result: `Em Andamento`, partial GPA calculated on completed module, clear pending indicator.
  5. *Scenario 5 — Class Transfer & Concluded Class History*:
     - Student completed Module 1 in "Turma A" (status: `concluida`).
     - Student moved to "Turma B" and completed Module 2 (status: `ativa`).
     - Result: Boletim reflects both modules in single unified matrix, correctly preserving historical and active progress.

---

## 4. Test Runner & Execution Protocol

### Running the Test Suite
All E2E tests are fully integrated into the standard Vitest runner:

```bash
# Run entire test suite (Track A + Track B)
cd web && npm test

# Run E2E test suite specifically
cd web && npx vitest run test/e2e/

# Run with coverage report
cd web && npx vitest run --coverage
```

### TypeScript Typechecking
```bash
cd web && npx tsc -b
```

---

## 5. Requirement Traceability Matrix

| Test Suite | Requirement (`ORIGINAL_REQUEST.md`) | Feature ID (`PROJECT.md`) | Key Assertions |
|:---|:---|:---|:---|
| `analytics.e2e.test.ts` | R1: Auditoria e Refinamento dos Dashboards | F1, F2, F3, F4 | Presets (7, 30, 90, custom), empty states, 0-record label, deduplication, risk alignment |
| `boletim-engine.e2e.test.ts` | R2: Boletim Escolar Unificado do Aluno | F6 | Attendance rate %, simple/weighted/sum grades, GPA, 6 academic status branches, boundaries |
| `boletim-ui-print.e2e.test.ts` | R3: Pontos de Acesso, Impressão e PDF | F7, F8, F9, F10, F11 | `studentBoletim` filters, modal triggers, `@media print` CSS rules, `exportBoletimPdf` contract |
| `real-world-scenarios.e2e.test.ts` | R1, R2, R3, R4: Integridade de Ponta a Ponta | F12 | 5 End-to-end semester trajectories (Approved, Repr. Freq, Repr. Nota, Em Andamento, Transfer) |
