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
