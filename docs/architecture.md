# Arquitetura implementada

## Limites de confiança

O cliente opera como um PWA 100% online, e o Worker continua sendo a autoridade de autorização. A interface oculta ações proibidas e a API repete todas as verificações de papel, atribuição de turma e janela temporal. Um cliente modificado não consegue ampliar seu escopo apenas alterando a UI.

```mermaid
flowchart LR
  UI[React 19 PWA] --> REPO[LocalStore Dexie/IndexedDB]
  REPO --> DB[(IndexedDB Cifrado AES-GCM)]
  REPO --> PUSH[/api/sync/push - persistência online imediata]
  PUSH --> RBAC[RBAC + validação]
  RBAC --> D1[(Cloudflare D1)]
  D1 --> PULL[/api/sync/pull por cursor]
  PULL --> DB
```

## Segurança

- A chave local do perfil no IndexedDB usa criptografia AES-256-GCM não exportável pelo Web Crypto.
- O hash principal de autenticação usa **Web Crypto PBKDF2-HMAC-SHA256 (100.000 iterações)**, executando nativamente em < 1 ms no runtime V8/Workers.
- A sessão permanece ativa entre reinicializações do navegador: os tokens e dados mínimos do usuário ficam salvos no armazenamento local criptografado. Na abertura, o app restaura os dados e renova os tokens em segundo plano. Logout remove as credenciais locais.
- No D1, nome, CPF e contato usam AES-256-GCM com IV aleatório por valor. O segredo fica em `DATA_ENCRYPTION_KEY`.
- Access tokens são curtos (15 min); refresh tokens são aleatórios, guardados apenas como SHA-256 no D1 e rotacionados a cada uso.
- O bootstrap do primeiro admin requer segredo externo e fecha definitivamente depois do primeiro usuário.

## Persistência e Sincronização

As mutações realizadas pelo usuário são salvas de forma 100% online diretamente via `/api/sync/push`, persistindo no D1 em tempo real e mantendo o banco local como `SYNCED` sem acúmulo de fila offline ou divergências de versão.

O pull sincroniza dados do servidor via cursor monotônico (`sync_changes.seq`). Professores recebem apenas dados relacionados às turmas atribuídas.

## Decisões de plataforma

O sistema opera como um Progressive Web App (PWA) instalável (gerenciado via `vite-plugin-pwa` com Web App Manifest e Service Worker), porém com funcionamento 100% online. As mutações exigem conectividade com a API para salvar em tempo real diretamente no Cloudflare D1, garantindo consistência imediata entre todos os dispositivos.

## Operação

1. Configure o banco D1 em `backend/wrangler.toml`.
2. Configure `JWT_SECRET`, `DATA_ENCRYPTION_KEY` e `BOOTSTRAP_SECRET` com `wrangler secret put`.
3. Aplique `backend/src/schema.sql`.
4. Compile o frontend e faça deploy com `npm run deploy` em `backend/`.
5. Crie o primeiro administrador pelo endpoint de bootstrap e troque a senha inicial.
