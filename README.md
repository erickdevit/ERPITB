# Frequência ITB

Aplicativo offline-first para controle de frequência do Instituto Transforma Brasil, com cliente Flutter para Windows/Android e API em Cloudflare Workers + D1.

## Instância de teste publicada

- API: `https://frequencia-itb-api.wx-f24.workers.dev`
- D1: `frequencia-itb` (`be668f55-5a2c-40a2-9cdc-25248be7e65e`)
- Builds testáveis `0.2.6+8` e credenciais: diretório local `artifacts/`
- Auditoria dos 12 itens do EPIC: `docs/epic-verification.md`

O Worker está publicado e funcional, mas Argon2id é deliberadamente pesado. Para
uso contínuo, ative Workers Paid; o plano Free limita cada chamada a 10 ms e pode
interromper autenticações mesmo quando os primeiros testes passam.

## Componentes

- `backend/`: API REST, autenticação, RBAC, criptografia AES-256-GCM e sincronização com conflitos.
- `mobile_desktop/`: cliente Flutter adaptativo, SQLite/SQLCipher, dashboards, chamada, conflitos e relatórios PDF.
- `itb-logo.svg`: fonte oficial única para a marca e seus derivados nativos.
- `.github/workflows/ci.yml`: testes e análise estática.

## Desenvolvimento rápido

### API

```powershell
cd backend
npm install
npm test
npm run dev
```

Copie `.env.example` para `.dev.vars`, crie um banco D1 e atualize o `database_id` em `wrangler.toml`. Aplique o schema com:

```powershell
npx wrangler d1 execute frequencia-itb --local --file=src/schema.sql
```

O backend com Argon2id requer **Cloudflare Workers Paid**: o plano Free limita cada requisição a 10 ms de CPU, incompatível com hashing de senha memory-hard. Se a implantação precisar permanecer gratuita, use autenticação externa e preserve D1/Sync no Worker.

O Observability está versionado em `backend/wrangler.toml`; assim, os próximos
deploys mantêm habilitada a coleta configurada no painel da Cloudflare.

### Flutter

O Flutter 3.32+ deve estar instalado. Na primeira vez, gere os runners nativos preservando o código existente:

```powershell
cd mobile_desktop
flutter create . --platforms=android,windows --org br.org.institutotransformabrasil
flutter pub get
flutter run -d windows --dart-define=API_URL=http://127.0.0.1:8787
```

No Android, use um endereço acessível pelo emulador/dispositivo (por exemplo, `http://10.0.2.2:8787`). O primeiro acesso exige conexão; depois dele o usuário pode entrar offline no mesmo dispositivo.

## Bootstrap do primeiro administrador

Com o Worker em execução e `BOOTSTRAP_SECRET` configurado:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:8787/auth/bootstrap `
  -Headers @{ 'X-Bootstrap-Secret' = 'troque-este-segredo' } `
  -ContentType 'application/json' `
  -Body '{"name":"Administrador","email":"admin@itb.org.br","password":"TroqueAgora123!"}'
```

O endpoint deixa de funcionar assim que houver um usuário cadastrado.
