# Migração para PWA

O cliente de produção passa a ser `web/`, uma PWA React/TypeScript publicada no mesmo Cloudflare Worker da API. O build é incorporado ao deploy por `backend/package.json`; não há compilação Android ou Windows no fluxo normal.

## Segurança e uso offline

Após um login válido, a PWA gera uma chave AES-GCM não exportável para aquela conta e perfil do navegador. Registros, fila de sincronização e tokens de sessão são cifrados no IndexedDB. A sessão persistida pode reabrir o cache automaticamente no mesmo perfil; logout apaga a chave e todos os dados locais da conta.

O service worker armazena apenas o shell e recursos estáticos. Dados institucionais não são cache HTTP: são gravados primeiro no banco local cifrado e enviados em segundo plano com o protocolo existente de `operationId`, versão base, cursor e conflitos.

## Dados do Flutter legado

Dados já sincronizados permanecem no D1 e são baixados pela PWA no primeiro login. Bancos SQLCipher locais não podem ser lidos por navegadores. Antes de descontinuar o Flutter, cada instalação deve abrir o cliente legado com rede, acionar sincronização manual e confirmar que não há operações pendentes. A instalação nativa fica congelada como ferramenta de contingência até o encerramento institucional da migração.

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

O Worker publica os assets em `web/dist` e atende o novo cliente em `/api/*`. Os caminhos antigos (`/auth/*`, `/sync/*` e rotas de dados) são mantidos para compatibilidade com o cliente Flutter durante a transição.

## Usar a base já publicada

Para testar o PWA com os usuários e dados existentes no D1 remoto, sem criar um banco local, execute `npm run dev` em `backend/` e abra a URL exibida pelo Vite (normalmente `http://127.0.0.1:5173`). Esse modo encaminha apenas `/api/*` para o Worker publicado e remove o prefixo para preservar a API legada. Use as credenciais reais já cadastradas; senhas não podem ser obtidas do D1 porque são armazenadas como hash. O modo isolado, com D1 local, é `npm run dev:local` e precisa ter o schema aplicado antes do uso.
