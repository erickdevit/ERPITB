# Verificação do EPIC de branding, navegação e funcionalidades core (Histórico)

> **Nota de Arquivo**: Este documento é um registro histórico de auditoria do sistema em sua fase inicial. O sistema foi migrado integralmente para a arquitetura Web PWA (`web/`) e a versão legada em Flutter foi descontinuada.

Data da auditoria: 20/07/2026  
Versão auditada: `0.2.6+8`
API: `https://frequencia-itb-api.wx-f24.workers.dev`

Este documento registra as evidências manuais e automatizadas usadas para validar os 12 itens do EPIC. Os dados usados nos testes são fictícios.

## Matriz de aceite

| Item | Resultado | Evidência |
|---|---|---|
| 1. Branding | Aprovado | O arquivo oficial está em `/itb-logo.svg`; a cópia empacotada em `mobile_desktop/assets/itb-logo.svg` possui o mesmo SHA-256. `LoginScreen` e `ReportService` carregam esse SVG e possuem fallback. Android usa `@mipmap/ic_launcher`, Windows usa `resources/app_icon.ico`; ambos foram derivados da mesma marca. O projeto não possui alvo Web/PWA. O PDF foi renderizado em PNG e inspecionado sem distorção. |
| 2. Sidebar recolhível | Aprovado | `AppShell` alterna `NavigationRail.extended`, mantém tooltips e salva `sidebar_collapsed_<userId>`. O teste de widget desmonta e remonta o shell e comprova a persistência por usuário. A transição expandida/recolhida foi inspecionada manualmente em Windows. |
| 3. Topbar sem título duplicado | Aprovado | O título do `AppBar` é `SizedBox.shrink()`; permanecem somente sincronização e conta. O teste de widget verifica a ausência do título e a inspeção manual confirmou o layout. |
| 4. Sidebar funcional | Aprovado | A barra contém apenas o controle de recolher e destinos reais: visão geral, turmas, alunos, frequência, relatórios e, conforme o papel, usuários, conflitos e auditoria. Não há logo, banner ou avatar duplicado. |
| 5. Gestão de usuários e professor obrigatório | Aprovado | `UsersScreen` lista, cria, edita e inativa Professor, Administrativo/Secretaria e Administrador. O modal de turma exige professor e oferece `Criar professor agora`. A camada local cria turma e vínculo na mesma transação/fila; a API cria ambos no mesmo lote. O smoke remoto comprovou criação/edição/listagem/inativação e retornou `400` para turma sem professor e `409` ao tentar deixar uma turma ativa sem professor. |
| 6. Aluno sempre vinculado | Aprovado | O botão de novo aluno fica desabilitado sem turmas, o formulário usa `Turma *`, e `createStudent` exige `classId` local e remoto. A criação local enfileira aluno e matrícula juntos. O smoke remoto retorna `400` para aluno sem turma. |
| 7. Busca nas listagens | Aprovado | Há busca com debounce de 350 ms em turmas, cursos, professores, alunos, chamada, relatórios, usuários, conflitos e auditoria. Os campos relevantes são combinados no filtro local ou enviados à API. |
| 8. Filtros combináveis | Aprovado | Alunos oferece `Todas as turmas`, `Todos os alunos`, professor, desempenho e busca. Turmas oferece professor e busca. Testes do repositório comprovam as combinações busca + professor nas duas listagens. |
| 9. Frequência completa | Aprovado | A chamada tem botões P/F/J/A por aluno, observação geral e observação individual. O teste do repositório salva e relê atraso e ambas as observações, além de comprovar o enfileiramento para sincronização. A tela foi inspecionada manualmente com uma turma inteira. |
| 10. Datas do aluno | Aprovado | `birth_date` e `created_at` existem nas bases local/remota. Nascimento é editável com seletor limitado ao dia atual; cadastro é automático e exibido na tabela e no modal de edição. O teste local valida persistência/formatação e o smoke remoto retorna `400` para nascimento futuro. |
| 11. Relatórios por período | Aprovado | A tela sempre oferece data inicial/final e combina período com turma, professor e aluno. As cinco consultas do `ReportService` aplicam o período; testes geram todos os tipos com escopo combinado e validam numericamente o consolidado institucional. O PDF real foi renderizado e inspecionado. |
| 12. Dashboard BI | Aprovado | Há frequência média, P/F/J/A, risco, evolução, distribuição, comparativo por turma, ranking de faltas e carga por professor. Os presets 7/30/90 e o intervalo personalizado recalculam o período; os chips só ficam marcados quando o intervalo coincide exatamente. Teste local valida período, atraso, ranking e carga; smoke remoto valida os novos campos da API. |

