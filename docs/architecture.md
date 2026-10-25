# Arquitetura do ERPITB — Autoridade Online REST v1

## 1. Visão Geral e Limites de Confiança

O **ERPITB** opera sob o paradigma **100% online orientado por API REST versionada (`/api/v1/*`)**, onde o backend serverless (**Cloudflare Workers**) e o banco relacional **Cloudflare D1 (SQLite)** constituem a única autoridade canônica para persistência, controle de concorrência, cálculos de negócio e autorização (RBAC/escopos).

O cliente Web PWA (**React 19 + TypeScript + Vite**) mantém o Service Worker exclusivamente para instalação e cache de ativos estáticos do shell (HTML, CSS, JS, ícones), sem utilizar IndexedDB como banco de dados operacional permanente. Qualquer fila legada eventualmente presente em dispositivos antigos é drenada de forma segura para `/api/v1/migration/drain` antes da limpeza local.

```mermaid
flowchart LR
  UI["React 19 PWA (Shell Estático + Cache em Memória)"] --> REST["API REST /api/v1/* (ETag / If-Match / Idempotency-Key)"]
  SSE["SSE /api/v1/events"] --> UI
  REST --> AUTH["Auth JWT + API Keys M2M + RBAC"]
  AUTH --> SERVICES["Serviços de Domínio (Acadêmico, Financeiro, BI, Branding)"]
  SERVICES --> D1[("Cloudflare D1 (Fonte Canônica)")]
  D1 --> SSE
```

---

## 2. Contratos da API `/api/v1/*`, Concorrência e Idempotência

### 2.1. Endpoints Versionados (`/api/v1/*` e `/v1/*`)
- **Especificação OpenAPI 3.0**: `GET /api/v1/openapi.json`
- **Eventos em Tempo Real (SSE)**: `GET /api/v1/events` (suporta `Last-Event-ID` e `?since=` para replay de `system_events` persistidos no D1: `entity_changed`, `branding_updated`, `session_revoked`, `ping`).
- **Acadêmico e Catálogo**:
  - `GET/POST/PATCH /api/v1/students`, `POST /api/v1/students/:id/lock` (trancamento de matrícula preservando histórico).
  - `GET/POST/PATCH /api/v1/classes`, `GET/POST /api/v1/classes/:id/sessions` (sessões de aula ministradas canônicas em `class_sessions`).
  - `GET/POST /api/v1/attendance` (registro de chamada com geração automática de sessão em `class_sessions`).
  - `GET/POST/PATCH/DELETE /api/v1/grade-tables`, `/api/v1/grade-items`, `GET/POST /api/v1/student-grades`.
  - `GET/POST/PATCH /api/v1/replacements`, `POST /api/v1/replacements/:id/complete` (conclusão atômica da reposição + atualização de presença para `RC`).
- **Domínio Financeiro**:
  - `GET /api/v1/finance/summary`
  - `GET/POST/PATCH /api/v1/finance/fees` (geração individual ou em lote por turma/competência).
  - `POST /api/v1/finance/fees/:id/pay` (baixa total ou parcial em centavos inteiros + lançamento vinculado no caixa).
  - `POST /api/v1/finance/fees/:id/reverse` (estorno compensatório sem exclusão física).
  - `GET/POST /api/v1/finance/cash`, `POST /api/v1/finance/cash/:id/reverse`.
  - `GET/PUT /api/v1/finance/contacts/:studentId` (dados do responsável financeiro cifrados com AES-256-GCM).
- **Analytics, B.I. e Relatórios Server-Side**:
  - `GET /api/v1/analytics` (métricas acadêmicas, frequência, risco, reposições e financeiro pré-calculadas no servidor).
  - `GET /api/v1/reports` (`attendance`, `grades`, `classBoletim`, `studentBoletim`, `courses`, `SystemLogs`, `fees`, `financial`, `cash`).
- **Administração, Branding e Chaves M2M**:
  - `GET /api/v1/branding`, `PUT /api/v1/admin/branding`, `POST /api/v1/admin/branding/reset`.
  - `GET/POST /api/v1/admin/api-keys`, `DELETE /api/v1/admin/api-keys/:id`, `POST /api/v1/admin/api-keys/:id/rotate`.

### 2.2. Controle de Concorrência Otimista (`ETag` / `If-Match`)
- Entidades mutáveis possuem coluna `version` monotônica e retornam o cabeçalho `ETag: W/"<version>"`.
- Mutações (`PUT`, `PATCH`, `POST` de atualização) aceitam `If-Match: W/"<version>"` ou `expectedVersion` no payload.
- Em caso de divergência de versão, o servidor rejeita a escrita com **HTTP 409 Conflict** (`code: "CONCURRENCY_CONFLICT"`) e retorna o estado atual do servidor (`currentVersion`, `serverState`).

