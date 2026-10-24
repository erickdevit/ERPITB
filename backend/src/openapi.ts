export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ERPITB - REST API',
    version: '1.0.0',
    description: 'API REST canônica e autoritativa do ERPITB (Instituto Transforma Brasil). Oferece controle de concorrência otimista (ETags/If-Match), proteção contra duplicidade por chave de idempotência, stream de eventos em tempo real via SSE, isolamento estrito de papéis (RBAC) e proteção LGPD de dados sensíveis.',
    contact: {
      name: 'Suporte Técnico ERPITB',
      email: 'contato@itbcursos.com',
    },
  },
  servers: [
    { url: '/api', description: 'Servidor Local / Produção' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT de autenticação do usuário logado.',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave de integração para máquina (M2M) com escopos granulares (role: machine).',
      },
    },
    parameters: {
      IfMatchHeader: {
        name: 'If-Match',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: 'Versão esperada do registro para controle de concorrência otimista (ex: W/"3" ou 3).',
      },
      IdempotencyKeyHeader: {
        name: 'x-idempotency-key',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: 'Chave única de idempotência para evitar operações duplicadas.',
      },
    },
    responses: {
      ConcurrencyConflict: {
        description: 'Conflito de concorrência otimista — o registro foi modificado por outro usuário.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ok: { type: 'boolean', example: false },
                error: { type: 'string', example: 'Registro foi modificado concorrentemente por outro usuário.' },
                code: { type: 'string', example: 'CONCURRENCY_CONFLICT' },
                serverVersion: { type: 'integer', example: 4 },
              },
            },
          },
        },
      },
      Forbidden: {
        description: 'Acesso negado devido a restrições de RBAC ou falta de escopo.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'FORBIDDEN' },
                    message: { type: 'string', example: 'Acesso restrito ao corpo docente e pedagógico.' },
                  },
                },
              },
            },
          },
        },
      },
      IdempotencyMismatch: {
        description: 'Chave de idempotência reutilizada com parâmetros divergentes.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'IDEMPOTENCY_PAYLOAD_MISMATCH' },
                    message: { type: 'string', example: 'Esta chave de idempotência já foi utilizada com parâmetros diferentes.' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  security: [
    { BearerAuth: [] },
    { ApiKeyAuth: [] },
  ],
  paths: {
    '/v1/events': {
      get: {
        summary: 'Stream de eventos em tempo real (Server-Sent Events)',
        description: 'Canal SSE autenticado para invalidação de sessões revogadas, alterações de entidades e atualizações de branding.',
        responses: {
          200: {
            description: 'Conexão SSE aberta',
            content: { 'text/event-stream': {} },
          },
        },
      },
    },
    '/v1/dashboard': {
      get: {
        summary: 'Dashboard consolidado de turmas e presenças',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Resumo analítico do período' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/students': {
      get: {
        summary: 'Lista estudantes com paginação e filtros',
        parameters: [
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'Lista de alunos com dados sensíveis mascarados conforme escopo do usuário/chave' },
        },
      },
      post: {
        summary: 'Cadastra aluno e matrícula inicial',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'classId', 'registrationNumber'],
                properties: {
                  name: { type: 'string' },
                  classId: { type: 'string' },
                  registrationNumber: { type: 'string' },
                  cpf: { type: 'string' },
                  contact: { type: 'string' },
                  birthDate: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Aluno cadastrado' } },
      },
    },
    '/v1/students/{id}': {
      get: {
        summary: 'Obtém dados detalhados do aluno com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Dados do aluno',
            headers: { ETag: { schema: { type: 'string' }, description: 'W/"<version>"' } },
          },
          404: { description: 'Aluno não encontrado' },
        },
      },
      patch: {
        summary: 'Atualiza dados do aluno com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Aluno atualizado' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Inativa aluno do sistema com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Aluno inativado' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/students/{id}/lock': {
      post: {
        summary: 'Tranca a matrícula ativa do aluno, ocultando-o de novas chamadas mantendo histórico',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Matrícula trancada com sucesso' } },
      },
    },
    '/v1/laboratories': {
      get: {
        summary: 'Lista laboratórios e polos',
        responses: { 200: { description: 'Lista de laboratórios' } },
      },
      post: {
        summary: 'Cadastra laboratório',
        responses: { 201: { description: 'Laboratório criado' } },
      },
    },
    '/v1/laboratories/{id}': {
      get: {
        summary: 'Obtém laboratório com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Dados do laboratório' },
          404: { description: 'Laboratório não encontrado' },
        },
      },
      patch: {
        summary: 'Atualiza laboratório com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Laboratório atualizado' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Exclui laboratório logicamente com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Laboratório excluído' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/courses': {
      get: {
        summary: 'Lista cursos cadastrados',
        responses: { 200: { description: 'Lista de cursos' } },
      },
      post: {
        summary: 'Cadastra novo curso',
        responses: { 201: { description: 'Curso criado' } },
      },
    },
    '/v1/courses/{id}': {
      get: {
        summary: 'Obtém curso com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Dados do curso' } },
      },
      patch: {
        summary: 'Atualiza curso com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Curso atualizado' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Exclui curso logicamente com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Curso excluído' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/classes': {
      get: {
        summary: 'Lista turmas com vínculos',
        responses: { 200: { description: 'Lista de turmas' } },
      },
      post: {
        summary: 'Cria nova turma',
        responses: { 201: { description: 'Turma criada' } },
      },
    },
    '/v1/classes/{id}': {
      get: {
        summary: 'Obtém turma com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Dados da turma' } },
      },
      patch: {
        summary: 'Atualiza turma com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Turma atualizada' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Exclui turma logicamente com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Turma excluída' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/classes/{id}/teachers': {
      get: {
        summary: 'Lista professores atribuídos à turma',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lista de professores vinculados' } },
      },
      post: {
        summary: 'Atribui professor à turma',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Professor atribuído' } },
      },
    },
    '/v1/classes/{id}/sessions': {
      get: {
        summary: 'Lista encontros e aulas efetivamente ministradas da turma',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Sessões de aula realizadas' } },
      },
    },
    '/v1/enrollments': {
      get: {
        summary: 'Lista matrículas ativas e concluídas',
        parameters: [
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Lista de matrículas' } },
      },
      post: {
        summary: 'Matricula aluno em turma',
        responses: { 201: { description: 'Matrícula efetuada' } },
      },
    },
    '/v1/enrollments/{id}': {
      get: {
        summary: 'Obtém matrícula com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Dados da matrícula' } },
      },
      patch: {
        summary: 'Atualiza matrícula (ex: status) com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Matrícula atualizada' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Cancela matrícula com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Matrícula cancelada' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/attendance': {
      get: {
        summary: 'Lista registros de frequência e chamada da turma',
        parameters: [
          { name: 'classId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Lista de presenças' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        summary: 'Lança chamada em lote com chave de idempotência',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
        responses: {
          201: { description: 'Chamada registrada' },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { $ref: '#/components/responses/IdempotencyMismatch' },
        },
      },
    },
    '/v1/attendance/batch': {
      put: {
        summary: 'Atualiza ou lança chamada em lote com chave de idempotência',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
        responses: {
          200: { description: 'Chamada processada' },
          403: { $ref: '#/components/responses/Forbidden' },
          422: { $ref: '#/components/responses/IdempotencyMismatch' },
        },
      },
    },
    '/v1/grade-tables': {
      get: {
        summary: 'Lista tabelas de avaliação / notas',
        parameters: [{ name: 'classId', in: 'query', schema: { type: 'string' } }],
        responses: {
          200: { description: 'Tabelas de notas' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        summary: 'Cria tabela de avaliação',
        responses: {
          201: { description: 'Tabela criada' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/grade-tables/{id}': {
      get: {
        summary: 'Obtém tabela de avaliação com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Dados da tabela de avaliação' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { description: 'Tabela não encontrada' },
        },
      },
      patch: {
        summary: 'Atualiza tabela de avaliação com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Tabela atualizada' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Exclui tabela de avaliação com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Tabela excluída' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/grade-items': {
      get: {
        summary: 'Lista itens individuais de avaliação',
        parameters: [
          { name: 'gradeTableId', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Itens de avaliação' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        summary: 'Cria item de avaliação',
        responses: {
          201: { description: 'Item criado' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/grade-items/{id}': {
      get: {
        summary: 'Obtém item de avaliação com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Dados do item de avaliação' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      patch: {
        summary: 'Atualiza item de avaliação com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Item atualizado' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
      delete: {
        summary: 'Exclui item de avaliação com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Item excluído' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/student-grades': {
      get: {
        summary: 'Lista notas lançadas para alunos',
        parameters: [
          { name: 'gradeItemId', in: 'query', schema: { type: 'string' } },
          { name: 'gradeTableId', in: 'query', schema: { type: 'string' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Notas lançadas' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        summary: 'Lança ou atualiza notas de alunos em lote',
        responses: {
          200: { description: 'Notas salvas' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/replacements': {
      get: {
        summary: 'Lista reposições agendadas e pendentes',
        parameters: [
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'pending', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          200: { description: 'Lista de reposições' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        summary: 'Agenda reposição de falta de aluno',
        responses: {
          201: { description: 'Reposição agendada' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/replacements/{id}': {
      get: {
        summary: 'Obtém reposição com ETag',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Dados da reposição' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      patch: {
        summary: 'Atualiza reposição com controle de concorrência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Reposição atualizada' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/replacements/{id}/complete': {
      post: {
        summary: 'Conclui reposição e atualiza a falta correspondente para status RC atomicamente',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IfMatchHeader' },
        ],
        responses: {
          200: { description: 'Reposição concluída com sucesso' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: { $ref: '#/components/responses/ConcurrencyConflict' },
        },
      },
    },
    '/v1/finance/fees': {
      get: {
        summary: 'Lista mensalidades com filtros e KPIs de inadimplência',
        parameters: [
          { name: 'month', in: 'query', schema: { type: 'integer' } },
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Mensalidades e resumo financeiro' } },
      },
      post: {
        summary: 'Cadastra nova mensalidade',
        responses: { 201: { description: 'Mensalidade criada' } },
      },
    },
    '/v1/finance/fees/{id}/payments': {
      post: {
        summary: 'Registra pagamento total ou parcial de mensalidade e reflete atomicamente no caixa',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IdempotencyKeyHeader' },
        ],
        responses: {
          201: { description: 'Pagamento registrado' },
          422: { $ref: '#/components/responses/IdempotencyMismatch' },
        },
      },
    },
    '/v1/finance/cash': {
      get: {
        summary: 'Consulta livro caixa com saldo anterior, entradas, saídas e totalizadores',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['entrada', 'saida'] } },
        ],
        responses: { 200: { description: 'Movimentações e resumo do livro caixa' } },
      },
    },
    '/v1/finance/cash/entries': {
      post: {
        summary: 'Lança movimentação manual de entrada ou saída no caixa com chave de idempotência',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
        responses: {
          201: { description: 'Lançamento efetuado' },
          422: { $ref: '#/components/responses/IdempotencyMismatch' },
        },
      },
    },
    '/v1/finance/cash/entries/{id}/reversal': {
      post: {
        summary: 'Estorna lançamento de caixa sem exclusão física com chave de idempotência',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/IdempotencyKeyHeader' },
        ],
        responses: {
          200: { description: 'Lançamento estornado' },
          422: { $ref: '#/components/responses/IdempotencyMismatch' },
        },
      },
    },
    '/v1/admin/branding': {
      get: {
        summary: 'Obtém configurações visuais de branding',
        responses: { 200: { description: 'Configurações de branding' } },
      },
      put: {
        summary: 'Atualiza configurações de branding (com validação WCAG 2.1 AA de contraste)',
        responses: { 200: { description: 'Branding atualizado' } },
      },
    },
    '/v1/admin/branding/reset': {
      post: {
        summary: 'Restaura as configurações de branding para o padrão institucional',
        responses: { 200: { description: 'Branding restaurado' } },
      },
    },
    '/v1/admin/api-keys': {
      get: {
        summary: 'Lista chaves de API para integrações de máquina (sem expor segredos)',
        responses: { 200: { description: 'Lista de chaves' } },
      },
      post: {
        summary: 'Gera nova chave de API com escopos granulares (segredo exibido apenas uma vez)',
        responses: { 201: { description: 'Chave criada com segredo' } },
      },
    },
    '/v1/admin/api-keys/{id}/revoke': {
      post: {
        summary: 'Revoga chave de API imediatamente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Chave revogada' } },
      },
    },
    '/v1/admin/api-keys/{id}/rotate': {
      post: {
        summary: 'Rotaciona chave de API gerando novo segredo e invalidando o anterior',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Chave rotacionada com novo segredo exibido' } },
      },
    },
    '/v1/analytics': {
      get: {
        summary: 'Retorna indicadores de BI agregados no servidor (acadêmicos e financeiros)',
        responses: { 200: { description: 'Métricas de analytics e BI' } },
      },
    },
    '/v1/reports': {
      get: {
        summary: 'Gera relatórios consolidados no servidor prontos para exibição e impressão',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'classId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string' } },
          { name: 'to', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Dados estruturados do relatório' } },
      },
    },
  },
};
