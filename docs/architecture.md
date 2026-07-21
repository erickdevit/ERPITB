# Arquitetura implementada

## Limites de confiança

O cliente é offline-first, mas o Worker continua sendo a autoridade de autorização. A interface oculta ações proibidas e a API repete todas as verificações de papel, atribuição de turma e janela temporal. Um cliente modificado não consegue ampliar seu escopo apenas alterando a UI.

```mermaid
flowchart LR
  UI[Flutter adaptativo] --> REPO[Repositório local]
  REPO --> DB[(SQLCipher)]
  REPO --> Q[Fila idempotente]
  Q --> PUSH[/sync/push]
  PUSH --> RBAC[RBAC + versão base]
  RBAC --> D1[(Cloudflare D1)]
  RBAC -->|divergência| C[Central de conflitos]
  D1 --> PULL[/sync/pull por cursor]
  PULL --> DB
```

## Segurança

- A chave local aleatória tem 256 bits, fica em `flutter_secure_storage` e nunca é gravada no banco.
- O app aborta a abertura se `PRAGMA cipher_version` não provar que SQLCipher está ativo.
- O login offline usa Argon2id (19 MiB, 2 iterações, paralelismo 1) e só é habilitado depois de um login online válido.
- A sessão permanece ativa entre reinicializações no Windows e Android: o refresh token fica no armazenamento seguro do sistema e os dados mínimos do usuário no banco local criptografado. Na abertura, o app restaura imediatamente o cache, renova os tokens em segundo plano e mantém modo offline se a rede estiver indisponível. Logout ou expiração removem os tokens e impedem a restauração automática.
- No D1, nome, CPF e contato usam AES-256-GCM com IV aleatório por valor. O segredo fica em `DATA_ENCRYPTION_KEY`.
- Access tokens são curtos; refresh tokens são aleatórios, guardados apenas como SHA-256 no D1 e rotacionados a cada uso.
- O bootstrap do primeiro admin requer segredo externo e fecha definitivamente depois do primeiro usuário.

O hash Argon2id puro consome muito mais que os 10 ms permitidos pelo Workers Free. O `wrangler.toml` define 5 segundos de CPU e, portanto, esta implementação de autenticação requer Workers Paid. Para permanecer no plano gratuito, substitua `/auth/*` por um provedor de identidade externo e mantenha no Worker apenas a validação do token.

## Sincronização

Cada operação possui `operationId`, `baseVersion` e UUID local. O Worker persiste o resultado por `operationId`, portanto retries são seguros. Versões diferentes criam uma pendência em vez de aplicar last-write-wins. Para chamadas novas simultâneas, o servidor também compara a chave natural `(class_id, student_id, date)`.

O pull usa um cursor monotônico (`sync_changes.seq`). Antes de aplicar um evento remoto, o cliente protege registros que ainda estão na fila local. Professores recebem apenas dados relacionados às turmas atribuídas.

## Decisões de plataforma

`sqflite_sqlcipher` foi substituído por `sqlite3` + `sqlcipher_flutter_libs` porque o primeiro não suporta Windows. A versão `0.6.8` da biblioteca nativa foi fixada intencionalmente: a linha mais recente marcada como EOL não inclui mais os binários SQLCipher.

No Android, o mínimo é API 23, backup está desativado e tráfego HTTP sem TLS só é permitido no manifest de debug. Produção deve usar o Worker via HTTPS.

## Operação

1. Crie o D1 e substitua `database_id` em `backend/wrangler.toml`.
2. Configure `JWT_SECRET`, `DATA_ENCRYPTION_KEY` e `BOOTSTRAP_SECRET` com `wrangler secret put`.
3. Aplique `backend/src/schema.sql`.
4. Faça deploy do Worker e compile o app com `--dart-define=API_URL=https://...`.
5. Crie o primeiro administrador pelo endpoint de bootstrap e troque a senha inicial.