### 2.3. Idempotência (`x-idempotency-key`)
- Operações críticas (chamada, pagamentos, lançamentos de caixa, estornos, geração de mensalidades) suportam o cabeçalho `x-idempotency-key`.
- A tabela `idempotency_keys` utiliza chave primária composta `(user_id, key)` com hash SHA-256 do payload (`request_hash`).
- Repetições com o mesmo payload retornam a resposta original com `"duplicate": true`; reutilização da mesma chave com payload distinto retorna **HTTP 422** (`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`).

---

## 3. Segurança, Criptografia (LGPD) e Matriz RBAC

### 3.1. Criptografia e Autenticação
- **Senhas**: `PBKDF2-HMAC-SHA256` (100.000 iterações via Web Crypto nativo) com upgrade transparente de hashes legados Argon2id no login.
- **Dados Sensíveis (LGPD)**: CPF e telefone/contato de alunos (`students`) e de responsáveis financeiros (`financial_contacts`) são cifrados em repouso no D1 com **AES-256-GCM** e IV aleatório único por campo (`DATA_ENCRYPTION_KEY`).
- **Chaves de API M2M (`api_keys`)**: Geradas com alta entropia (`erpitb_live_...`), exibidas uma única vez na criação/rotação e armazenadas exclusivamente como hash SHA-256 no D1. Chaves sem o escopo explícito `students:pii` recebem dados pessoais mascarados/redigidos.

### 3.2. Matriz RBAC de Menor Privilégio

| Papel | Acadêmico (Chamada, Notas, Boletim) | Catálogo (Cursos, Turmas, Alunos) | Financeiro (Mensalidades, Caixa, Estornos) | Admin (Usuários, Branding, API Keys) |
| :--- | :---: | :---: | :---: | :---: |
| **`admin`** | Leitura e Escrita total | Leitura e Escrita total | Leitura e Escrita total | Leitura e Escrita total |
| **`pedagogico`** | Leitura e Escrita total | Leitura e Escrita total | Leitura gerencial (sem operar caixa) | Sem acesso (`403`) |
| **`professor`** | Leitura e Escrita nas turmas atribuídas | Leitura das turmas atribuídas | Sem acesso (`403`) | Sem acesso (`403`) |
| **`financeiro`** | **Bloqueado (`403`)** (Zero acesso a notas/chamada/observações) | Leitura de matrícula/identificação para cobrança | **Leitura e Escrita total** | Sem acesso (`403`) |

---

## 4. Regras de Negócio no Servidor

1. **Sessões de Aula (`class_sessions`) vs. Registros de Presença (`attendance_records`)**:
   - Cada aula ministrada gera um registro canônico em `class_sessions (class_id, date)`. O total de aulas ministradas da turma é desacoplado da quantidade de linhas individuais de presença.
2. **Trancamento de Matrícula (`status = 'trancada'`)**:
   - Retira o aluno das folhas de chamada futuras, mantendo intacto todo o histórico de presenças, notas e mensalidades anteriores.
3. **Integridade Contábil do Caixa e Mensalidades**:
   - Todos os valores monetários são processados e armazenados em **centavos inteiros** (`amount_cents`, `paid_amount_cents`).
   - Baixas de mensalidades geram automaticamente entradas vinculadas em `cash_transactions`.
   - Não há exclusão física (`DELETE`) de lançamentos financeiros: correções exigem justificativa obrigatória e geram lançamentos compensatórios de estorno (`is_reversal = 1`, `reversed_from_id`) registrados em `audit_logs`.
4. **Identidade Visual & Impressão A4**:
   - A cor de destaque configurada em `/admin/branding` passa por validação de luminância relativa **WCAG 2.1 AA** no servidor e injeta tokens CSS (`--brand-accent`, `--brand-accent-text`, `--brand-accent-subtle`).
   - Relatórios suportam orientação específica (`.print-portrait` e `.print-landscape`) e marca d'água institucional (`.print-watermark`).

---

## 5. Guia de Implantação, Migração e Rollback

1. **Aplicar Migrações D1**:
   ```bash
   cd backend
   npx wrangler d1 execute erpitb --local --file=src/schema.sql
   # Ou aplicar migrações incrementais:
   npx wrangler d1 migrations apply erpitb --local
   ```
2. **Verificação Pré-Deploy**:
   ```bash
   cd backend && npm run typecheck && npm test
   cd ../web && npx tsc -b && npm test && npm run build
   ```
