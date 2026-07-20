# Segurança

Não registre segredos, tokens, bancos locais ou PDFs com dados pessoais no Git. Use `.dev.vars` apenas localmente e `wrangler secret put` em produção.

Para relatar uma vulnerabilidade, utilize um canal privado do Instituto Transforma Brasil e inclua versão, plataforma, impacto e passos mínimos de reprodução. Não anexe bases reais de alunos.

Antes de publicar:

- gere segredos independentes com pelo menos 32 bytes de entropia;
- configure um `ALLOWED_ORIGIN` específico quando houver cliente web administrativo;
- habilite retenção e revisão periódica dos logs de auditoria;
- valide restauração de backup do D1 e rotação documentada de chaves;
- assine APK/MSIX com identidades de produção e remova qualquer configuração de debug.

