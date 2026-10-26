# AGENTS.md - Guide for AI Coding Agents

Welcome to **ERPITB**, an ERP platform developed for Instituto Transforma Brasil. This document serves as the authoritative guide for AI coding agents (Antigravity, Claude, Copilot, etc.) working on this codebase.

---

## 🏛️ System Architecture & Technology Stack

The project is structured as a monorepo containing a Web PWA client and a serverless Cloudflare Workers backend.

### Tech Stack
* **Client (`web/`)**: React 19 + TypeScript PWA (built with Vite + `vite-plugin-pwa`, installable Progressive Web App with Service Worker and Web App Manifest).
  * **Database & Persistence**: IndexedDB managed with Dexie.js and client-side AES-256-GCM encryption. Operates 100% online: mutations save immediately to the backend API (`/sync/push`) and store canonically as `SYNCED` locally, eliminating background sync queue backlog and divergence.
  * **Routing & State**: React Router, custom reactive stores and hooks (`useSyncExternalStore`).
  * **Styling & Assets**: Tailwind CSS, Lucide React icons, official SVG brand assets.
  * **Reporting & Analytics**: `jspdf`, `exceljs`, `html2canvas`, DOMPurify, custom B.I. analytics engines.
  * **Deployment**: Direct Cloudflare Workers SPA static assets delivery.
  * **Testing**: Vitest + React Testing Library.
* **Backend (`backend/`)**: Cloudflare Workers + D1 (Serverless SQLite).
  * **Language**: TypeScript (ES Module).
  * **Authentication**: Web Crypto PBKDF2 hashing (fast & V8 native, 100k iterations) with legacy Argon2id fallback, JWT tokens (`jose`).
  * **Security**: AES-256-GCM encryption with randomized IVs for sensitive student data (CPF, contact info).
  * **Testing**: Vitest.

---

## 📁 Repository Structure

```
itbFreq/
├── backend/                  # Cloudflare Workers REST API & D1 Database
│   ├── src/                  # Worker source code (routes, auth, sync engine, data models, schema.sql)
│   ├── test/                 # Vitest test suite (integration, auth, RBAC, sync)
│   ├── migrations/           # D1 SQL migrations
│   ├── wrangler.toml         # Cloudflare Worker configuration & D1 bindings
│   └── package.json          # Node.js dependencies & scripts
├── web/                      # React 19 + TypeScript Offline-First Web PWA
│   ├── src/                  # Application code (features, components, models, sync engine, reports)
│   │   ├── features/         # Feature modules (attendance, students, classes, catalog, users, B.I., audit)
│   │   ├── lib/              # Core libraries (api client, crypto, dexie store, sync engine, reports)
│   │   └── main.tsx          # PWA entry point
│   ├── public/               # Static assets & web manifest
│   ├── index.html            # SPA template
│   ├── vite.config.ts        # Vite + PWA configuration & local API proxy
│   └── package.json          # Web dependencies & scripts
├── docs/                     # Specifications, architecture, and documentation
├── artifacts/                # Local build outputs
├── itb-logo.svg              # Official SVG brand asset
└── README.md                 # Project overview and quick start guide
```

---

## 🛠️ Verification & Command Reference

Before completing any task or committing changes, run the corresponding verification commands for the modified component.

### Web PWA (`cd web`)
```bash
# Type checking
npx tsc -b

# Run unit and component tests
npm test

# Run local development server (with proxy to backend)
npm run dev

# Build production PWA bundle
npm run build
```

### Backend (`cd backend`)
```bash
# Type checking
npm run typecheck

# Run test suite (Vitest)
npm test

# Run local development server (Wrangler)
npm run dev

# Execute D1 schema locally
npx wrangler d1 execute erpitb --local --file=src/schema.sql

# Deploy Worker and Web Assets
npm run deploy
```

---

## ⚠️ Important Constraints & Guardrails

1. **100% Online PWA Paradigm**:
   * The application is an installable PWA that operates 100% online.
   * All primary mutations (creating records, logging attendance, managing users, recording replacements) are dispatched immediately to the backend API (`/sync/push`) and saved canonically as `SYNCED`, preventing local/remote divergence and queue backlog.
   * Dexie/IndexedDB provides secure client-side caching of synced state, avoiding background sync delays or merge conflicts.

2. **Password Hashing & Performance**:
   * Primary password hashing uses Web Crypto PBKDF2-HMAC-SHA256 (100,000 iterations), which executes natively in C++/V8 under 1ms CPU time, fully compatible with Cloudflare Workers limits.
   * Legacy hashes are automatically upgraded to PBKDF2 on successful login.

3. **Data Encryption (LGPD / Privacy)**:
   * Sensitive student information (CPF, phone/contact) is encrypted locally and in D1 using AES-256-GCM with distinct IVs. Public or unauthenticated queries MUST NEVER expose unencrypted sensitive fields.

4. **Database & API Schema Modifications**:
   * Any change to `backend/src/schema.sql` must be backwards-compatible or included as a D1 migration step in `backend/migrations/`.
   * Ensure local Dexie schemas match the required sync contracts and canonical entities.

5. **No Blind Symptom Swallowing**:
   * Never wrap failing API calls or database operations in silent try-catch blocks that hide underlying errors.

6. **Mandatory Backend Re-analysis on Code & Data Changes**:
   * Whenever making edits or modifications to models, features, APIs, database tables, or contracts, a backend re-analysis MUST be performed. Verify alignment in `backend/src/`, write matching D1 migration scripts, and run backend tests (`npm run typecheck` & `npm test`).

7. **Zero-Quota-Exhaustion Architecture (Strict Anti-Lockout Rule)**:
   * **Absolute Prohibition of Unbounded Loops & Recursive Calls**:
     - No client-side effect, callback, or hook may ever trigger recursive API retries or repeated authentication flows upon encountering errors (HTTP 401, 403, 429, 500, 503).
     - Authentication paths (`/auth/*`) MUST NEVER attempt automatic token refresh nor recursively trigger logout notifications (`onUnauthorized`).
     - Real-time listeners (`EventSource` SSE) MUST implement backoff delay (minimum 15s) upon connection failures instead of tight native browser reconnection loops.
   * **Client-Side Circuit Breaker**:
     - All API clients (`ApiClient`) MUST enforce a circuit breaker tripping after consecutive failed calls (e.g. 15 errors), suspending outbound traffic for 10 seconds to prevent unintentional denial-of-service against the backend.
   * **In-Memory Caching for Hot Paths & D1 Quota Protection**:
     - The Worker MUST NOT query D1 for verified, immutable, or short-lived state on every single request. User active status for cryptographically verified JWTs MUST be cached in Worker memory (60-second TTL), reducing database row reads by 95%+.
     - If D1 is temporarily unavailable or quota-limited, cryptographically verified JWT claims MUST serve as a graceful fallback for authenticated requests, ensuring existing sessions are never locked out.
   * **Graceful Offline Fallback & Session Preservation**:
     - Service unavailability (HTTP 503, `DATABASE_QUOTA_EXCEEDED`, network outages) MUST NEVER wipe local user sessions in `useBoot` or IndexedDB. Only explicit HTTP 401 from a working server may clear local sessions.
     - The login flow MUST allow fallback to cached local credentials (`LocalStore.openOffline`) when the backend is unreachable or over quota, preserving user access to previously synchronized local data on the device.
   * **Worker-Level Rate Limiting**:
     - All auth endpoints (`/auth/*`) MUST enforce per-IP in-memory sliding window rate limits (max 60 req/min) to prevent brute-force attacks or malfunctioning clients from depleting D1 read/write quotas.
