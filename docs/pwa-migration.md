# Migração e Transição para Web PWA (Concluída)

O cliente oficial da aplicação é `web/`, uma Web PWA React/TypeScript integrada e publicada diretamente pelo Cloudflare Worker em `https://freq.itbcursos.com`. A versão legada em Flutter foi completamente descontinuada e removida do repositório.

## Segurança e uso offline

Após um login válido, a PWA gera uma chave AES-GCM não exportável para aquela conta e perfil do navegador. Registros, fila de sincronização e tokens de sessão são cifrados no IndexedDB. A sessão persistida reabre o cache automaticamente no mesmo perfil; logout apaga a chave e todos os dados locais da conta.

O service worker armazena o application shell e os recursos estáticos. Dados institucionais são gravados primeiro no banco local cifrado (Dexie / IndexedDB) e enviados em segundo plano com o protocolo de `operationId`, versão base, cursor e resolução de conflitos.

## Desenvolvimento e deploy

```bash
cd web
npm install
npm run build

cd ../backend
npm run typecheck
npm test
npm run deploy
```

O Worker publica os assets compilados em `web/dist` e atende as chamadas de API em `/api/*`.

## Execução local conectada à base remota

Para testar o PWA com os usuários e dados existentes no D1 remoto, execute `npm run dev` em `backend/` (que inicia o Vite apontando o proxy para a API).
