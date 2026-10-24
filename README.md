# ERPITB — Plataforma de Gestão Acadêmica, Financeira e Analítica

ERP do **Instituto Transforma Brasil**, composto por aplicação Web PWA (**React 19 + TypeScript + Vite**) 100% online e API REST serverless em **Cloudflare Workers + D1 (SQLite)**.

---

## Principais Módulos e Capacidades

- **Arquitetura Online REST (`/api/v1/*`)**:
  - Cloudflare D1 como autoridade canônica única de dados e regras de negócio.
  - Controle de concorrência otimista (`ETag` / `If-Match` com detecção de conflito HTTP 409).
  - Idempotência nativa (`x-idempotency-key`) para chamadas, baixas de mensalidades, lançamentos de caixa e estornos.
  - Invalidação de cache e revogação de sessão em tempo real via Server-Sent Events (`GET /api/v1/events`).
  - Drenagem automática e segura de filas legadas do navegador (`POST /api/v1/migration/drain`).
- **Gestão Acadêmica e Chamada Rápida**:
  - Chamada com ações rápidas inline (edição rápida de aluno, trancamento de matrícula preservando histórico e botão discreto `+` para inclusão imediata na turma).
  - Contabilização canônica de aulas ministradas (`class_sessions`) desacoplada dos registros individuais de presença.
  - Boletim escolar unificado (por turma e individual), gestão de etapas avaliativas e controle de reposições.
- **Domínio Financeiro Completo e RBAC de Menor Privilégio**:
  - Gestão de mensalidades (`financial_fees`) com geração individual ou em lote por turma, controle de competência, vencimento, baixa parcial/total e cálculo automático de inadimplência.
  - Livro Caixa (`cash_transactions`) com saldo inicial, entradas, saídas, saldo de fechamento e estornos compensatórios auditáveis (sem exclusão física).
  - Papel dedicado `financeiro` com isolamento estrito: acesso total à operação financeira e bloqueio (`403 Forbidden`) a dados pedagógicos (notas, frequência e anotações de aula).
  - Criptografia **AES-256-GCM** para dados sensíveis (CPF e contatos de alunos e responsáveis financeiros).
- **Identidade Visual (Branding), Chaves M2M e OpenAPI**:
  - Painel administrativo (`/admin/branding`) com validação de contraste **WCAG 2.1 AA**, logotipo, plano de fundo de login e marca d'água para impressões A4 (`.print-portrait` e `.print-landscape`).
  - Gestão de Chaves de API M2M (`/admin/api-keys`) com escopos granulares, rotação, revogação e proteção de PII (`students:pii`).
  - Especificação OpenAPI 3.0 disponível em `GET /api/v1/openapi.json`.

---

## Estrutura do Repositório

- `backend/`: API REST `/api/v1/*` em Cloudflare Workers, autenticação PBKDF2/JWT/API Keys, RBAC, serviços de domínio (acadêmico, financeiro, B.I., relatórios, SSE) e migrações D1.
- `web/`: Aplicação Web PWA em React 19 + TypeScript (shell instalável 100% online), módulos operacionais, financeiro, B.I., administração e layouts de impressão A4.
- `docs/`: Documentação de arquitetura, contratos de API, segurança e guia de operação (`docs/architecture.md`).

---

## Desenvolvimento e Verificação

### 1. Backend Worker (`backend/`)

```bash
cd backend
npm install
npm run typecheck  # Validação estática de tipos TypeScript
npm test           # Suíte de testes unitários, RBAC, concorrência, idempotência e integração (Vitest)
npm run dev        # Servidor local do Cloudflare Worker (Wrangler na porta 8787)
```

Para inicializar o schema completo no banco D1 local:

```bash
npx wrangler d1 execute erpitb --local --file=src/schema.sql
```

### 2. Aplicação Web (`web/`)

```bash
cd web
npm install
npx tsc -b         # Validação estática de tipos TypeScript
npm test           # Suíte de testes unitários, componentes e E2E (Vitest)
npm run dev        # Servidor Vite local com proxy para o Worker (8787)
npm run build      # Gera o bundle de produção em web/dist
```

### 3. Build & Deploy Completo

A partir do diretório `backend/`:

```bash
npm run deploy     # Compila o PWA (web/dist) e publica no Cloudflare Worker
```

---

## Bootstrap do Primeiro Administrador

Com o Worker em execução e `BOOTSTRAP_SECRET` configurado:

```bash
curl -X POST http://127.0.0.1:8787/auth/bootstrap \
  -H "X-Bootstrap-Secret: troque-este-segredo" \
  -H "Content-Type: application/json" \
  -d '{"name":"Administrador","email":"admin@itb.org.br","password":"Senha Forte 123!"}'
```

O endpoint de bootstrap é automaticamente desabilitado após a criação do primeiro usuário no banco de dados.
