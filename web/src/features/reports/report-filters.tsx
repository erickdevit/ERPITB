import { Box, Button, Card, CardContent, Stack } from '@mui/material';
import { DateField, SelectField } from '../../components';
import { formatDate, parseBrazilDate } from '../../lib/date';
import type { LocalRecord, Role } from '../../types';
import { canManage } from '../../types';
import type { ReportFilters, ReportType } from './model';
import { reportTypeOptions } from './model';

const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

export function ReportFiltersBar({
  filters,
  onChange,
  courses,
  classes,
  students,
  enrollments,
  classTeachers,
  teachers,
  role,
  onReset,
}: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  courses: LocalRecord[];
  classes: LocalRecord[];
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classTeachers: LocalRecord[];
  teachers: LocalRecord[];
  role: Role;
  onReset: () => void;
}) {
  const teacherClassIds = filters.teacherId
    ? new Set(
        classTeachers
          .filter((item) => !item.deleted_at && item.user_id === filters.teacherId)
          .map((item) => item.class_id),
      )
    : undefined;
  const teacherClasses = classes.filter((item) => active(item) && (!teacherClassIds || teacherClassIds.has(item.id)));
  const teacherCourseIds = new Set(teacherClasses.map((item) => item.course_id));
  const availableCourses = courses.filter((item) => active(item) && (!teacherClassIds || teacherCourseIds.has(item.id)));
  const availableClasses = teacherClasses.filter((item) => !filters.courseId || item.course_id === filters.courseId);
  const studentIds = new Set(
    enrollments
      .filter((item) => !item.deleted_at && item.status === 'ativa' && item.class_id === filters.classId)
      .map((item) => item.student_id),
  );
  const availableStudents = students
    .filter((item) => active(item) && studentIds.has(item.id))
    .sort((left, right) => text(left, 'name').localeCompare(text(right, 'name')));
  const showCourse = filters.type === 'course' || filters.type === 'dropoutRisk';
  const showClass = filters.type === 'classDiary' || filters.type === 'student' || filters.type === 'dropoutRisk';

  const changeType = (type: string) =>
    onChange({
      type: type as ReportType,
      from: filters.from,
      to: filters.to,
      teacherId: filters.teacherId,
    });
  const changeDate = (field: 'from' | 'to', value: string) => {
    try {
      const parsed = parseBrazilDate(value);
      if (parsed) onChange({ ...filters, [field]: parsed });
    } catch {
      // DateField mantém visualmente o último valor válido e a mensagem nativa do campo.
    }
  };

  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} flexWrap="wrap" alignItems={{ sm: 'flex-start' }}>
          <Box sx={{ width: { xs: '100%', sm: 260 } }}>
            <SelectField label="Tipo de relatório" value={filters.type} onChange={changeType} options={reportTypeOptions} />
          </Box>
          {canManage(role) && (
            <Box sx={{ width: { xs: '100%', sm: 220 } }}>
              <SelectField
                label="Professor"
                value={filters.teacherId ?? ''}
                onChange={(teacherId) =>
                  onChange({
                    ...filters,
                    teacherId: teacherId || undefined,
                    courseId: undefined,
                    classId: undefined,
                    studentId: undefined,
                  })
                }
                options={[
                  { value: '', label: 'Todos os professores' },
                  ...teachers.map((item) => ({
                    value: item.id,
                    label: text(item, 'name') || `Professor ${item.id.slice(0, 8)}`,
                  })),
                ]}
              />
            </Box>
          )}
          {showCourse && (
            <Box sx={{ width: { xs: '100%', sm: 230 } }}>
              <SelectField
                label="Curso"
                value={filters.courseId ?? ''}
                onChange={(courseId) =>
                  onChange({
                    ...filters,
                    courseId: courseId || undefined,
                    classId: undefined,
                    studentId: undefined,
                  })
                }
                options={[
                  { value: '', label: filters.type === 'dropoutRisk' ? 'Todos os cursos' : 'Selecione um curso' },
                  ...availableCourses.map((item) => ({
                    value: item.id,
                    label: `${text(item, 'code') ? `${text(item, 'code')} · ` : ''}${text(item, 'name')}`,
                  })),
                ]}
              />
            </Box>
          )}
          {showClass && (
            <Box sx={{ width: { xs: '100%', sm: 230 } }}>
              <SelectField
                label="Turma"
                value={filters.classId ?? ''}
                onChange={(classId) =>
                  onChange({
                    ...filters,
                    classId: classId || undefined,
                    studentId: undefined,
                  })
                }
                options={[
                  { value: '', label: filters.type === 'dropoutRisk' ? 'Todas as turmas' : 'Selecione uma turma' },
                  ...availableClasses.map((item) => ({ value: item.id, label: text(item, 'name') })),
                ]}
              />
            </Box>
          )}
          {filters.type === 'student' && (
            <Box sx={{ width: { xs: '100%', sm: 260 } }}>
              <SelectField
                label="Aluno"
                value={filters.studentId ?? ''}
                onChange={(studentId) => onChange({ ...filters, studentId: studentId || undefined })}
                options={[
                  { value: '', label: 'Selecione um aluno' },
                  ...availableStudents.map((item) => ({
                    value: item.id,
                    label: `${text(item, 'name')} · ${text(item, 'registration_number')}`,
                  })),
                ]}
              />
            </Box>
          )}
          <Box sx={{ width: { xs: '100%', sm: 170 } }}>
            <DateField label="Data inicial" value={formatDate(filters.from)} onChange={(value) => changeDate('from', value)} />
          </Box>
          <Box sx={{ width: { xs: '100%', sm: 170 } }}>
            <DateField label="Data final" value={formatDate(filters.to)} onChange={(value) => changeDate('to', value)} />
          </Box>
          <Button
            size="small"
            onClick={onReset}
            sx={{ minHeight: 40, alignSelf: { sm: 'center' }, color: 'text.secondary', fontWeight: 600, fontSize: 13 }}
          >
            Limpar filtros
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
