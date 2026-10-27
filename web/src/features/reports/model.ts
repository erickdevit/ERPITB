import { latestAttendance } from '../../lib/attendance';
import { buildClassBoletimData, buildUnifiedBoletimData, type ClassBoletimData, type UnifiedBoletimData } from '../../lib/boletim';
import type { ExportValue } from '../../lib/exports';
import { buildClassGradeSummary, formatGrade, normalizeScoreToTen, roundGrade } from '../../lib/grades';
import type { LocalRecord } from '../../types';

export type ReportType =
  | 'institutional'
  | 'course'
  | 'classDiary'
  | 'classGrades'
  | 'assessmentTypes'
  | 'student'
  | 'studentBoletim'
  | 'dropoutRisk';

export interface ReportFilters {
  type: ReportType;
  from: string;
  to: string;
  courseId?: string;
  classId?: string;
  studentId?: string;
  teacherId?: string;
  weekDay?: string;
  shift?: string;
  laboratoryId?: string;
}

export interface ReportInput {
  attendance: LocalRecord[];
  classes: LocalRecord[];
  classNotes: LocalRecord[];
  classTeachers: LocalRecord[];
  courses: LocalRecord[];
  directory: LocalRecord[];
  enrollments: LocalRecord[];
  students: LocalRecord[];
  gradeTables?: LocalRecord[];
  gradeItems?: LocalRecord[];
  studentGrades?: LocalRecord[];
}

export interface ReportMetric {
  label: string;
  value: string;
}

export interface ReportView {
  type: ReportType;
  title: string;
  description: string;
  tableTitle: string;
  metrics: ReportMetric[];
  headers: string[];
  rows: ExportValue[][];
  context: string[];
  notices: string[];
  ready: boolean;
  requiredMessage?: string;
  matrix: boolean;
  boletimData?: UnifiedBoletimData | null;
  classBoletimData?: ClassBoletimData | null;
}

