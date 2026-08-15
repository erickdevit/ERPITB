import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Users,
  Search,
  Edit2,
  Trash2,
  UserCheck,
  Calendar,
  Clock,
  FlaskConical,
  Baby,
  Filter,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../app-context';
import { PageDialog, Section, SelectField } from '../components';
import type { LocalRecord } from '../types';
import {
  buildClassViews,
  classShifts,
  classWeekDays,
  filterClassViews,
  permissionsForClasses,
  planTeacherToggle,
  shiftLabel,
  validateClassDraft,
  type ClassDraft,
  type ClassView,
} from './classes-model';
import { useEntity } from '../lib/use-entity';

const identifier = () => crypto.randomUUID();
const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const emptyDraft = (): ClassDraft => ({
  name: '',
  courseId: '',
  shift: 'manha',
  weekDay: '',
  laboratoryId: '',
  teacherId: '',
  isKids: false,
});

function TeacherNames({ row }: { row: ClassView }) {
  return (
    <span className="text-xs text-slate-500 font-medium">
      {row.teachers.length ? row.teachers.map((t) => t.name).join(', ') : 'Sem professor vinculado'}
    </span>
  );
}

export function ClassesPage() {
  const { store, sync, session, api } = useApp();
  const classes = useEntity('classes');
  const courses = useEntity('courses');
  const laboratories = useEntity('laboratories');
  const classTeachers = useEntity('class_teachers');
  const [teachers, setTeachers] = useState<LocalRecord[]>([]);
  const [teachersLoaded, setTeachersLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<ClassDraft>(emptyDraft);
  const [formError, setFormError] = useState<string>();

  const [teachersModalClass, setTeachersModalClass] = useState<ClassView>();
  const [teachersModalError, setTeachersModalError] = useState<string>();

  const permissions = permissionsForClasses(session.role);

  useEffect(() => {
    if (session.role === 'professor') {
      setTeachers([]);
      setTeachersLoaded(false);
      return;
    }
    let alive = true;
    api
      .get<{ items: LocalRecord[] }>('/users?role=professor')
      .then((res) => {
        if (!alive) return;
        setTeachers(res.items.filter(active));
        setTeachersLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setTeachers([]);
        setTeachersLoaded(false);
      });
    return () => {
      alive = false;
    };
  }, [api, session.role]);

  const rows = useMemo(() => {
    const raw = buildClassViews({
      classes: classes.items,
      courses: courses.items,
      laboratories: laboratories.items,
      assignments: classTeachers.items,
      teachers,
      session,
    });
    return filterClassViews(raw, search, filterTeacherId);
  }, [classes.items, courses.items, laboratories.items, classTeachers.items, teachers, session, search, filterTeacherId]);

  const courseOptions = useMemo(
    () => [
      { value: '', label: 'Selecione um curso' },
      ...courses.items.filter(active).map((c) => ({ value: c.id, label: `${text(c, 'name')} (${text(c, 'code')})` })),
    ],
    [courses.items],
  );

  const labOptions = useMemo(
    () => [
      { value: '', label: 'Nenhum laboratório' },
      ...laboratories.items.filter(active).map((l) => ({ value: l.id, label: text(l, 'name') })),
    ],
    [laboratories.items],
  );

  const teacherOptions = useMemo(
    () => [
      { value: '', label: 'Nenhum professor selecionado' },
      ...teachers.map((t) => ({ value: t.id, label: text(t, 'name') })),
    ],
    [teachers],
  );

  const openCreate = () => {
    setEditingId(undefined);
    setDraft(emptyDraft());
    setFormError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (row: ClassView) => {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      courseId: row.courseId,
      shift: row.shift,
      weekDay: row.weekDay,
      laboratoryId: text(row.record, 'laboratory_id'),
      teacherId: '',
      isKids: row.isKids,
    });
    setFormError(undefined);
    setDialogOpen(true);
  };

  const saveClass = async () => {
    const availableCourseIds = new Set(courses.items.filter(active).map((c) => c.id));
    const error = validateClassDraft(draft, availableCourseIds);
    if (error) {
      setFormError(error);
      return;
    }

    try {
      if (editingId) {
        await store.mutate('classes', {
          id: editingId,
          name: draft.name.trim(),
          course_id: draft.courseId,
          shift: draft.shift,
          week_day: draft.weekDay || null,
          laboratory_id: draft.laboratoryId || null,
          is_kids: draft.isKids ? 1 : 0,
        });
      } else {
        const classId = identifier();
        await store.mutate('classes', {
          id: classId,
          name: draft.name.trim(),
          course_id: draft.courseId,
          shift: draft.shift,
          week_day: draft.weekDay || null,
          laboratory_id: draft.laboratoryId || null,
          is_kids: draft.isKids ? 1 : 0,
          active: 1,
        });

        if (draft.teacherId) {
          await store.mutate('class_teachers', {
            id: identifier(),
            class_id: classId,
            user_id: draft.teacherId,
          });
        }
      }

      await Promise.all([classes.reload(), classTeachers.reload()]);
      setDialogOpen(false);
      void sync();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar turma.');
    }
  };

  const deleteClass = async (row: ClassView) => {
    if (!window.confirm(`Deseja realmente excluir a turma "${row.name}"?`)) return;
    try {
      await store.mutate('classes', { id: row.id }, 'delete');
      await classes.reload();
      void sync();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir turma.');
    }
  };

  const openTeacherAssignment = (row: ClassView) => {
    setTeachersModalClass(row);
    setTeachersModalError(undefined);
  };

  const handleTeacherToggle = async (teacherId: string, checked: boolean) => {
    if (!teachersModalClass) return;
    try {
      const plan = planTeacherToggle(classTeachers.items, teachersModalClass.id, teacherId, checked);
      if (plan.kind === 'error') {
        setTeachersModalError(plan.message);
        return;
      }
      if (plan.kind === 'upsert') {
        await store.mutate('class_teachers', {
          id: plan.record?.id ?? identifier(),
          class_id: teachersModalClass.id,
          user_id: teacherId,
        });
      } else if (plan.kind === 'delete' && plan.record) {
        await store.mutate('class_teachers', { id: plan.record.id }, 'delete');
      }
      await classTeachers.reload();
      void sync();
    } catch (e) {
      setTeachersModalError(e instanceof Error ? e.message : 'Erro ao atualizar professor.');
    }
  };

  return (
    <div className="flex flex-col gap-5 text-left">
      <Section
        title="Turmas"
        subtitle="Gerenciamento de turmas, turnos, salas e atribuição de professores."
        action={
          permissions.canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova turma</span>
            </button>
          )
        }
      />

      {session.role === 'professor' && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs sm:text-sm text-sky-800">
          <Info className="w-4 h-4 text-sky-600 shrink-0" />
          <span>Estas são as turmas atribuídas a você.</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-class" className="text-xs font-semibold text-slate-700">
                Buscar turma
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="search-class"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome da turma..."
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {permissions.canAssignTeachers && (
            <div>
              <SelectField
                label="Professor"
                value={filterTeacherId}
                onChange={setFilterTeacherId}
                options={[{ value: '', label: 'Todos os professores' }, ...teacherOptions.slice(1)]}
              />
            </div>
          )}
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                <th className="py-3 px-4">Turma</th>
                <th className="py-3 px-4">Curso</th>
                <th className="py-3 px-4">Turno / Dia</th>
                <th className="py-3 px-4">Laboratório</th>
                <th className="py-3 px-4">Professor(es)</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/turmas/${row.id}`}
                        className="font-bold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
                      >
                        {row.name}
                      </Link>
                      {row.isKids && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 border border-amber-200 text-amber-700">
                          Kids
                        </span>
                      )}
                      {!row.active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-500">
                          Inativa
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-semibold">{row.courseName}</td>
                  <td className="py-3 px-4 text-slate-500">
                    {shiftLabel(row.shift)}
                    {row.weekDay ? ` · ${row.weekDay}` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{row.laboratoryName || '—'}</td>
                  <td className="py-3 px-4">
                    <TeacherNames row={row} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      {permissions.canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar ${row.name}`}
                          onClick={() => openEdit(row)}
                          title="Editar turma"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canAssignTeachers && (
                        <button
                          type="button"
                          aria-label={`Gerenciar professores de ${row.name}`}
                          onClick={() => openTeacherAssignment(row)}
                          title="Gerenciar professores"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canDelete && (
                        <button
                          type="button"
                          aria-label={`Excluir ${row.name}`}
                          onClick={() => deleteClass(row)}
                          title="Excluir turma"
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
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma turma encontrada.
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
        title={editingId ? 'Editar turma' : 'Nova turma'}
        onClose={() => setDialogOpen(false)}
        onSave={saveClass}
      >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="class-name-input" className="text-xs font-semibold text-slate-700">
            Nome da turma <span className="text-rose-500">*</span>
          </label>
          <input
            id="class-name-input"
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft((cur) => ({ ...cur, name: e.target.value }))}
            placeholder="Ex: Turma A - Informática"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <SelectField
          label="Curso"
          value={draft.courseId}
          onChange={(val) => setDraft((cur) => ({ ...cur, courseId: val }))}
          options={courseOptions}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Turno"
            value={draft.shift}
            onChange={(val) => setDraft((cur) => ({ ...cur, shift: val as any }))}
            options={classShifts.map((s) => ({ value: s, label: shiftLabel(s) }))}
          />
          <SelectField
            label="Dia da semana"
            value={draft.weekDay}
            onChange={(val) => setDraft((cur) => ({ ...cur, weekDay: val }))}
            options={[{ value: '', label: 'Não definido' }, ...classWeekDays.map((d) => ({ value: d, label: d }))]}
          />
        </div>

        <SelectField
          label="Laboratório"
          value={draft.laboratoryId}
          onChange={(val) => setDraft((cur) => ({ ...cur, laboratoryId: val }))}
          options={labOptions}
        />

        {!editingId && (
          <SelectField
            label="Professor responsável inicial"
            value={draft.teacherId}
            onChange={(val) => setDraft((cur) => ({ ...cur, teacherId: val }))}
            options={teacherOptions}
          />
        )}

        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={draft.isKids}
            onChange={(e) => setDraft((cur) => ({ ...cur, isKids: e.target.checked }))}
            className="w-4 h-4 rounded text-slate-900 focus:ring-slate-950 border-slate-300"
          />
          <span className="text-xs font-semibold text-slate-700">Turma Kids (infantil)</span>
        </label>
      </PageDialog>

      {/* Teacher Assignment Modal */}
      {teachersModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            onClick={() => setTeachersModalClass(undefined)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 z-10 text-left">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Professores da turma: {teachersModalClass.name}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Selecione os professores que lecionam nesta turma.
            </p>

            {teachersModalError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {teachersModalError}
              </div>
            )}

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {teachers.map((teacher) => {
                const checked = teachersModalClass.teachers.some((t) => t.id === teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-semibold text-slate-800">{text(teacher, 'name')}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => void handleTeacherToggle(teacher.id, e.target.checked)}
                      className="w-4 h-4 rounded text-slate-900 focus:ring-slate-950 border-slate-300"
                    />
                  </label>
                );
              })}
              {!teachers.length && (
                <div className="p-4 text-center text-xs text-slate-400">
                  Nenhum professor cadastrado no sistema.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTeachersModalClass(undefined)}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
