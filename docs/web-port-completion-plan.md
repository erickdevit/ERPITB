# Conclusão do porte Web/PWA

Este documento é o contrato de entrega para substituir integralmente os clientes nativos pelo PWA sem perder dados, regras ou capacidade analítica. A referência funcional do desktop é `origin/dev` no commit `4611bca`; o `main` anterior ao porte não contém todas as telas existentes.

## Princípios obrigatórios

- Toda operação primária funciona offline e entra numa fila durável e criptografada.
- Tela, PDF, Excel, CSV e pacote B.I. usam o mesmo resultado semântico.
- Professor nunca recebe nem conserva dados fora das turmas atribuídas.
- Uma frequência canônica é identificada por turma + aluno + data; só o último estado é considerado.
- Migração nunca inventa data, horário, professor, matrícula ou agenda ausente.
- O título da rota aparece somente na barra superior. O conteúdo usa apenas títulos contextuais de entidades e seções.
- Toda rodada termina com testes proporcionais ao risco e commit próprio; publicação é uma etapa separada.

## Definições dos indicadores

| Indicador | Definição canônica |
|---|---|
| Marcações | Frequências canônicas filtradas, após deduplicação por turma + aluno + data |
| Chamadas | pares distintos turma + data |
| Frequência | `P / (P + F + J + A + R + RC)` no período |
| Risco | frequência abaixo de 75% ou três faltas `F` consecutivas |
| Reposição aberta | `R` com agenda não concluída, ou `R` legado ainda sem agenda estruturada |
| Reposição concluída | agenda com `completed_at` ou frequência legada `RC` |
| Carga docente | turmas com chamadas no período e alunos ativos vinculados; não representa horas trabalhadas |

As definições serão versionadas quando o backend possuir uma camada semântica própria. Até lá, o motor puro do PWA é a fonte única e testada.

## Inventário de paridade

### Visão geral

- Períodos 7, 30, 90 dias e personalizado.
- Frequência, presenças, faltas, atrasos, risco e chamadas distintas.
- Evolução diária, distribuição P/F/J/A/R, comparação por turma, ranking de faltosos e carga docente.
- Escopo do professor limitado às próprias turmas.

### Turmas

- Professor visualiza suas turmas; gestores pesquisam e filtram por professor/curso.
- Metadados: curso, turno, dia, laboratório, Kids, professores e taxa.
- Gestão de múltiplos professores sem tornar vínculo obrigatório.
- Tela `/turmas/:id` com métricas, evolução, distribuição, alunos clicáveis, reposições e atalhos.

### Alunos

- Busca, turma, professor, desempenho e situação da matrícula.
- Transferência encerra vínculos ativos anteriores antes de abrir o novo.
- Exclusão e inativação obedecem RBAC.
- Tela `/alunos/:id` com matrícula atual/histórico, métricas, risco, linha do tempo, anotações e reposições.

### Cursos e laboratórios

- Busca, estados vazios e layouts responsivos.
- Tela `/cursos/:id` com turmas clicáveis, matrículas, chamadas, frequência, risco e comparativos.
- Laboratórios mostram alocação por dia/turno e colisões possíveis, sem chamar isso de utilização horária.

### Frequência

- Turma, data e busca de aluno; regras temporais visíveis antes da edição.
- Chamada editada como conjunto com retorno de salvamento.
- Segundo clique remove a situação.
- Observação geral e individual.
- Marcar `R` abre agenda com data, horário e observação; conclusão preserva compatibilidade `RC`.

### Reposições

- Rotas separadas para abertas e histórico dentro de árvore expansível.
- Busca por nome/matrícula, turma e período.
- Agenda, edição, conclusão, notas e data de conclusão.
- Compatibilidade com registros `R/RC` do desktop.

### Relatórios

- Consolidado institucional.
- Sintético por curso.
- Diário de classe matricial.
- Ficha individual do aluno.
- Risco de evasão.
- Filtros por período, professor, turma, aluno e busca; visualização, impressão e exportação.

### Conflitos, usuários e auditoria

- Conflitos exibem local/remoto, código/motivo, escolha explícita e justificativa auditada.
- Rejeição de validação não vira conflito e não é apagada silenciosamente.
- Usuários têm busca/filtro de perfil, criação, edição e inativação/exclusão permitida.
- Auditoria tem busca, usuário, detalhes, atualização e fallback offline.

## Árvore B.I.

1. Institucional — matrículas, turmas, cursos, chamadas, frequência, risco e tendências.
2. Frequência — evolução, situação, curso, turma, turno e dia da semana.
3. Risco — alunos, motivo, frequência e sequência de faltas.
4. Reposições — não agendadas, pendentes, vencidas, próximas, concluídas e taxa de conclusão.
5. Cursos e turmas — comparativos, volume, frequência e rankings.
6. Professores — turmas/alunos atribuídos e chamadas registradas, apresentados separadamente.
7. Laboratórios — alocação por dia/turno e conflitos potenciais.
8. Qualidade dos dados — fila, rejeições, conflitos, vínculos incompletos e matrículas simultâneas.

Filtros compartilhados: período, curso, turma, professor e turno. Cada tela exporta:

- PDF executivo e tabela detalhada.
- Excel `.xlsx` com `Resumo`, `Dados` e `Metadados`.
- CSV normalizado e protegido contra injeção de fórmula.
- Pacote B.I. com fatos, dimensões e dicionário de dados, sem CPF/contato por padrão.

## Modelo e contratos ainda necessários

- Snapshot inicial por escopo, `scopeRevision` e purga local após revogação ou mudança de perfil.
- Resposta de sync com ID canônico, rejeição recuperável e conflitos resolvíveis para todas as entidades.
- Diretório mínimo de professores sincronizado e criptografado.
- Vigência de matrículas e vínculos docentes para análise histórica precisa.
- Calendário acadêmico, horários e duração para aulas esperadas, carga horária e ocupação real.
- Read models/endpoints para visão geral e detalhes quando o volume não puder mais ser agregado no dispositivo.

Indicadores dependentes desses dados ficam identificados como indisponíveis; não serão estimados.

## Ondas de implementação e gates

### Onda 1 — fundação e restauração visível

- React Router, URLs reais, shell recolhível e árvore Reposição/B.I.
- Dashboard completo e detalhes de curso/turma/aluno.
- Motor analítico puro e exportadores compartilhados.
- Gate: typecheck, unitários, build PWA, rotas diretas e teste em 360/768/1024/1440.

### Onda 2 — integridade offline e paridade operacional

- Migração R/RC, matrícula única ativa, regras de chamada, fluxo completo de reposição, permissões e logout seguro.
- Sync em lotes, ID canônico, rejeições preservadas e snapshot de escopo.
- Gate: Worker+D1 real, migração de snapshots antigos, `foreign_key_check`, 201+ operações e RBAC.

### Onda 3 — relatórios e B.I.

- Cinco relatórios, oito telas B.I. e quatro formatos de exportação.
- Gate: fixtures independentes provam os mesmos números na tela/PDF/XLSX/CSV/pacote B.I.

### Onda 4 — endurecimento e liberação

- Responsividade, acessibilidade, performance com 10 mil registros, PWA offline, service worker e observabilidade.
- Auditoria requisito por requisito, backup D1, smoke remoto, tag, publicação gradual e rollback documentado.

## Evidência de conclusão

O porte só pode ser declarado completo quando cada item deste documento tiver implementação identificável, teste correspondente e validação no runtime real. Build verde isolado ou ausência de erro visual não prova paridade funcional.
