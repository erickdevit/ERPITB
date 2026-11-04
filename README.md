# opschool — Academic, Financial, and Analytical School Management Platform

Modular school management platform, agnostic to the institution and with native multi-branding support (each school configures its own brand, logo, colors, and visual identity). It is composed of a web PWA and a Cloudflare Workers + D1 backend, designed for operational efficiency, institutional autonomy, and privacy-conscious data handling.

---

## Docker & PostgreSQL Execution (Recommended)

The application has been ported to a lightweight multi-stage Docker container (`node:22-alpine`, non-root user `node`, ~400KB esbuild bundle), with a relational **PostgreSQL 16** database and persistent storage. The runtime is optimized for local execution and quick startup.

### 1. Start with Docker Compose

```bash
# Copy environment variables
cp .env.example .env

# Start PostgreSQL and the application containers
docker compose up -d
```

The services started are:
- `opschool-postgres`: PostgreSQL 16 Alpine with persistent volume `postgres_data` on port `5432`.
- `opschool-app`: Unified application (REST API + Web PWA) with persistent file volume `storage_data` on port `3000`.

### 2. Verify container health

```bash
docker compose ps
curl http://127.0.0.1:3000/health
```

### 3. Bootstrap the first administrator on Docker

With the containers running:

```bash
curl -X POST http://127.0.0.1:3000/auth/bootstrap \
  -H "X-Bootstrap-Secret: change-this-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Administrator","email":"admin@opschool.local","password":"YourStrongPassword123!"}'
```

After bootstrap, open `http://localhost:3000` in your browser to use the system.

---

## Main Modules and Capabilities

- **Online REST Architecture (`/api/v1/*`)**:
  - Cloudflare D1 as the single canonical source of truth for data and business rules.
  - Optimistic concurrency control (`ETag` / `If-Match` with HTTP 409 conflict detection).
  - Native idempotency (`x-idempotency-key`) for fee collections, cash entries, and reversals.
  - Cache invalidation and real-time session revocation via Server-Sent Events (`GET /api/v1/events`).
  - Automatic and safe draining of legacy browser queues (`POST /api/v1/migration/drain`).
- **Academic Management and Quick Attendance**:
  - Attendance with inline quick actions (rapid student editing, enrollment suspension while preserving history, and a discreet `+` button for immediate inclusion in the class).
  - Canonical accounting of taught classes (`class_sessions`) decoupled from individual attendance records.
  - Unified gradebook (by class and by student), evaluation stage management, and replacement tracking.
- **Complete Financial Domain and Least-Privilege RBAC**:
  - Tuition management (`financial_fees`) with individual or bulk generation by class, competence control, due date management, partial/total payment settlement, and automatic delinquency calculation.
  - Cash book (`cash_transactions`) with opening balance, inflows, outflows, closing balance, and auditable compensatory reversals (without physical deletion).
  - Dedicated `financeiro` role with strict isolation: complete access to financial operations and blocking (`403 Forbidden`) of academic data (grades, attendance, and class notes).
  - **AES-256-GCM** encryption for sensitive data (CPF and student or financial guardian contact information).
- **Visual Identity (Branding), M2M Keys, and OpenAPI**:
  - Administrative panel (`/admin/branding`) with **WCAG 2.1 AA** contrast validation, logo upload, login background, and watermark configuration for A4 prints (`.print-portrait` and `.print-landscape`).
  - Management of M2M API Keys (`/admin/api-keys`) with granular scopes, rotation, revocation, and PII protection (`students:pii`).
  - OpenAPI 3.0 specification available at `GET /api/v1/openapi.json`.

---

## Repository Structure

- `backend/`: REST API `/api/v1/*` on Cloudflare Workers, authentication with PBKDF2/JWT/API Keys, RBAC, domain services (academic, financial, BI, reporting, SSE), and D1 migrations.
- `web/`: React 19 + TypeScript PWA application (fully online installable shell), operational modules, finance, BI, administration, and A4 print layouts.
- `docs/`: Architecture documentation, API contracts, security notes, and operations guide (`docs/architecture.md`).

---

## Development and Verification

### 1. Backend Worker (`backend/`)

```bash
cd backend
npm install
npm run typecheck  # Static TypeScript validation
npm test           # Unit, RBAC, concurrency, idempotency, and integration test suite (Vitest)
npm run dev        # Local Cloudflare Worker server (Wrangler on port 8787)
```

To initialize the complete schema in the local D1 database:

```bash
npx wrangler d1 execute opschool --local --file=src/schema.sql
```

### 2. Web Application (`web/`)

```bash
cd web
npm install
npx tsc -b         # Static TypeScript validation
npm test           # Unit, component, and UI test suite (Vitest)
npm run dev        # Local Vite dev server with Worker proxy (port 8787)
npm run build      # Generates the production bundle in web/dist
```

### 3. Full Build & Deploy

From the `backend/` directory:

```bash
npm run deploy     # Builds the PWA (web/dist) and publishes it to the Cloudflare Worker
```

---

## Bootstrap the First Administrator

With the Worker running and `BOOTSTRAP_SECRET` configured:

```bash
curl -X POST http://127.0.0.1:8787/auth/bootstrap \
  -H "X-Bootstrap-Secret: change-this-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Administrator","email":"admin@opschool.local","password":"StrongPassword 123!"}'
```

The bootstrap endpoint is automatically disabled after the first user is created in the database.
