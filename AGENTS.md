# AGENTS.md - Guide for AI Coding Agents

Welcome to **Frequência ITB**, an offline-first attendance control system developed for Instituto Transforma Brasil. This document serves as the authoritative guide for AI coding agents (Antigravity, Claude, Copilot, etc.) working on this codebase.

---

## 🏛️ System Architecture & Technology Stack

The project is structured as a monorepo containing a mobile/desktop client and a serverless Cloudflare Workers backend.

### Tech Stack
* **Client (`mobile_desktop/`)**: Flutter 3.32+ (targeting Windows & Android).
  * **Database**: Local SQLite with SQLCipher encryption.
  * **State Management & DI**: `provider`, `go_router`.
  * **Security**: AES-256-GCM encryption, `flutter_secure_storage`.
  * **Reporting & UI**: `pdf`, `printing`, `fl_chart`, `flutter_svg`.
* **Backend (`backend/`)**: Cloudflare Workers + D1 (Serverless SQLite).
  * **Language**: TypeScript (ES Module).
  * **Authentication**: Web Crypto PBKDF2 hashing (fast & V8 native) with Argon2id fallback, JWT tokens (`jose`).
  * **Testing**: Vitest.

---

## 📁 Repository Structure

```
itbFreq/
├── backend/                  # Cloudflare Workers REST API & D1 Database
│   ├── src/                  # Worker source code (routes, auth, sync engine, schema.sql)
│   ├── test/                 # Vitest test suite
│   ├── migrations/           # D1 SQL migrations
│   ├── wrangler.toml         # Cloudflare Worker configuration & D1 bindings
│   └── package.json          # Node.js dependencies & scripts
├── mobile_desktop/           # Flutter Client (Android & Windows)
│   ├── lib/                  # Application code (models, services, screens, widgets)
│   ├── test/                 # Flutter test suite
│   ├── third_party/          # Custom overrides (e.g., flutter_secure_storage_windows without ATL)
│   └── pubspec.yaml          # Flutter dependencies & configuration
├── docs/                     # Specifications, epic audit files, and documentation
├── artifacts/                # Local build outputs and test credentials
├── itb-logo.svg              # Official SVG brand asset
└── README.md                 # Project overview and quick start guide
```

---

## 🛠️ Verification & Command Reference

Before completing any task or committing changes, run the corresponding verification commands for the modified component.

### Backend (`cd backend`)
```powershell
# Type checking
npm run typecheck

# Run test suite (Vitest)
npm test

# Run local development server (Wrangler)
npm run dev

# Execute D1 schema locally
npx wrangler d1 execute frequencia-itb --local --file=src/schema.sql
```

### Mobile / Desktop (`cd mobile_desktop`)
```powershell
# Fetch dependencies
flutter pub get

# Run static analysis / linter
flutter analyze

# Run unit and widget tests
flutter test

# Run Windows application locally
flutter run -d windows --dart-define=API_URL=http://127.0.0.1:8787
```

---

## ⚠️ Important Constraints & Guardrails

1. **Offline-First Paradigm**:
   * All primary operations (creating records, logging attendance, managing users) MUST work without an active internet connection.
   * Remote synchronization should happen opportunistically in the background. Do not block the UI for network requests.
   * Preserve conflict resolution logic when modifying local DB models or sync payloads.

2. **Password Hashing & Performance**:
   * Primary password hashing uses Web Crypto PBKDF2-HMAC-SHA256 (100,000 iterations), which executes natively in C++/V8 under 1ms CPU time, compatible with both Cloudflare Workers Free and Paid tiers.
   * Argon2id is retained as a fallback for legacy hash verification.

3. **Windows Dependency Override**:
   * `flutter_secure_storage_windows` uses a local override in `third_party/flutter_secure_storage_windows` to avoid forcing Windows users to install Visual Studio ATL components. Do NOT remove this `dependency_overrides` section from `pubspec.yaml`.

4. **Database & API Schema Modifications**:
   * Any change to `backend/src/schema.sql` must be backwards-compatible or included as a D1 migration step in `backend/migrations/`.
   * Ensure local SQLCipher schemas in Flutter match the required sync contracts.

5. **No Blind Symptom Swallowing**:
   * Never wrap failing API calls or database operations in silent try-catch blocks that hide underlying errors.

6. **Mandatory Backend Re-analysis on Code & Data Changes**:
   * Whenever making edits or modifications to models, features, APIs, database tables, or contracts, a backend re-analysis MUST be performed. Verify alignment in `backend/src/`, write matching D1 migration scripts, and run backend tests (`npm run typecheck` & `npm test`).

7. **Version Synchronization (Mobile & Desktop)**:
   * Mobile (Android) and Desktop (Windows) clients MUST always share the exact same version number (in `mobile_desktop/pubspec.yaml` and `backend/package.json`), maintaining parity unless explicitly instructed otherwise.