export const reportTypeOptions: Array<{ value: ReportType; label: string }> = [
  { value: 'institutional', label: 'Consolidado institucional' },
  { value: 'course', label: 'Sintético por curso' },
  { value: 'classDiary', label: 'Diário de classe' },
  { value: 'classGrades', label: 'Boletim / Mapa de notas da turma' },
  { value: 'assessmentTypes', label: 'Desempenho por tipo de avaliação' },
  { value: 'student', label: 'Ficha detalhada do aluno' },
  { value: 'studentBoletim', label: 'Boletim Escolar do Aluno' },
  { value: 'dropoutRisk', label: 'Risco de evasão' },
];

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const activeEnrollment = (record: LocalRecord) => !record.deleted_at && record.status === 'ativa';
const pct = (present: number, total: number) => total ? Math.round(present * 1000 / total) / 10 : 0;
const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dateLabel = (value: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value;
const shortDate = (value: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : value;
const shiftLabel = (value: string) => ({ manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', integral: 'Integral' }[value] ?? value) || '—';
const statusLabel = (value: string) => ({ P: 'Presente', F: 'Falta', J: 'Justificada', A: 'Atraso', R: 'Reposição', RC: 'Reposição concluída' }[value] ?? value) || '—';
const uniqueCalls = (records: LocalRecord[]) => new Set(records.map((record) => `${text(record, 'class_id')}|${text(record, 'date')}`)).size;

function baseScope(input: ReportInput, filters: ReportFilters) {
  const teacherClasses = filters.teacherId
    ? new Set(input.classTeachers.filter((item) => !item.deleted_at && item.user_id === filters.teacherId).map((item) => text(item, 'class_id')))
    : undefined;
  const classes = input.classes.filter((item) => active(item)
    && (!filters.courseId || item.course_id === filters.courseId)
    && (!filters.classId || item.id === filters.classId)
    && (!teacherClasses || teacherClasses.has(item.id)));
  const classIds = new Set(classes.map((item) => item.id));
  const attendance = latestAttendance(input.attendance).filter((item) => !item.deleted_at
    && classIds.has(text(item, 'class_id'))
    && text(item, 'date') >= filters.from
    && text(item, 'date') <= filters.to);
  const enrollments = input.enrollments.filter((item) => activeEnrollment(item) && classIds.has(text(item, 'class_id')));
  return { classes, classIds, attendance, enrollments };
}

function context(input: ReportInput, filters: ReportFilters, extra: string[] = []) {
  const professor = filters.teacherId ? input.directory.find((item) => item.id === filters.teacherId) : undefined;
  return [
    `Período: ${dateLabel(filters.from)} a ${dateLabel(filters.to)}`,
    `Professor: ${professor ? text(professor, 'name') : 'Todos os professores'}`,
    ...extra,
    'Fonte: base local sincronizada do ERPITB',
  ];
}

function institutional(input: ReportInput, filters: ReportFilters): ReportView {
  const scope = baseScope(input, { ...filters, courseId: undefined, classId: undefined });
  const courseIds = new Set(scope.classes.map((item) => text(item, 'course_id')));
  const courses = input.courses.filter((item) => active(item) && courseIds.has(item.id));
  const students = new Set(scope.enrollments.map((item) => text(item, 'student_id'))).size;
  const present = scope.attendance.filter((item) => item.status === 'P').length;
  const rows = courses.map((course) => {
    const classes = scope.classes.filter((item) => item.course_id === course.id);
    const classIds = new Set(classes.map((item) => item.id));
    const records = scope.attendance.filter((item) => classIds.has(text(item, 'class_id')));
    const enrollments = scope.enrollments.filter((item) => classIds.has(text(item, 'class_id')));
    return [text(course, 'code') || '—', text(course, 'name'), classes.length, new Set(enrollments.map((item) => text(item, 'student_id'))).size, uniqueCalls(records), percent(pct(records.filter((item) => item.status === 'P').length, records.length))] satisfies ExportValue[];
  }).sort((left, right) => String(left[1]).localeCompare(String(right[1])));
  return {
    type: filters.type,
    title: 'Consolidado institucional',
    description: 'Visão geral das matrículas, chamadas e frequência por curso no período selecionado.',
    tableTitle: 'Cursos da instituição',
    metrics: [
      { label: 'Matrículas ativas', value: students.toLocaleString('pt-BR') },
      { label: 'Chamadas realizadas', value: uniqueCalls(scope.attendance).toLocaleString('pt-BR') },
      { label: 'Frequência média', value: percent(pct(present, scope.attendance.length)) },
      { label: 'Turmas ativas', value: scope.classes.length.toLocaleString('pt-BR') },
    ],
    headers: ['Código', 'Curso', 'Turmas', 'Alunos ativos', 'Chamadas', 'Frequência'],
    rows,
    context: context(input, filters),
    notices: ['Frequência = marcações P divididas por todas as marcações P/F/J/A/R/RC no período.'],
    ready: true,
    matrix: false,
  };
}

function courseSummary(input: ReportInput, filters: ReportFilters): ReportView {
  const course = input.courses.find((item) => item.id === filters.courseId && active(item));
  if (!course) return missing(filters, 'Sintético por curso', 'Selecione um curso para visualizar este relatório.');
  const scope = baseScope(input, { ...filters, classId: undefined });
  const rows = scope.classes.map((item) => {
    const records = scope.attendance.filter((record) => record.class_id === item.id);
    const enrollments = scope.enrollments.filter((record) => record.class_id === item.id);
    const status = (value: string) => records.filter((record) => record.status === value).length;
    return [text(item, 'name'), shiftLabel(text(item, 'shift')), new Set(enrollments.map((record) => text(record, 'student_id'))).size, uniqueCalls(records), status('P'), status('F'), status('J'), status('A'), records.filter((record) => record.status === 'R' || record.status === 'RC').length, percent(pct(status('P'), records.length))] satisfies ExportValue[];
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const present = scope.attendance.filter((item) => item.status === 'P').length;
  return {
    type: filters.type,
    title: `Sintético por curso — ${text(course, 'name')}`,
    description: 'Comparativo sintético das turmas vinculadas ao curso selecionado.',
    tableTitle: 'Desempenho das turmas',
    metrics: [
      { label: 'Turmas', value: scope.classes.length.toLocaleString('pt-BR') },
      { label: 'Alunos ativos', value: new Set(scope.enrollments.map((item) => text(item, 'student_id'))).size.toLocaleString('pt-BR') },
      { label: 'Chamadas', value: uniqueCalls(scope.attendance).toLocaleString('pt-BR') },
      { label: 'Frequência', value: percent(pct(present, scope.attendance.length)) },
    ],
    headers: ['Turma', 'Turno', 'Alunos', 'Chamadas', 'P', 'F', 'J', 'A', 'R/RC', 'Frequência'],
    rows,
    context: context(input, filters, [`Curso: ${text(course, 'code') ? `${text(course, 'code')} · ` : ''}${text(course, 'name')}`]),
    notices: ['R e RC são mantidos separados de presença no cálculo histórico de frequência.'],
    ready: true,
    matrix: false,
  };
}

function classDiary(input: ReportInput, filters: ReportFilters): ReportView {
  const classRecord = input.classes.find((item) => item.id === filters.classId && active(item));
  if (!classRecord) return missing(filters, 'Diário de classe', 'Selecione uma turma para visualizar o diário.');
  const scope = baseScope(input, filters);
  const course = input.courses.find((item) => item.id === classRecord.course_id);
  const dates = [...new Set(scope.attendance.map((item) => text(item, 'date')))].sort();
  const attendanceByKey = new Map(scope.attendance.map((item) => [`${text(item, 'student_id')}|${text(item, 'date')}`, text(item, 'status')]));
  const studentIds = new Set(scope.enrollments.map((item) => text(item, 'student_id')));
  const students = input.students.filter((item) => active(item) && studentIds.has(item.id)).sort((left, right) => text(left, 'name').localeCompare(text(right, 'name')));
  const rows = students.map((student) => {
    const statuses = dates.map((date) => attendanceByKey.get(`${student.id}|${date}`) ?? '—');
    const recorded = statuses.filter((status) => status !== '—');
    const absences = statuses.filter((status) => status === 'F').length;
    const present = statuses.filter((status) => status === 'P').length;
    return [text(student, 'registration_number'), text(student, 'name'), ...statuses, absences, recorded.length ? percent(pct(present, recorded.length)) : '—'] satisfies ExportValue[];
  });
  return {
    type: filters.type,
    title: `Diário de classe — ${text(classRecord, 'name')}`,
    description: 'Matriz de frequência por aluno e data, com uma única situação vigente para cada chamada.',
    tableTitle: 'Chamada por aluno',
    metrics: [
      { label: 'Alunos ativos', value: students.length.toLocaleString('pt-BR') },
      { label: 'Datas de chamada', value: dates.length.toLocaleString('pt-BR') },
      { label: 'Marcações', value: scope.attendance.length.toLocaleString('pt-BR') },
      { label: 'Frequência', value: percent(pct(scope.attendance.filter((item) => item.status === 'P').length, scope.attendance.length)) },
    ],
    headers: ['Matrícula', 'Aluno', ...dates.map(shortDate), 'F', '%'],
    rows,
    context: context(input, filters, [`Curso: ${text(course, 'name') || 'Não informado'}`, `Turma: ${text(classRecord, 'name')}`]),
    notices: ['Legenda: P = Presença; F = Falta; J = Justificada; A = Atraso; R = Reposição; RC = Reposição concluída.', dates.length > 31 ? 'O período possui mais de 31 chamadas. Use a rolagem horizontal na tela ou a planilha para consultar todas as datas.' : ''],
    ready: true,
    matrix: true,
  };
}

function studentSheet(input: ReportInput, filters: ReportFilters): ReportView {
  const classRecord = input.classes.find((item) => item.id === filters.classId && active(item));
  if (!classRecord) return missing(filters, 'Ficha detalhada do aluno', 'Selecione uma turma para listar seus alunos.');
  const student = input.students.find((item) => item.id === filters.studentId && active(item));
  if (!student) return missing(filters, 'Ficha detalhada do aluno', 'Selecione um aluno para visualizar sua ficha.');
  const scope = baseScope(input, filters);
  const hasHistoryInClass = scope.enrollments.some((item) => item.student_id === student.id)
    || input.enrollments.some((item) => !item.deleted_at && item.class_id === classRecord.id && item.student_id === student.id)
    || scope.attendance.some((item) => item.student_id === student.id);
  if (!hasHistoryInClass) return missing(filters, 'Ficha detalhada do aluno', 'O aluno selecionado não possui histórico ou matrícula nesta turma.');
  const course = input.courses.find((item) => item.id === classRecord.course_id);
  const records = scope.attendance.filter((item) => item.student_id === student.id).sort((left, right) => text(right, 'date').localeCompare(text(left, 'date')));
  const notesByDate = new Map(input.classNotes.filter((item) => !item.deleted_at && item.class_id === classRecord.id).map((item) => [text(item, 'date'), text(item, 'notes')]));
  const present = records.filter((item) => item.status === 'P').length;
  return {
    type: filters.type,
    title: `Ficha detalhada — ${text(student, 'name')}`,
    description: 'Histórico individual com situação, anotação do aluno e observação geral registrada na turma.',
    tableTitle: 'Histórico de frequência e notas',
    metrics: [
      { label: 'Frequência', value: percent(pct(present, records.length)) },
      { label: 'Registros', value: records.length.toLocaleString('pt-BR') },
      { label: 'Faltas', value: records.filter((item) => item.status === 'F').length.toLocaleString('pt-BR') },
      { label: 'Reposições', value: records.filter((item) => item.status === 'R' || item.status === 'RC').length.toLocaleString('pt-BR') },
    ],
    headers: ['Data', 'Situação', 'Anotação do aluno', 'Observação da turma'],
    rows: records.map((item) => [dateLabel(text(item, 'date')), statusLabel(text(item, 'status')), text(item, 'notes') || '—', notesByDate.get(text(item, 'date')) || '—']),
    context: context(input, filters, [`Aluno: ${text(student, 'name')} · Matrícula ${text(student, 'registration_number')}`, `Curso / turma: ${text(course, 'name') || 'Não informado'} / ${text(classRecord, 'name')}`]),
    notices: ['As observações são exibidas apenas quando foram registradas na chamada ou na nota geral da turma.'],
    ready: true,
    matrix: false,
  };
}

function dropoutRisk(input: ReportInput, filters: ReportFilters): ReportView {
  const scope = baseScope(input, filters);
  const classById = new Map(scope.classes.map((item) => [item.id, item]));
  const grouped = new Map<string, LocalRecord[]>();
  scope.attendance.forEach((item) => {
    const key = `${text(item, 'student_id')}|${text(item, 'class_id')}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  const rows = [...grouped.values()].flatMap((records) => {
    const sorted = [...records].sort((left, right) => text(left, 'date').localeCompare(text(right, 'date')));
    let streak = 0; let maximum = 0;
    sorted.forEach((item) => { streak = item.status === 'F' ? streak + 1 : 0; maximum = Math.max(maximum, streak); });
    const present = sorted.filter((item) => item.status === 'P').length;
    const absences = sorted.filter((item) => item.status === 'F').length;
    const rate = pct(present, sorted.length);
    const reasons = [rate < 75 ? 'Frequência abaixo de 75%' : '', maximum >= 3 ? '3 ou mais faltas consecutivas' : ''].filter(Boolean);
    if (!reasons.length) return [];
    const student = input.students.find((item) => item.id === sorted[0]?.student_id);
    const classRecord = classById.get(text(sorted[0], 'class_id'));
    return [[text(student, 'registration_number'), text(student, 'name') || 'Aluno não informado', text(classRecord, 'name') || 'Turma não informada', absences, maximum, percent(rate), reasons.join('; ')]];
  }).sort((left, right) => Number(String(left[5]).replace(/[^0-9,]/g, '').replace(',', '.')) - Number(String(right[5]).replace(/[^0-9,]/g, '').replace(',', '.')) || String(left[1]).localeCompare(String(right[1])));
  return {
    type: filters.type,
    title: 'Risco de evasão',
    description: 'Alunos que exigem atenção segundo os critérios históricos de frequência e faltas consecutivas.',
    tableTitle: 'Alunos em risco',
    metrics: [
      { label: 'Alunos em risco', value: rows.length.toLocaleString('pt-BR') },
      { label: 'Abaixo de 75%', value: rows.filter((row) => String(row[6]).includes('75%')).length.toLocaleString('pt-BR') },
      { label: '3+ faltas seguidas', value: rows.filter((row) => String(row[6]).includes('consecutivas')).length.toLocaleString('pt-BR') },
      { label: 'Turmas avaliadas', value: scope.classes.length.toLocaleString('pt-BR') },
    ],
    headers: ['Matrícula', 'Aluno', 'Turma', 'Faltas', 'Maior sequência', 'Frequência', 'Motivo'],
    rows,
    context: context(input, filters, filters.classId ? [`Turma: ${text(classById.get(filters.classId), 'name')}`] : ['Turma: Todas as turmas']),
    notices: ['Critérios: frequência inferior a 75% ou pelo menos três faltas não justificadas consecutivas.'],
    ready: true,
    matrix: false,
  };
}

function classGradesReport(input: ReportInput, filters: ReportFilters): ReportView {
  const classRecord = input.classes.find((item) => item.id === filters.classId && active(item));
  if (!classRecord) {
    return missing(filters, 'Boletim / Mapa de notas da turma', 'Selecione uma turma para visualizar o boletim de notas.');
  }
  const scope = baseScope(input, filters);
  const course = input.courses.find((item) => item.id === classRecord.course_id);
  const studentIds = new Set(scope.enrollments.map((item) => text(item, 'student_id')));
  const students = input.students
    .filter((item) => active(item) && studentIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: text(item, 'name'),
      registrationNumber: text(item, 'registration_number'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const summary = buildClassGradeSummary({
    classId: classRecord.id,
    tables: input.gradeTables ?? [],
    items: input.gradeItems ?? [],
    studentGrades: input.studentGrades ?? [],
    students,
  });

  const distinctClassDates = new Set(
    scope.attendance
      .filter((r) => r.class_id === classRecord.id && r.date)
      .map((r) => String(r.date))
  );
  const totalClassSessions = distinctClassDates.size;

  const rows: ExportValue[][] = summary.studentSummaries.map((student) => {
    const studentAtt = scope.attendance.filter((r) => r.student_id === student.studentId);
    const present = studentAtt.filter((r) => r.status === 'P' || r.status === 'RC').length;
    const freq = totalClassSessions > 0 ? percent(pct(present, totalClassSessions)) : '—';
    return [
      student.registrationNumber,
      student.studentName,
      ...student.tableResults.map((tr) => formatGrade(tr.average)),
      formatGrade(student.overallAverage),
      freq,
      student.overallStatusLabel,
    ];
  });

  const classBoletimData = buildClassBoletimData({
    classId: classRecord.id,
    classes: input.classes,
    courses: input.courses,
    gradeTables: input.gradeTables ?? [],
    gradeItems: input.gradeItems ?? [],
    studentGrades: input.studentGrades ?? [],
    students: input.students,
    enrollments: input.enrollments,
    attendanceRecords: scope.attendance,
  });

  return {
    type: filters.type,
    title: `Boletim da turma — ${text(classRecord, 'name')}`,
    description: 'Mapa consolidado das tabelas de avaliação, médias parciais/finais, frequência e situação de cada aluno.',
    tableTitle: 'Boletim por aluno',
    metrics: [
      { label: 'Alunos ativos', value: students.length.toLocaleString('pt-BR') },
      { label: 'Tabelas de notas', value: summary.tables.length.toLocaleString('pt-BR') },
      { label: 'Média da turma', value: formatGrade(summary.classAverage) },
      { label: 'Aprovados', value: summary.approvedCount.toLocaleString('pt-BR') },
    ],
    headers: [
      'Matrícula',
      'Aluno',
      ...summary.tables.map((t) => text(t, 'name')),
      'Média Geral',
      'Frequência',
      'Situação',
    ],
    rows,
    context: context(input, filters, [
      `Curso: ${text(course, 'name') || 'Não informado'}`,
      `Turma: ${text(classRecord, 'name')}`,
    ]),
    notices: [
      'As médias respeitam o modo de cálculo de cada tabela (Simples, Ponderada ou Soma de Pontos) na escala de 0 a 10.',
    ],
    ready: true,
    matrix: summary.tables.length > 3,
    classBoletimData,
  };
}

function assessmentTypesReport(input: ReportInput, filters: ReportFilters): ReportView {
  const scope = baseScope(input, filters);
  const activeTables = new Map(
    (input.gradeTables ?? [])
      .filter((t) => !t.deleted_at && scope.classIds.has(text(t, 'class_id')))
      .map((t) => [t.id, t]),
  );
  const activeItems = (input.gradeItems ?? []).filter(
    (i) => !i.deleted_at && activeTables.has(text(i, 'grade_table_id')),
  );
  const itemById = new Map(activeItems.map((i) => [i.id, i]));
  const grades = (input.studentGrades ?? []).filter(
    (g) => !g.deleted_at && itemById.has(text(g, 'grade_item_id')) && g.score !== null && g.score !== undefined && g.score !== '',
  );

  const byCategory = new Map<
    string,
    { category: string; classIds: Set<string>; itemIds: Set<string>; scores: number[] }
  >();

  for (const item of activeItems) {
    const cat = text(item, 'category').trim() || 'Avaliação';
    const entry = byCategory.get(cat) ?? {
      category: cat,
      classIds: new Set<string>(),
      itemIds: new Set<string>(),
      scores: [],
    };
    entry.classIds.add(text(item, 'class_id'));
    entry.itemIds.add(item.id);
    byCategory.set(cat, entry);
  }

  for (const grade of grades) {
    const item = itemById.get(text(grade, 'grade_item_id'));
    if (!item) continue;
    const cat = text(item, 'category').trim() || 'Avaliação';
    const norm = normalizeScoreToTen(Number(grade.score), Number(item.max_score ?? 10));
    if (norm !== null) {
      byCategory.get(cat)?.scores.push(norm);
    }
  }

  const allScores = [...byCategory.values()].flatMap((c) => c.scores);
  const overallAvg = allScores.length
    ? roundGrade(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;

  const rows: ExportValue[][] = [...byCategory.values()]
    .sort((a, b) => a.category.localeCompare(b.category))
    .map((entry) => {
      const avg = entry.scores.length
        ? roundGrade(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length)
        : null;
      const min = entry.scores.length ? roundGrade(Math.min(...entry.scores)) : null;
      const max = entry.scores.length ? roundGrade(Math.max(...entry.scores)) : null;
      return [
        entry.category,
        entry.classIds.size,
        entry.itemIds.size,
        entry.scores.length,
        formatGrade(min),
        formatGrade(max),
        formatGrade(avg),
      ];
    });

  return {
    type: filters.type,
    title: 'Desempenho por tipo de avaliação',
    description: 'Análise consolidada das notas agrupadas pelas categorias livres criadas pelos professores (Provas, Práticas, Projetos, etc.).',
    tableTitle: 'Categorias de avaliação no escopo',
    metrics: [
      { label: 'Tipos de avaliação', value: byCategory.size.toLocaleString('pt-BR') },
      { label: 'Avaliações criadas', value: activeItems.length.toLocaleString('pt-BR') },
      { label: 'Notas lançadas', value: allScores.length.toLocaleString('pt-BR') },
      { label: 'Média geral (0-10)', value: formatGrade(overallAvg) },
    ],
    headers: ['Tipo de Avaliação', 'Turmas', 'Avaliações', 'Notas Lançadas', 'Menor Nota', 'Maior Nota', 'Média (0-10)'],
    rows,
    context: context(input, filters),
    notices: ['Todas as notas são normalizadas na escala de 0,0 a 10,0 para permitir comparação direta entre diferentes tipos de atividades.'],
    ready: true,
    matrix: false,
  };
}

function studentBoletimReport(input: ReportInput, filters: ReportFilters): ReportView {
  if (!filters.studentId) {
    return missing(
      filters,
      'Boletim Escolar do Aluno',
      'Selecione uma turma e um aluno para visualizar o boletim escolar individual.'
    );
  }

  const boletim = buildUnifiedBoletimData({
    studentId: filters.studentId,
    classId: filters.classId,
    students: input.students,
    enrollments: input.enrollments,
    classes: input.classes,
    courses: input.courses,
    attendanceRecords: input.attendance,
    gradeTables: input.gradeTables ?? [],
    gradeItems: input.gradeItems ?? [],
    studentGrades: input.studentGrades ?? [],
  });

  if (!boletim) {
    return missing(
      filters,
      'Boletim Escolar do Aluno',
      'Nenhum registro encontrado para o aluno selecionado no período ou turma.'
    );
  }

  const headers = [
    'Módulo / Turma',
    'Aulas Ministradas',
    'Presenças',
    'Faltas',
    'Justificativas',
    'Frequência (%)',
    'Avaliações',
    'Média Final',
    'Situação Acadêmica',
  ];

  const rows: ExportValue[][] = boletim.modules.map((mod) => [
    mod.moduleName,
    mod.classesHeld,
    mod.presences,
    mod.absences,
    mod.justified,
    mod.classesHeld > 0 ? percent(mod.attendanceRate) : '—',
    mod.grades.map((g) => `${g.name}: ${g.score !== null ? g.score.toFixed(1) : '—'}`).join(' | ') || '—',
    mod.finalGrade !== null ? mod.finalGrade.toFixed(1) : '—',
    mod.academicStatus,
  ]);

  const hasAnyClassesHeld = boletim.modules.some((m) => m.classesHeld > 0);
  const metrics: ReportMetric[] = [
    { label: 'Frequência Geral', value: hasAnyClassesHeld ? percent(boletim.overallAttendanceRate) : '—' },
    { label: 'Média Geral', value: boletim.overallGpa !== null ? boletim.overallGpa.toFixed(1) : '—' },
    { label: 'Situação Final', value: boletim.overallAcademicStatus },
  ];

  return {
    type: 'studentBoletim',
    title: `Boletim Escolar — ${boletim.student.name}`,
    description: 'Boletim escolar individual unificado com frequência e desempenho acadêmico.',
    tableTitle: `Boletim Escolar Individual — ${boletim.student.name}`,
    metrics,
    headers,
    rows,
    context: [
      `Aluno: ${boletim.student.name}`,
      `Matrícula: ${boletim.student.registrationNumber || '—'}`,
      `Curso: ${boletim.student.courseName || '—'}`,
      `Turma(s): ${boletim.student.classNames.join(', ') || '—'}`,
      ...context(input, filters),
    ],
    notices: [
      `Critérios ITB: Frequência mínima exigida de ${boletim.criteria.minAttendanceRate.toFixed(1)}% e média mínima para aprovação de ${boletim.criteria.minPassingGrade.toFixed(1)}.`,
    ],
    ready: true,
    matrix: false,
    boletimData: boletim,
  };
}

function missing(filters: ReportFilters, title: string, message: string): ReportView {
  return { type: filters.type, title, description: '', tableTitle: '', metrics: [], headers: [], rows: [], context: [], notices: [], ready: false, requiredMessage: message, matrix: false };
}

export function buildReportView(rawInput: ReportInput, filters: ReportFilters): ReportView {
  const input: ReportInput = {
    attendance: rawInput?.attendance ?? [],
    classes: rawInput?.classes ?? [],
    classNotes: rawInput?.classNotes ?? [],
    classTeachers: rawInput?.classTeachers ?? [],
    courses: rawInput?.courses ?? [],
    directory: rawInput?.directory ?? [],
    enrollments: rawInput?.enrollments ?? [],
    students: rawInput?.students ?? [],
    gradeTables: rawInput?.gradeTables ?? [],
    gradeItems: rawInput?.gradeItems ?? [],
    studentGrades: rawInput?.studentGrades ?? [],
  };
  if (filters.from > filters.to) return missing(filters, reportTypeOptions.find((item) => item.value === filters.type)?.label ?? 'Relatório', 'A data inicial precisa ser anterior ou igual à data final.');
  switch (filters.type) {
    case 'institutional': return institutional(input, filters);
    case 'course': return courseSummary(input, filters);
    case 'classDiary': return classDiary(input, filters);
    case 'classGrades': return classGradesReport(input, filters);
    case 'assessmentTypes': return assessmentTypesReport(input, filters);
    case 'student': return studentSheet(input, filters);
    case 'studentBoletim': return studentBoletimReport(input, filters);
    case 'dropoutRisk': return dropoutRisk(input, filters);
  }
}
