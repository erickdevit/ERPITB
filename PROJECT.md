# Project: opschool — Auditoria Técnica, Visual e de Concorrência para Produção

## Architecture
ERP institucional integrado para produção.
- **Client**: React 19 + TypeScript SPA/PWA (`web/`) com Dexie.js (AES-256 encrypted IndexedDB), Tailwind CSS, Lucide React e jsPDF.
- **Backend**: Cloudflare Workers / Node.js Serverless runtime + D1 Serverless SQLite (`backend/`) com REST APIs, sync engine e SSE event bus.
- **Data Flow**: Offline-first Dexie caching + sincronização direta online. Eventos em tempo real via SSE (`/v1/events`).
- **Export & Print Flow**: `@media print` A4 stylesheet em `web/src/index.css` e gerador vetorial de PDFs em `web/src/lib/boletim-pdf.ts` via `jspdf`.
- **Public Flow**: Portal público do aluno com consulta de matrícula, visualização interativa e boletim oficial para impressão/PDF.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Frontend Routes & RBAC Harmonization | Revisão e proteção de rotas (`/bi/professores`, `/bi/institucional`, `/bi/risco`), verificação de acesso a dados de alunos em `StudentDetailPage`, inclusão de `/conflitos` na navegação e tela 404 semântica | M1 | ORIGINAL_REQUEST R1 |
| F2 | Global UI/UX Skeletons & Empty States | Criação de componentes `TableSkeleton`, `CardSkeleton`, `EmptyState` e padronização em `classes-page`, `catalog-page`, `replacements-page`, `grades-page`, `entity-detail-pages` e finanças | M1 | ORIGINAL_REQUEST R1 |
| F3 | Public Portal Content Negotiation & Routing | Correção em `backend/src/server.ts` para servir `index.html` em requisições de navegador com `Accept: text/html` para `/aluno/`, `/boletim/`, `/portal/`; suporte a rotas `/boletim/:code` e `/boletim` sem código no frontend | M2 | ORIGINAL_REQUEST R2 |
| F4 | Public Student Portal UI Redesign | Redesenho completo de `PublicStudentPortal` com identidade visual opschool, busca de matrícula, modo interativo, embutimento do boletim oficial (`StudentReportCardView`) e exportação PDF/impressão | M2 | ORIGINAL_REQUEST R2 |
| F5 | 1-Page A4 Print Rule & Parity Standardization | Ajuste de `@page` e CSS `@media print` em `index.css` e `StudentReportCardView` para caber em exatamente 1 página A4 landscape sem páginas em branco; adição de logo e badges no PDF (`boletim-pdf.ts`) | M3 | ORIGINAL_REQUEST R3 |
| F6 | Class Batch Report Card Print & PDF | Implementação de `ClassBatchBoletimPrintView` concatenando boletins individuais da turma com `break-after: page` e neutralização na última página (`break-after: auto`); função `exportClassBatchBoletimPdf` | M3 | ORIGINAL_REQUEST R4 |
| F7 | Class Detail Spreadsheet Mode | Integração de `ClassBoletimView` ("Modo Planilha / Boletim Consolidado") na tela de turma (`ClassDetailPage`), exibindo matriz de alunos, módulos, média final e taxa de frequência, com botões de emissão em lote | M3 | ORIGINAL_REQUEST R4 |
| F8 | Scoped SSE Event Bus & Event Streaming | Escopo granular nos eventos `entity_changed` no backend (`targetUserId`, `classId`, `entity`) para evitar broadcast indiscriminado entre clientes | M4 | ORIGINAL_REQUEST R5 |
| F9 | Draft Protection in Attendance & Grades | Proteção no frontend para que eventos de background e recarregamentos não sobrescrevam rascunhos ativos e não salvos em `AttendancePage` e `GradesPage` | M4 | ORIGINAL_REQUEST R5 |
| F10 | Session & Cache Partitioning | Particionamento do `inMemoryCache` por `accountId` no frontend; limpeza de cache no login; invalidação do `workerQueryCache` em operações batch e invalidação do cache de usuário em demissões/alterações de role | M4 | ORIGINAL_REQUEST R5 |
| F11 | Concurrency Isolation Test Suite | Desenvolvimento de suíte de testes de concorrência validando isolamento de sessões, mutações paralelas de chamada, tratamento de conflito 409 e preservação de rascunhos | M5 | ORIGINAL_REQUEST R5, R6 |
| F12 | Multi-Browser & Edge Case Layout Tests | Desenvolvimento e execução de testes automatizados para Chromium e Firefox validando regra de 1 página A4, nomes longos (60+ caracteres) e turmas com número variável de módulos (1 a 10) | M5 | ORIGINAL_REQUEST R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Auditoria de Rotas, Permissões e UI/UX Global | F1, F2 em `web/src/app.tsx`, `components.tsx`, `classes-page.tsx`, `catalog-page.tsx`, `replacements-page.tsx`, `grades-page.tsx`, `entity-detail-pages.tsx` | none | PLANNED |
| M2 | Reformulação do Boletim Público e Negociação de Rotas | F3, F4 em `backend/src/server.ts`, `backend/src/index.ts`, `web/src/app.tsx`, `web/src/features/public-student-portal.tsx` | none | PLANNED |
| M3 | Padronização de Relatórios, Página Única A4 e Lote Turma / Planilha | F5, F6, F7 em `web/src/index.css`, `web/src/features/reports/student-report-card-view.tsx`, `web/src/lib/boletim-pdf.ts`, `web/src/features/reports/class-batch-boletim-view.tsx`, `web/src/features/entity-detail-pages.tsx` | none | PLANNED |
| M4 | Isolamento Estrito de Sessão e Estado de Cliente em Concorrência | F8, F9, F10 em `backend/src/events-bus.ts`, `backend/src/events-service.ts`, `backend/src/v1-router.ts`, `backend/src/finance.ts`, `backend/src/auth.ts`, `web/src/lib/use-events.ts`, `web/src/lib/use-entity.ts`, `web/src/features/attendance-page.tsx`, `web/src/features/grades-page.tsx` | none | PLANNED |
| M5 | Testes Automatizados, Validação Multi-Navegador e Concorrência | F11, F12 em `web/test/`, `backend/test/` e execução de testes 100% | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### M1: Componentes de UI/UX em `web/src/components.tsx`
```typescript
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }): React.ReactElement;
export function CardSkeleton({ count = 3 }: { count?: number }): React.ReactElement;
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }): React.ReactElement;
export function NotFoundPage(): React.ReactElement;
```

