import { displayDate } from '../../lib/date';
import type { BiDataset } from './model';

export type BiViewKey =
  | 'institutional'
  | 'attendance'
  | 'grades'
  | 'risk'
  | 'replacements'
  | 'courses'
  | 'teachers'
  | 'laboratories'
  | 'quality';

export interface BiMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface BiChart {
  type: 'line' | 'bar';
  title: string;
  description: string;
  data: Array<Record<string, unknown>>;
  categoryKey: string;
  valueKey: string;
  valueSuffix?: string;
}

export interface BiView {
  key: BiViewKey;
  title: string;
  description: string;
  metrics: BiMetric[];
  chart?: BiChart;
  tableTitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  limitations: string[];
  payload: Record<string, unknown>;
}

const number = (value: number) => value.toLocaleString('pt-BR');
const percent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

function commonPayload(dataset: BiDataset) {
  return {
    filters: dataset.filters,
    generatedAt: new Date().toISOString(),
    limitations: dataset.limitations ?? [],
  };
}

export function buildBiView(key: BiViewKey, dataset: BiDataset): BiView {
  const evolutionData = (dataset.analytics?.evolution ?? []).map((item) => ({
    date: displayDate(item.date),
    rate: item.rate,
  }));
  const limitations = dataset.limitations ?? [];

  if (key === 'institutional')
    return {
      key,
      title: 'B.I Institucional',
      description: 'Panorama consolidado do escopo e período selecionados.',
      metrics: [
        { label: 'Matrículas ativas', value: number(dataset.analytics?.activeStudents ?? 0) },
        {
          label: 'Chamadas realizadas',
          value: number(dataset.calls ?? 0),
          detail: 'Turma e data distintas',
        },
        {
          label: 'Frequência média',
          value: percent(dataset.analytics?.attendanceRate ?? 0),
        },
        { label: 'Alunos em risco', value: number(dataset.riskRows?.length ?? 0) },
      ],
      chart: {
        type: 'line',
        title: 'Evolução da frequência',
        description: 'Percentual diário de presenças no período.',
        data: evolutionData,
        categoryKey: 'date',
        valueKey: 'rate',
        valueSuffix: '%',
      },
      tableTitle: 'Cursos no escopo',
      headers: ['Curso', 'Turmas', 'Matrículas ativas', 'Chamadas', 'Registros', 'Frequência'],
      rows: (dataset.courseRows ?? []).map((item) => [
        item.name,
        item.classes,
        item.activeStudents,
        item.calls,
        item.records,
        percent(item.rate),
      ]),
      limitations: limitations.slice(0, 2),
      payload: {
        ...commonPayload(dataset),
        summary: dataset.analytics,
        calls: dataset.calls,
        courses: dataset.courseRows ?? [],
      },
    };

  if (key === 'attendance')
    return {
      key,
      title: 'B.I de Frequência',
      description: 'Tendência e distribuição das marcações de frequência.',
      metrics: [
        { label: 'Presenças', value: number(dataset.analytics?.present ?? 0) },
        { label: 'Faltas', value: number(dataset.analytics?.absent ?? 0) },
        { label: 'Justificadas', value: number(dataset.analytics?.justified ?? 0) },
        { label: 'Atrasos', value: number(dataset.analytics?.delayed ?? 0) },
        { label: 'Reposições', value: number(dataset.analytics?.replacements ?? 0) },
        {
          label: 'Frequência',
          value: percent(dataset.analytics?.attendanceRate ?? 0),
        },
      ],
      chart: {
        type: 'line',
        title: 'Evolução diária',
        description: 'Presença diária calculada com a mesma regra do relatório.',
        data: evolutionData,
        categoryKey: 'date',
        valueKey: 'rate',
        valueSuffix: '%',
      },
      tableTitle: 'Comparativo por turma',
      headers: ['Turma', 'Curso', 'Turno', 'Chamadas', 'P', 'F', 'J', 'A', 'R', 'Frequência'],
      rows: (dataset.classRows ?? []).map((item) => [
        item.name,
        item.courseName,
        item.shift,
        item.calls,
        item.present,
        item.absent,
        item.justified,
        item.delayed,
        item.replacements,
        percent(item.rate),
      ]),
      limitations: limitations.length > 0 ? [limitations[0]!] : [],
      payload: {
        ...commonPayload(dataset),
        totals: dataset.analytics,
        calls: dataset.calls,
        classes: dataset.classRows ?? [],
        evolution: dataset.analytics?.evolution ?? [],
      },
    };

  if (key === 'risk')
    return {
      key,
      title: 'B.I de Risco',
      description: 'Fila analítica de alunos que precisam de acompanhamento.',
      metrics: [
        { label: 'Alunos em risco', value: number(dataset.riskRows?.length ?? 0) },
        {
          label: 'Abaixo de 75%',
          value: number((dataset.riskRows ?? []).filter((item) => item.rate < 75).length),
        },
        {
          label: '3+ faltas consecutivas',
          value: number(
            (dataset.riskRows ?? []).filter((item) => item.consecutiveAbsences >= 3).length,
          ),
        },
      ],
      chart: {
        type: 'bar',
        title: 'Menores frequências',
        description: 'Até dez alunos com menor frequência.',
        data: (dataset.riskRows ?? [])
          .slice(0, 10)
          .map((item) => ({ student: item.name, rate: item.rate })),
        categoryKey: 'student',
        valueKey: 'rate',
        valueSuffix: '%',
      },
      tableTitle: 'Alunos sinalizados',
      headers: [
        'Matrícula',
        'Aluno',
        'Turma',
        'Registros',
        'Faltas',
        'Maior sequência',
        'Frequência',
        'Motivo',
      ],
      rows: (dataset.riskRows ?? []).map((item) => [
        item.registrationNumber,
        item.name,
        item.className,
        item.records,
        item.absences,
        item.consecutiveAbsences,
        percent(item.rate),
        (item.reasons ?? []).join('; '),
      ]),
      limitations: [
        'Critérios preservados do desktop: frequência inferior a 75% ou três faltas consecutivas no período selecionado.',
      ],
      payload: { ...commonPayload(dataset), students: dataset.riskRows ?? [] },
    };

  if (key === 'replacements')
    return {
      key,
      title: 'B.I de Reposições',
      description: 'Acompanhamento da fila originada pelas marcações de reposição.',
      metrics: [
        {
          label: 'Não agendadas',
          value: number(dataset.replacementSummary?.notScheduled ?? 0),
        },
        { label: 'Pendentes', value: number(dataset.replacementSummary?.pending ?? 0) },
        { label: 'Vencidas', value: number(dataset.replacementSummary?.overdue ?? 0) },
        { label: 'Concluídas', value: number(dataset.replacementSummary?.completed ?? 0) },
        {
          label: 'Taxa de conclusão',
          value: percent(dataset.replacementSummary?.completionRate ?? 0),
        },
      ],
      chart: {
        type: 'bar',
        title: 'Situação da fila',
        description: 'Quantidade atual em cada situação.',
        data: [
          { state: 'Não agendada', total: dataset.replacementSummary?.notScheduled ?? 0 },
          { state: 'Pendente', total: dataset.replacementSummary?.pending ?? 0 },
          { state: 'Vencida', total: dataset.replacementSummary?.overdue ?? 0 },
          { state: 'Concluída', total: dataset.replacementSummary?.completed ?? 0 },
        ],
        categoryKey: 'state',
        valueKey: 'total',
      },
      tableTitle: 'Reposições no período',
      headers: [
        'Matrícula',
        'Aluno',
        'Turma',
        'Chamada de origem',
        'Agendamento',
        'Horário',
        'Situação',
        'Conclusão',
      ],
      rows: (dataset.replacementRows ?? []).map((item) => [
        item.registrationNumber,
        item.student,
        item.className,
        displayDate(item.attendanceDate),
        displayDate(item.scheduledDate),
        item.scheduledTime || '—',
        item.state,
        item.completedAt || '—',
      ]),
      limitations: [
        'O período filtra a data da chamada de origem. Atraso é identificado quando a data agendada já passou e a reposição não foi concluída.',
      ],
      payload: {
        ...commonPayload(dataset),
        summary: dataset.replacementSummary,
        replacements: dataset.replacementRows ?? [],
      },
    };

  if (key === 'grades') {
    const gs = dataset.gradesSummary;
    const avgLabel =
      gs?.overallAverage !== null && gs?.overallAverage !== undefined
        ? gs.overallAverage.toFixed(1).replace('.', ',')
        : '—';
    return {
      key,
      title: 'B.I de Notas e Desempenho Acadêmico',
      description:
        'Panorama consolidado das tabelas de avaliação, médias por tipo de atividade e aprovação por turma.',
      metrics: [
        { label: 'Média geral (0-10)', value: avgLabel },
        { label: 'Tabelas de notas', value: number(gs?.totalTables ?? 0) },
        { label: 'Avaliações criadas', value: number(gs?.totalAssessments ?? 0) },
        { label: 'Notas lançadas', value: number(gs?.gradedEntries ?? 0) },
        { label: 'Aprovados', value: number(gs?.approvedStudents ?? 0) },
        {
          label: 'Recuperação / Reprov.',
          value: number((gs?.recoveryStudents ?? 0) + (gs?.failedStudents ?? 0)),
        },
      ],
      chart: {
        type: 'bar',
        title: 'Média por tipo de avaliação',
        description: 'Média normalizada (0 a 10) nas categorias de avaliação criadas pelos professores.',
        data: (gs?.byCategory ?? []).map((item) => ({
          category: item.category,
          average: item.averageScore,
        })),
        categoryKey: 'category',
        valueKey: 'average',
      },
      tableTitle: 'Desempenho acadêmico por turma',
      headers: [
        'Curso',
        'Turma',
        'Tabelas',
        'Avaliações',
        'Aprovados',
        'Em Recuperação',
        'Reprovados',
        'Média da Turma',
      ],
      rows: (gs?.byClass ?? []).map((item) => [
        item.courseName,
        item.className,
        item.tables,
        item.assessments,
        item.approved,
        item.recovery,
        item.failed,
        item.averageScore !== null ? item.averageScore.toFixed(1).replace('.', ',') : '—',
      ]),
      limitations: [
        'As notas de diferentes tabelas são normalizadas na escala de 0,0 a 10,0 para consolidação.',
      ],
      payload: {
        ...commonPayload(dataset),
        gradesSummary: gs,
      },
    };
  }

  if (key === 'courses')
    return {
      key,
      title: 'B.I de Cursos e Turmas',
      description: 'Comparação de alcance e frequência entre turmas e cursos.',
      metrics: [
        { label: 'Cursos', value: number(dataset.courseRows?.length ?? 0) },
        { label: 'Turmas', value: number(dataset.classRows?.length ?? 0) },
        {
          label: 'Matrículas ativas',
          value: number(dataset.analytics?.activeStudents ?? 0),
        },
        { label: 'Chamadas', value: number(dataset.calls ?? 0) },
      ],
      chart: {
        type: 'bar',
        title: 'Frequência por turma',
        description: 'Percentual de presença das turmas no período.',
        data: (dataset.classRows ?? []).map((item) => ({ class: item.name, rate: item.rate })),
        categoryKey: 'class',
        valueKey: 'rate',
        valueSuffix: '%',
      },
      tableTitle: 'Desempenho das turmas',
      headers: [
        'Curso',
        'Turma',
        'Turno',
        'Matrículas',
        'Chamadas',
        'Registros',
        'Faltas',
        'Frequência',
      ],
      rows: (dataset.classRows ?? []).map((item) => [
        item.courseName,
        item.name,
        item.shift,
        item.activeStudents,
        item.calls,
        item.records,
        item.absent,
        percent(item.rate),
      ]),
      limitations: limitations.length > 1 ? [limitations[1]!] : [],
      payload: {
        ...commonPayload(dataset),
        courses: dataset.courseRows ?? [],
        classes: dataset.classRows ?? [],
      },
    };

  if (key === 'teachers')
    return {
      key,
      title: 'B.I de Professores',
      description: 'Carga atribuída e chamadas registradas, apresentadas como conceitos distintos.',
      metrics: [
        { label: 'Professores vinculados', value: number(dataset.teacherRows?.length ?? 0) },
        {
          label: 'Vínculos turma-professor',
          value: number(
            (dataset.teacherRows ?? []).reduce((sum, item) => sum + item.classes, 0),
          ),
        },
        { label: 'Chamadas no escopo', value: number(dataset.calls ?? 0) },
      ],
      chart: {
        type: 'bar',
        title: 'Turmas por professor',
        description: 'Quantidade de turmas vinculadas; não representa carga horária.',
        data: (dataset.teacherRows ?? []).map((item) => ({
          teacher: item.name,
          classes: item.classes,
        })),
        categoryKey: 'teacher',
        valueKey: 'classes',
      },
      tableTitle: 'Carga e alcance',
      headers: [
        'Professor',
        'Turmas vinculadas',
        'Alunos ativos',
        'Chamadas nas turmas',
        'Chamadas registradas',
        'Frequência das turmas',
      ],
      rows: (dataset.teacherRows ?? []).map((item) => [
        item.name,
        item.classes,
        item.activeStudents,
        item.callsInAssignedClasses,
        item.callsRecorded,
        percent(item.rate),
      ]),
      limitations: [
        'Turmas vinculadas não equivalem a horas trabalhadas. “Chamadas registradas” usa o autor da marcação; “chamadas nas turmas” usa o vínculo da turma.',
        'Quando o diretório de usuários não estiver disponível offline, o professor é identificado por um trecho do ID até a próxima consulta autorizada.',
      ],
      payload: { ...commonPayload(dataset), teachers: dataset.teacherRows ?? [] },
    };

  if (key === 'laboratories')
    return {
      key,
      title: 'B.I de Laboratórios',
      description: 'Distribuição planejada das turmas pelos laboratórios cadastrados.',
      metrics: [
        { label: 'Laboratórios no escopo', value: number(dataset.laboratoryRows?.length ?? 0) },
        {
          label: 'Turmas alocadas',
          value: number(
            (dataset.laboratoryRows ?? []).reduce((sum, item) => sum + item.classes, 0),
          ),
        },
        {
          label: 'Possíveis colisões',
          value: number(
            (dataset.laboratoryRows ?? []).reduce(
              (sum, item) => sum + item.potentialCollisions,
              0,
            ),
          ),
        },
      ],
      chart: {
        type: 'bar',
        title: 'Turmas por laboratório',
        description: 'Alocação cadastral, não horas de ocupação.',
        data: (dataset.laboratoryRows ?? []).map((item) => ({
          laboratory: item.name,
          classes: item.classes,
        })),
        categoryKey: 'laboratory',
        valueKey: 'classes',
      },
      tableTitle: 'Alocação planejada',
      headers: ['Laboratório', 'Turmas', 'Turnos distintos', 'Possíveis colisões'],
      rows: (dataset.laboratoryRows ?? []).map((item) => [
        item.name,
        item.classes,
        item.shifts,
        item.potentialCollisions,
      ]),
      limitations: limitations.slice(1, 3),
      payload: { ...commonPayload(dataset), laboratories: dataset.laboratoryRows ?? [] },
    };

  return {
    key,
    title: 'B.I de Qualidade dos Dados',
    description: 'Sinais objetivos para revisão da base local e da sincronização.',
    metrics: [
      {
        label: 'Pontos sinalizados',
        value: number((dataset.qualityIssues ?? []).reduce((sum, item) => sum + item.count, 0)),
      },
      {
        label: 'Conflitos',
        value: number(
          (dataset.qualityIssues ?? []).find((item) => item.code === 'conflicts')?.count ?? 0,
        ),
      },
      {
        label: 'Aguardando sincronização',
        value: number(
          (dataset.qualityIssues ?? []).find((item) => item.code === 'pending')?.count ?? 0,
        ),
      },
    ],
    chart: {
      type: 'bar',
      title: 'Sinais por categoria',
      description: 'Contagens para revisão; nem todo sinal representa erro.',
      data: (dataset.qualityIssues ?? []).map((item) => ({
        issue: item.label,
        total: item.count,
      })),
      categoryKey: 'issue',
      valueKey: 'total',
    },
    tableTitle: 'Verificações',
    headers: ['Verificação', 'Quantidade', 'Interpretação'],
    rows: (dataset.qualityIssues ?? []).map((item) => [item.label, item.count, item.explanation]),
    limitations: [
      'A tela sinaliza inconsistências potenciais e não altera dados automaticamente. Matrículas simultâneas podem ser válidas conforme a regra institucional.',
    ],
    payload: { ...commonPayload(dataset), issues: dataset.qualityIssues ?? [] },
  };
}
