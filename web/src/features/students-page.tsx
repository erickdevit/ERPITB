import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  UserX,
  GraduationCap,
  Calendar,
  Phone,
  Filter,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../app-context';
import { DateField, PageDialog, Section, SelectField } from '../components';
import { formatDate, parseBrazilDate, todayInSaoPaulo } from '../lib/date';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';
import {
  buildStudentViews,
  classesVisibleToSession,
  enrollmentStatusLabel,
  filterStudentViews,
  permissionsForStudents,
  type StudentDraft,
  type StudentView,
  validateStudentDraft,
} from './students-model';

const identifier = () => crypto.randomUUID();
const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

const emptyDraft = (initialClassId = ''): StudentDraft => ({
  name: '',
  registrationNumber: '',
  cpf: '',
  contact: '',
  birthDate: '',
  classId: initialClassId,
});

function RateChip({ row }: { row: StudentView }) {
  if (row.attendanceRate === null || row.attendanceRate === undefined) {
    return (
      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-500 border border-slate-200">
        Sem aulas
      </span>
    );
  }
  const isGood = row.attendanceRate >= 75;
  return (
    <span
      className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${
        isGood
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200'
      }`}
    >
      {row.attendanceRate}%
    </span>
  );
}

export function StudentsPage({ today = todayInSaoPaulo() }: { today?: string }) {
  const { store, sync, session, api } = useApp();
  const students = useEntity('students');
  const enrollments = useEntity('enrollments');
  const classes = useEntity('classes');
  const classTeachers = useEntity('class_teachers');
  const attendance = useEntity('attendance_records');

  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<StudentDraft>(() => emptyDraft());
  const [formError, setFormError] = useState<string>();

  const permissions = permissionsForStudents(session.role);

  const visibleClasses = useMemo(
    () => classesVisibleToSession(classes.items, classTeachers.items, session),
    [classes.items, classTeachers.items, session],
  );

  const rows = useMemo(() => {
    const raw = buildStudentViews({
      students: students.items,
      enrollments: enrollments.items,
      classes: classes.items,
      assignments: classTeachers.items,
      attendance: attendance.items,
      session,
    });
    return filterStudentViews(raw, {
      query: search,
      classId: filterClassId,
      teacherId: '',
      performance: '',
      enrollmentStatus: filterStatus === 'all' ? '' : filterStatus,
    });
  }, [students.items, enrollments.items, classes.items, classTeachers.items, attendance.items, session, search, filterClassId, filterStatus]);

  const classOptions = useMemo(
    () => [
      { value: '', label: 'Selecione uma turma' },
      ...visibleClasses.map((c) => ({ value: c.id, label: text(c, 'name') })),
    ],
    [visibleClasses],
  );

  const openCreate = () => {
    setEditingId(undefined);
    setDraft(emptyDraft(visibleClasses[0]?.id ?? ''));
    setFormError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (row: StudentView) => {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      registrationNumber: row.registrationNumber,
      cpf: row.cpf || '',
      contact: row.contact,
      birthDate: formatDate(row.birthDate),
      classId: row.classId,
    });
    setFormError(undefined);
    setDialogOpen(true);
  };

  const saveStudent = async () => {
    const availableClassIds = new Set(visibleClasses.map((c) => c.id));
    const error = validateStudentDraft(draft, availableClassIds);
    if (error) {
      setFormError(error);
      return;
    }

    try {
      let birthDateIso = '';
      if (draft.birthDate) {
        birthDateIso = parseBrazilDate(draft.birthDate, { allowFuture: false }) ?? '';
      }

      if (editingId) {
        await store.mutate('students', {
          id: editingId,
          name: draft.name.trim(),
          registration_number: draft.registrationNumber.trim() || null,
          cpf: draft.cpf.trim() || null,
          birth_date: birthDateIso || null,
          contact: draft.contact.trim() || null,
          active: 1,
        });

        if (draft.classId && store.moveStudent) {
          await store.moveStudent(editingId, draft.classId);
        }
      } else {
        const studentId = identifier();
        await store.mutate('students', {
          id: studentId,
          name: draft.name.trim(),
          registration_number: draft.registrationNumber.trim() || null,
          cpf: draft.cpf.trim() || null,
          birth_date: birthDateIso || null,
          contact: draft.contact.trim() || null,
          active: 1,
        });

        if (draft.classId && store.moveStudent) {
          await store.moveStudent(studentId, draft.classId);
        }
      }

      await Promise.all([students.reload(), enrollments.reload()]);
      setDialogOpen(false);
      void sync();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar aluno.');
    }
  };

  const inactivateStudent = async (row: StudentView) => {
    if (!window.confirm(`Deseja realmente inativar o cadastro do aluno "${row.name}"?`)) return;
    try {
      await store.mutate('students', { id: row.id, active: 0 });
      await students.reload();
      void sync();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao inativar aluno.');
    }
  };

  const deleteStudent = async (row: StudentView) => {
    if (!window.confirm(`Deseja realmente excluir o cadastro do aluno "${row.name}"?`)) return;
    try {
      await store.mutate('students', { id: row.id }, 'delete');
      await students.reload();
      void sync();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir aluno.');
    }
  };

  return (
    <div className="flex flex-col gap-5 text-left">
      <Section
        title="Alunos"
        subtitle="Cadastro de alunos, histórico de matrículas e taxas de frequência."
        action={
          permissions.canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo aluno</span>
            </button>
          )
        }
      />

      {session.role === 'professor' && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs sm:text-sm text-sky-800">
          <Info className="w-4 h-4 text-sky-600 shrink-0" />
          <span>Exibindo somente os alunos das turmas atribuídas a você.</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="lg:col-span-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-student-page" className="text-xs font-medium text-slate-700">
                Buscar aluno
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="search-student-page"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou matrícula do aluno..."
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div>
            <SelectField
              label="Turma"
              value={filterClassId}
              onChange={setFilterClassId}
              options={[
                { value: '', label: 'Todas as turmas' },
                ...visibleClasses.map((c) => ({ value: c.id, label: text(c, 'name') })),
              ]}
            />
          </div>

          <div>
            <SelectField
              label="Situação da matrícula"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'ativa', label: 'Ativas' },
                { value: 'trancada', label: 'Trancadas' },
                { value: 'concluida', label: 'Concluídas' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                <th className="py-3 px-4">Matrícula</th>
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-4">Nascimento</th>
                <th className="py-3 px-4">Cadastro</th>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4">Taxa</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/75 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-500">{row.registrationNumber || '—'}</td>
                  <td className="py-3 px-4">
                    <Link
                      to={`/alunos/${row.id}`}
                      className="font-bold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-semibold">{row.className}</td>
                  <td className="py-3 px-4 text-slate-500">{formatDate(row.birthDate) || '—'}</td>
                  <td className="py-3 px-4 text-slate-500">{formatDate(row.registrationDate) || '—'}</td>
                  <td className="py-3 px-4 text-slate-500">{row.contact || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                        row.enrollmentStatus === 'ativa'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {enrollmentStatusLabel(row.enrollmentStatus)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <RateChip row={row} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      {permissions.canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar ${row.name}`}
                          onClick={() => openEdit(row)}
                          title="Editar aluno"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canInactivate && (
                        <button
                          type="button"
                          aria-label={`Inativar ${row.name}`}
                          onClick={() => inactivateStudent(row)}
                          title="Inativar aluno"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canDelete && (
                        <button
                          type="button"
                          aria-label={`Excluir ${row.name}`}
                          onClick={() => deleteStudent(row)}
                          title="Excluir cadastro"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhum aluno encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <PageDialog
        open={dialogOpen}
        title={editingId ? 'Editar aluno' : 'Novo aluno'}
        onClose={() => setDialogOpen(false)}
        onSave={saveStudent}
      >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="student-name-input" className="text-xs font-semibold text-slate-700">
            Nome completo <span className="text-rose-500">*</span>
          </label>
          <input
            id="student-name-input"
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft((cur) => ({ ...cur, name: e.target.value }))}
            placeholder="Nome do aluno"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="student-reg-input" className="text-xs font-semibold text-slate-700">
            Matrícula <span className="text-rose-500">*</span>
          </label>
          <input
            id="student-reg-input"
            type="text"
            required
            value={draft.registrationNumber}
            onChange={(e) => setDraft((cur) => ({ ...cur, registrationNumber: e.target.value }))}
            placeholder="Ex: 2026001"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <SelectField
          label="Turma inicial"
          value={draft.classId}
          onChange={(val) => setDraft((cur) => ({ ...cur, classId: val }))}
          options={classOptions}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateField
            label="Data de nascimento"
            value={draft.birthDate}
            onChange={(val) => setDraft((cur) => ({ ...cur, birthDate: val }))}
          />
          <div className="flex flex-col gap-1.5 text-left">
            <label htmlFor="student-contact-input" className="text-xs font-semibold text-slate-700">
              Telefone / Contato
            </label>
            <input
              id="student-contact-input"
              type="text"
              value={draft.contact}
              onChange={(e) => setDraft((cur) => ({ ...cur, contact: e.target.value }))}
              placeholder="(00) 00000-0000"
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </PageDialog>
    </div>
  );
}