### M3: Impressão em Lote e PDF em `web/src/lib/boletim-pdf.ts` e `web/src/features/reports/`
```typescript
export async function exportClassBatchBoletimPdf(
  studentsData: UnifiedBoletimData[],
  options?: BoletimPdfOptions
): Promise<jsPDF>;

export interface ClassBatchBoletimProps {
  studentsBoletimData: UnifiedBoletimData[];
  logoUrl?: string;
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkGrayscale?: boolean;
}
export function ClassBatchBoletimPrintView(props: ClassBatchBoletimProps): React.ReactElement;
```

### M4: Escopo de Eventos SSE e Proteção de Rascunhos
```typescript
// backend/src/events-bus.ts
export interface SystemEvent {
  type: string;
  payload: Record<string, unknown>;
  targetUserId?: string | null;
  targetClassId?: string | null;
  entity?: string;
  timestamp: string;
}

// web/src/lib/use-events.ts
export function useEvents(options: {
  onEntityChanged?: (entity?: string, payload?: unknown) => void;
  classId?: string;
}): void;
```

## Code Layout
- `backend/src/server.ts` — Server entry point & HTTP content negotiation (M2)
- `backend/src/events-bus.ts` — EventBus singleton & broadcast engine (M4)
- `backend/src/events-service.ts` — SSE client streaming & subscription filters (M4)
- `backend/src/v1-router.ts` — REST batch mutations & cache invalidations (M4)
- `backend/src/auth.ts` — User auth cache & permissions (M4)
- `web/src/app.tsx` — Router, route guards, public portal matchers, navigation (M1, M2)
- `web/src/components.tsx` — Reusable UI skeletons, empty states, 404 page (M1)
- `web/src/features/public-student-portal.tsx` — Redesigned public student portal (M2)
- `web/src/index.css` — Global CSS with `@media print` A4 stylesheet, batch print rules (M3)
- `web/src/features/reports/student-report-card-view.tsx` — Report card component with compact A4 layout (M3)
- `web/src/lib/boletim-pdf.ts` — Vector PDF generator via `jspdf` (M3)
- `web/src/features/reports/class-batch-boletim-view.tsx` — Batch student report card printable component (M3)
- `web/src/features/entity-detail-pages.tsx` — ClassDetailPage with spreadsheet mode & batch print (M3)
- `web/src/lib/use-events.ts` — Frontend SSE hook with entity-specific invalidation (M4)
- `web/src/lib/use-entity.ts` — Entity cache with account-level isolation (M4)
- `web/src/features/attendance-page.tsx` — Attendance page with draft edit protection (M4)
- `web/src/features/grades-page.tsx` — Grades page with draft edit protection (M4)
- `web/test/` & `backend/test/` — Concurrency and multi-browser automated tests (M5)