3. **Drenagem Segura de Clientes Legados**:
   - Ao abrir a nova versão, `drainLegacyClientStorage` inspeciona bancos IndexedDB antigos (`erpitb-pwa`, `frequencia-itb-pwa`), envia qualquer operação pendente para `POST /api/v1/migration/drain` e só limpa a fila local após confirmação HTTP 200 do servidor.
4. **Rollback Seguro**:
   - As migrações `0012` e `0013` são estritamente aditivas (novas tabelas e colunas com valores padrão compatíveis), preservando compatibilidade com os dados existentes no D1.

---

## 6. Medições de Desempenho (Antes vs. Depois) e Limites Cloudflare Workers/D1

### 6.1 Comparativo de Bundle, Requisições e Latência (Fase 11)

| Métrica | Arquitetura Anterior (`sync` + Dexie + Cálculo Local) | Arquitetura Online `/api/v1/*` (Autoridade D1 + Lazy Loading) | Ganho / Impacto |
| :--- | :--- | :--- | :--- |
| **Bundle JS Principal (`index-*.js`)** | `1.123,77 kB` (`340,77 kB` gzip) — continha `jspdf`, `html2canvas` e `recharts` estaticamente acoplados | **Desacoplado em chunks sob demanda**: `index-*.js` (`401,22 kB` / `130,89 kB` gzip), `vendor-charts` (`427,04 kB` / `122,89 kB` gzip), `vendor-pdf` (`588,99 kB` / `174,46 kB` gzip, carregado apenas ao exportar PDF) e `vendor-excel` (`936,96 kB` / `270,73 kB` gzip, carregado apenas ao exportar `.xlsx`) | **Redução de 64,3% no bundle JS inicial** (`-722,55 kB` brutos / `-209,88 kB` gzip) |
| **Requisições no Bootstrap Inicial** | `POST /sync/pull` trazendo histórico completo de todas as tabelas para gravar em IndexedDB + recriptografia AES-GCM local por registro | Leitura paginada/filtrada por rota (`/v1/classes`, `/v1/students`, `/v1/branding`) + stream SSE único (`/v1/events/stream`) | **Eliminação do bloqueio de CPU/IndexedDB no carregamento**; tempo de hidratação inicial reduzido de `O(N_total)` para `O(N_página)` |
| **Cálculo de BI, Relatórios e Boletim** | Executado na thread principal do navegador sobre arrays completos em memória (`buildBiDataset`, `buildReportView`) | Calculado no servidor via SQL parametrizado em D1 (`GET /v1/analytics`, `GET /v1/reports`, `GET /v1/students/:id/boletim`, `GET /v1/classes/:id/boletim`) | **Zero travamento de UI (jank)** em bases com milhares de presenças e lançamentos financeiros |
| **Sincronização entre Abas / Sessões** | Polling manual ou recarga via `/sync/pull` | Server-Sent Events (`GET /v1/events/stream`) com replay por cursor D1 (`system_events` + `Last-Event-ID`) | Atualização reativa em `< 150ms` após mutação em outra aba/usuário |

### 6.2 Limites Operacionais do Cloudflare Workers e D1

1. **CPU Time por Requisição no Cloudflare Workers**:
   - Limite padrão: `10ms` (plano Free) a `30s` (plano Paid Standard).
   - **Mitigação implementada**: Hashing de senhas utiliza `Web Crypto PBKDF2-HMAC-SHA256` (100.000 iterações nativas em C++/V8, `< 1ms` de CPU), e consultas analíticas usam agregações SQL indexadas no D1 em vez de loops pesados em JavaScript.
2. **Limites de Variáveis Bound no SQLite / D1 (`SQLITE_MAX_VARIABLE_NUMBER`)**:
   - O D1 limita o número de parâmetros posicionais por statement SQL (~100 parâmetros por query no ambiente Workers D1).
   - **Mitigação implementada**: Operações em lote (`POST /v1/entities/batch`, geração de parcelas mensais em `/v1/finance/fees/generate` e lançamento de chamadas) utilizam `env.DB.batch(statements)` com statements parametrizados individuais executados atomicamente em uma única transação D1.
3. **Conexões SSE (`GET /v1/events/stream`) e Isolates Efêmeros**:
   - Como o Cloudflare Workers pode distribuir requisições entre múltiplos isolates ou encerrar conexões longas, o barramento de eventos (`backend/src/events-bus.ts` + `backend/src/events-service.ts`) persiste cada evento de domínio na tabela `system_events` do D1.
   - Caso a conexão SSE reconecte em outro isolate, o parâmetro `?since=<lastId>` ou header `Last-Event-ID` recupera do D1 todos os eventos perdidos, garantindo entrega consistente sem perda de invalidação de cache.

