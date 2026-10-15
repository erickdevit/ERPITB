# Frequência ITB

Sistema de controle de frequência do Instituto Transforma Brasil, composto por aplicação Web PWA (React 19 + TypeScript) 100% online e API serverless em Cloudflare Workers + D1.

## Produção

- **Aplicação & API**: `https://freq.itbcursos.com`
- **Banco D1**: `frequencia-itb` (`be668f55-5a2c-40a2-9cdc-25248be7e65e`)
- **Autenticação**: Web Crypto PBKDF2-HMAC-SHA256 (100.000 iterações, nativo V8 < 1ms) com fallback legado para Argon2id

## Estrutura do Repositório

- `backend/`: API REST em Cloudflare Workers, autenticação JWT, RBAC, criptografia AES-256-GCM para dados sensíveis e motor de dados.
- `web/`: Aplicação Web PWA em React 19 + TypeScript (instalável via webmanifest e service worker, operação 100% online), IndexedDB cifrado (Dexie), relatórios (PDF, Excel, CSV) e dashboards analíticos de B.I.
- `itb-logo.svg`: Ativo oficial da marca Instituto Transforma Brasil.
- `.github/workflows/ci.yml`: Pipeline de CI/CD para backend e web.

## Desenvolvimento Rápido

### 1. Aplicação Web (`web/`)

```bash
cd web
npm install
npm run dev        # Executa com proxy apontando para backend local (8787)
npm run dev:real   # Executa com proxy apontando para a API de produção
npm test           # Executa a suíte de testes unitários e de componentes
npm run build      # Gera o bundle de produção em web/dist
```

### 2. Backend Worker (`backend/`)

```bash
cd backend
npm install
npm run typecheck  # Validação estática de tipos TypeScript
npm test           # Executa os testes de integração e unitários (Vitest)
npm run dev        # Inicia o servidor local do Cloudflare Worker (Wrangler)
```

Para aplicar o schema no banco D1 local:

```bash
npx wrangler d1 execute frequencia-itb --local --file=src/schema.sql
```

### 3. Build & Deploy Completo

A partir do diretório `backend/`:

```bash
npm run deploy     # Compila o PWA (web/dist) e publica no Cloudflare Worker
```

## Bootstrap do Primeiro Administrador

Com o Worker em execução e `BOOTSTRAP_SECRET` configurado:

```bash
curl -X POST http://127.0.0.1:8787/auth/bootstrap \
  -H "X-Bootstrap-Secret: troque-este-segredo" \
  -H "Content-Type: application/json" \
  -d '{"name":"Administrador","email":"admin@itb.org.br","password":"Senha Forte 123!"}'
```

O endpoint de bootstrap é automaticamente desabilitado após a criação do primeiro usuário no banco de dados.
