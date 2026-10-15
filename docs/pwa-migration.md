# Arquitetura PWA 100% Online

O cliente oficial da aplicação é `web/`, um Progressive Web App (PWA) em React 19 / TypeScript integrado e publicado diretamente pelo Cloudflare Worker em `https://freq.itbcursos.com`. O PWA é totalmente instalável via Web App Manifest e Service Worker, operando de modo 100% online.

## Operação 100% Online e Persistência Direta

Para eliminar divergências locais/remotas e pendências em filas offline:
- Mutações (criação de registros, frequências, usuários, turmas, reposições) são transmitidas diretamente à API (`/sync/push`) em tempo real.
- As respostas confirmadas pelo servidor são persistidas localmente no IndexedDB cifrado já com status `SYNCED`.
- A fila local não acumula pendências (`queue` com 0 itens), eliminando conflitos de sincronização.
- Caso a conexão falhe, o usuário é prontamente alertado.

## Segurança e armazenamento de dados

Após um login válido, a aplicação gera uma chave AES-GCM não exportável para aquela conta e perfil do navegador. Registros e tokens de sessão são cifrados no IndexedDB. A sessão persistida reabre automaticamente no mesmo perfil; logout apaga a chave e todos os dados locais da conta.

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