## Verificação manual registrada

A prévia de QA usa os mesmos widgets e repositório do aplicativo, com banco em memória e dados fictícios. Foram inspecionados no Windows:

- dashboard expandida e recolhida, gráficos, filtros de período, ranking de faltas e carga docente;
- turmas, filtro por professor, busca e modal de nova turma com professor obrigatório e criação inline;
- alunos, opções globais, filtros combinados, datas na tabela e data de cadastro no modal de edição;
- frequência, busca, observação geral, observação individual e marcação P/F/J/A;
- relatórios, professor, turma/aluno, busca e intervalo de datas;
- usuários, busca, filtro, três papéis e ações de CRUD;
- conflitos e auditoria com busca e estados vazios/listados;
- sidebar recolhida/expandida e topbar sem título duplicado.
- navegação e conteúdo em viewport móvel de 390 × 844, incluindo detalhe da turma e anotação individual da chamada.

Durante essa inspeção foi detectada uma ausência de `Provider<ApiClient>` apenas no harness de prévia. O harness foi corrigido para registrar o subtipo como `ApiClient`, recompilado e as telas de conflitos/auditoria foram revalidadas. O `main.dart` de produção já usava o tipo correto.

## Verificações automatizadas e operacionais

Resultado final: `flutter analyze` sem ocorrências, 26 testes Flutter aprovados, incluindo a navegação responsiva completa em 390 × 844 e a persistência segura da sessão; typecheck TypeScript aprovado e 8 testes Vitest aprovados.

Comandos principais:

```powershell
cd mobile_desktop
flutter analyze
flutter test
flutter build windows --release --dart-define=API_URL=https://frequencia-itb-api.wx-f24.workers.dev
flutter build apk --release --dart-define=API_URL=https://frequencia-itb-api.wx-f24.workers.dev
flutter build apk --debug --dart-define=API_URL=https://frequencia-itb-api.wx-f24.workers.dev

cd ..\backend
npm run typecheck
npm test -- --run
.\scripts\remote-smoke.ps1 -AdminEmail $env:ITB_ADMIN_EMAIL -AdminPassword $env:ITB_ADMIN_PASSWORD
```

O smoke remoto cria somente dados temporários, valida os códigos HTTP e remove turma, professor e curso no bloco `finally`. Resultado esperado:

```text
health=200
userCreate=201
userUpdate=200
classWithoutProfessor=400
studentWithoutClass=400
futureBirth=400
linkedClassDelete=409
linkedCourseDelete=409
orphanProfessor=409
combinedUserFilter=200
dashboardPeriod=200
cleanupStudent=200
cleanupClass=200
cleanupProfessor=200
cleanupCourse=200
```

O login remoto usa Argon2id e pode receber Cloudflare `1102` se o Worker estiver em um plano sem CPU suficiente. O script e o aplicativo tentam o login até três vezes; no app, respostas 502/503/504 não JSON são identificadas como indisponibilidade temporária em vez de erro da base local. O ambiente de produção deve permanecer no plano compatível indicado em `wrangler.toml` e no README; não há fallback criptográfico mais fraco.

## Entregáveis

- `artifacts/FrequenciaITB-Windows-0.2.6+8.zip`
- `artifacts/FrequenciaITB-Android-0.2.6+8-debug.apk` — instalável para teste
- `artifacts/FrequenciaITB-Android-0.2.6+8-release-unsigned.apk` — requer assinatura oficial
- `artifacts/SHA256SUMS.txt`
- `artifacts/LEIA-ME-TESTE.txt`

O APK declara `versionName=0.2.6`, `versionCode=8`, `minSdk=24` e `targetSdk=36`. O APK de debug verifica com o certificado Android Debug; o release intencionalmente não possui assinatura de distribuição.
