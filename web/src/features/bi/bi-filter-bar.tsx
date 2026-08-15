import { Box, Button, Stack } from '@mui/material';
import { DateField, SelectField } from '../../components';
import { formatDate, parseBrazilDate } from '../../lib/date';
import type { LocalRecord } from '../../types';
import type { BiFilters } from './model';

const text = (record: LocalRecord, field: string) => String(record[field] ?? '');

export function BiFilterBar({ filters, onChange, courses, classes, teachers, onReset }: {
  filters: BiFilters;
  onChange: (next: BiFilters) => void;
  courses: LocalRecord[];
  classes: LocalRecord[];
  teachers: LocalRecord[];
  onReset: () => void;
}) {
  const availableClasses = classes.filter((item) => !filters.courseId || item.course_id === filters.courseId);
  const updateDate = (field: 'from' | 'to', value: string) => {
    try { const parsed = parseBrazilDate(value, { allowFuture: true }); if (parsed) onChange({ ...filters, [field]: parsed }); } catch { /* DateField keeps the last valid value. */ }
  };
  return <Box component="section" aria-label="Filtros do B.I" sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, md: 2 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} flexWrap="wrap" alignItems={{ sm: 'flex-start' }}>
      <Box sx={{ width: { xs: '100%', sm: 190 } }}><DateField label="Data inicial" value={formatDate(filters.from)} onChange={(value) => updateDate('from', value)} /></Box>
      <Box sx={{ width: { xs: '100%', sm: 190 } }}><DateField label="Data final" value={formatDate(filters.to)} onChange={(value) => updateDate('to', value)} /></Box>
      <Box sx={{ width: { xs: '100%', sm: 240 } }}><SelectField label="Curso" value={filters.courseId ?? ''} onChange={(courseId) => onChange({ ...filters, courseId: courseId || undefined, classId: undefined })} options={[{ value: '', label: 'Todos os cursos' }, ...courses.filter((item) => !item.deleted_at).map((item) => ({ value: item.id, label: text(item, 'name') }))]} /></Box>
      <Box sx={{ width: { xs: '100%', sm: 240 } }}><SelectField label="Turma" value={filters.classId ?? ''} onChange={(classId) => onChange({ ...filters, classId: classId || undefined })} options={[{ value: '', label: 'Todas as turmas' }, ...availableClasses.filter((item) => !item.deleted_at).map((item) => ({ value: item.id, label: text(item, 'name') }))]} /></Box>
      <Box sx={{ width: { xs: '100%', sm: 220 } }}><SelectField label="Professor" value={filters.teacherId ?? ''} onChange={(teacherId) => onChange({ ...filters, teacherId: teacherId || undefined })} options={[{ value: '', label: 'Todos os professores' }, ...teachers.map((item) => ({ value: item.id, label: text(item, 'name') || `Professor ${item.id.slice(0, 8)}` }))]} /></Box>
      <Box sx={{ width: { xs: '100%', sm: 180 } }}><SelectField label="Turno" value={filters.shift ?? ''} onChange={(shift) => onChange({ ...filters, shift: shift || undefined })} options={[{ value: '', label: 'Todos os turnos' }, { value: 'manha', label: 'Manhã' }, { value: 'tarde', label: 'Tarde' }, { value: 'noite', label: 'Noite' }, { value: 'integral', label: 'Integral' }]} /></Box>
      <Button onClick={onReset} sx={{ minHeight: 48, alignSelf: { sm: 'center' } }}>Limpar filtros</Button>
    </Stack>
  </Box>;
}
