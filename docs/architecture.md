# Arquitetura implementada

## Limites de confiança

O cliente é offline-first, mas o Worker continua sendo a autoridade de autorização. A interface oculta ações proibidas e a API repete todas as verificações de papel, atribuição de turma e janela temporal. Um cliente modificado não consegue ampliar seu escopo apenas alterando a UI.

```mermaid
flowchart LR
  UI[React 19 PWA] --> REPO[LocalStore Dexie/IndexedDB]
  REPO --> DB[(IndexedDB Cifrado AES-GCM)]
  REPO --> Q[Fila de mutações offline]
  Q --> PUSH[/api/sync/push]
  PUSH --> RBAC[RBAC + versão base]
  RBAC --> D1[(Cloudflare D1)]
  RBAC -->|divergência| C[Central de conflitos]
  D1 --> PULL[/api/sync/pull por cursor]
  PULL --> DB
```

## Segurança

- A chave local do perfil no IndexedDB usa criptografia AES-256-GCM não exportável pelo Web Crypto.
- O hash principal de autenticação usa **Web Crypto PBKDF2-HMAC-SHA256 (100.000 iterações)**, executando nativamente em < 1 ms no runtime V8/Workers.
- A sessão permanece ativa entre reinicializações do navegador: os tokens e dados mínimos do usuário ficam salvos no armazenamento local criptografado. Na abertura, o app restaura imediatamente o cache, renova os tokens em segundo plano e mantém modo offline se a rede estiver indisponível. Logout remove as credenciais locais.
- No D1, nome, CPF e contato usam AES-256-GCM com IV aleatório por valor. O segredo fica em `DATA_ENCRYPTION_KEY`.
- Access tokens são curtos (15 min); refresh tokens são aleatórios, guardados apenas como SHA-256 no D1 e rotacionados a cada uso.
- O bootstrap do primeiro admin requer segredo externo e fecha definitivamente depois do primeiro usuário.

## Sincronização

Cada operação possui `operationId`, `baseVersion` e UUID local. O Worker persiste o resultado por `operationId`, portanto retries são seguros. Versões diferentes criam uma pendência em vez de aplicar last-write-wins. Para chamadas novas simultâneas, o servidor também compara a chave natural `(class_id, student_id, date)`.

O pull usa um cursor monotônico (`sync_changes.seq`). Antes de aplicar um evento remoto, o cliente protege registros que ainda estão na fila local. Professores recebem apenas dados relacionados às turmas atribuídas.

## Decisões de plataforma

O sistema opera integralmente como uma aplicação Web PWA moderna (React 19 + Vite + Workbox) distribuída diretamente pela infraestrutura de Cloudflare Workers Assets. O build é incorporado ao deploy do Worker, garantindo que cliente e backend estejam sempre perfeitamente sincronizados.

## Operação

1. Configure o banco D1 em `backend/wrangler.toml`.
2. Configure `JWT_SECRET`, `DATA_ENCRYPTION_KEY` e `BOOTSTRAP_SECRET` com `wrangler secret put`.
3. Aplique `backend/src/schema.sql`.
4. Compile o frontend e faça deploy com `npm run deploy` em `backend/`.
5. Crie o primeiro administrador pelo endpoint de bootstrap e troque a senha inicial.
