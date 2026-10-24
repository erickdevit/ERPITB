import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  UserX,
  UserCheck,
  Edit2,
  Trash2,
  Shield,
  KeyRound,
  Mail,
  User,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../app-context';
import { PageDialog, Section, SelectField } from '../components';
import { roleLabel, type Role, type UserSession } from '../types';
import type { LocalRecord } from '../types';
import { useEntity } from '../lib/use-entity';

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'professor', label: 'Professor' },
  { value: 'pedagogico', label: 'Pedagógico' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'admin', label: 'Administrador' },
];

export function UsersPage() {
  const { api, session } = useApp();
  const classes = useEntity('classes');
  const classTeachers = useEntity('class_teachers');

  const [users, setUsers] = useState<LocalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('professor');
  const [activeState, setActiveState] = useState<number>(1);
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await api.get<{ items: LocalRecord[] }>('/users');
      setUsers(Array.isArray(result?.items) ? result.items : []);
    } catch (e) {
      console.error(e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const getAssignedClassNames = (userId: string): string[] => {
    const assignments = (classTeachers.items ?? []).filter(
      (ct) => ct.user_id === userId && !ct.deleted_at,
    );
    if (assignments.length === 0) return [];
    const classMap = new Map((classes.items ?? []).map((c) => [c.id, text(c, 'name')]));
    return assignments
      .map((a) => classMap.get(String(a.class_id || '')) || 'Turma')
      .filter(Boolean);
  };

  const filteredUsers = useMemo(() => {
    return (users ?? []).filter((u) => {
      if (!u) return false;
      if (filterRole !== 'all' && u.role !== filterRole) return false;
      if (filterStatus === 'active' && !active(u)) return false;
      if (filterStatus === 'inactive' && active(u)) return false;

      const term = search.trim().toLocaleLowerCase('pt-BR');
      if (!term) return true;

      const userName = text(u, 'name').toLocaleLowerCase('pt-BR');
      const userEmail = text(u, 'email').toLocaleLowerCase('pt-BR');
      return userName.includes(term) || userEmail.includes(term);
    });
  }, [users, filterRole, filterStatus, search]);

  const openCreate = () => {
    setEditingId(undefined);
    setName('');
    setEmail('');
    setRole('professor');
    setActiveState(1);
    setPassword('');
    setFormError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (user: LocalRecord) => {
    setEditingId(user.id);
    setName(text(user, 'name'));
    setEmail(text(user, 'email'));
    setRole((text(user, 'role') as Role) || 'professor');
    setActiveState(active(user) ? 1 : 0);
    setPassword('');
    setFormError(undefined);
    setDialogOpen(true);
  };

  const saveUser = async () => {
    if (!name.trim() || !email.trim()) {
      setFormError('Nome e e-mail são campos obrigatórios.');
      return;
    }

    if (!editingId && !password.trim()) {
      setFormError('A senha inicial é obrigatória para novos usuários.');
      return;
    }

    if (password.trim() && password.trim().length < 6) {
      setFormError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setSaving(true);
    setFormError(undefined);

    try {
      if (editingId) {
        await api.patch(`/users/${editingId}`, {
          name: name.trim(),
          email: email.trim(),
          role,
          active: activeState,
          password: password.trim() ? password.trim() : undefined,
        });
      } else {
        await api.post('/users', {
          name: name.trim(),
          email: email.trim(),
          role,
          password: password.trim(),
        });
      }
      await loadUsers();
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (user: LocalRecord) => {
    const isAct = active(user);
    const actionName = isAct ? 'inativar' : 'reativar';
    if (!window.confirm(`Deseja realmente ${actionName} o usuário "${text(user, 'name')}"?`)) return;

    try {
      await api.patch(`/users/${user.id}`, { active: isAct ? 0 : 1 });
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao alterar situação do usuário.');
    }
  };

  const deleteUser = async (user: LocalRecord) => {
    if (user.id === session.id) {
      alert('Você não pode excluir sua própria conta de administrador.');
      return;
    }

    const assignedClasses = getAssignedClassNames(user.id);
    if (assignedClasses.length > 0) {
      alert(
        `Não é possível excluir o usuário "${text(user, 'name')}" pois ele está vinculado à(s) seguinte(s) turma(s):\n\n• ${assignedClasses.join('\n• ')}\n\nRemova a atribuição deste professor nas turmas antes de realizar a exclusão.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `ATENÇÃO: Deseja realmente excluir permanentemente o usuário "${text(user, 'name')}" (${text(user, 'email')})?\n\nEsta ação é definitiva e removerá completamente o cadastro do colaborador.`,
    );
    if (!confirmed) return;

    try {
      await api.delete(`/users/${user.id}`);
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir usuário.');
    }
  };

  return (
    <div className="flex flex-col gap-3.5 text-left">
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-user" className="text-xs font-medium text-slate-700">
                Buscar nome ou e-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="search-user"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou e-mail..."
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="w-full sm:w-48">
            <SelectField
              label="Perfil de acesso"
              value={filterRole}
              onChange={setFilterRole}
              options={[{ value: 'all', label: 'Todos os perfis' }, ...roleOptions]}
            />
          </div>

          <div className="w-full sm:w-40">
            <SelectField
              label="Situação"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'active', label: 'Ativos' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>

          <div className="shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer w-full sm:w-auto h-[38px]"
            >
              <Plus className="w-4 h-4" />
              <span>Novo usuário</span>
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {!filteredUsers?.length ? (
          <div className="p-8 text-center text-slate-400 text-xs font-medium">
            {loading ? 'Carregando usuários...' : 'Nenhum usuário encontrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {(filteredUsers ?? []).map((user) => {
                  const assignedClasses = getAssignedClassNames(user.id);
                  const isAssigned = assignedClasses.length > 0;
                  const isSelf = user.id === session.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center">
                            {text(user, 'name').slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{text(user, 'name')}</span>
                            {isAssigned && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                {assignedClasses.length} turma(s) atribuída(s)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{text(user, 'email')}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {roleLabel[text(user, 'role') as Role] ?? text(user, 'role')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                            active(user)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {active(user) ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* Edit User Button */}
                          <button
                            type="button"
                            aria-label={`Editar ${text(user, 'name')}`}
                            onClick={() => openEdit(user)}
                            title="Editar dados e senha do usuário"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Inactivate/Activate Button */}
                          {!isSelf && (
                            <button
                              type="button"
                              aria-label={`Inativar ${text(user, 'name')}`}
                              onClick={() => void toggleUserStatus(user)}
                              title={active(user) ? 'Inativar acesso' : 'Reativar acesso'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                active(user)
                                  ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {active(user) ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {/* Delete User Button (Sensitive, blocked if assigned) */}
                          {!isSelf && (
                            <button
                              type="button"
                              aria-label={`Excluir ${text(user, 'name')}`}
                              onClick={() => void deleteUser(user)}
                              title={
                                isAssigned
                                  ? `Não é possível excluir: vinculado a ${assignedClasses.join(', ')}`
                                  : 'Excluir usuário permanentemente'
                              }
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isAssigned
                                  ? 'text-slate-300 hover:text-slate-400 hover:bg-slate-50 opacity-60'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Create / Edit Dialog */}
      <PageDialog
        open={dialogOpen}
        title={editingId ? 'Editar usuário' : 'Novo usuário'}
        onClose={() => setDialogOpen(false)}
        onSave={saveUser}
      >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="user-name-input" className="text-xs font-semibold text-slate-700">
            Nome completo <span className="text-rose-500">*</span>
          </label>
          <input
            id="user-name-input"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do colaborador"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="user-email-input" className="text-xs font-semibold text-slate-700">
            E-mail institucional <span className="text-rose-500">*</span>
          </label>
          <input
            id="user-email-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@itbcursos.com"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        <SelectField
          label="Papel / Perfil de acesso"
          value={role}
          onChange={(val) => setRole(val as Role)}
          options={roleOptions}
        />

        {editingId && (
          <SelectField
            label="Situação cadastral"
            value={String(activeState)}
            onChange={(val) => setActiveState(Number(val))}
            options={[
              { value: '1', label: 'Ativo' },
              { value: '0', label: 'Inativo' },
            ]}
          />
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="user-pwd-input" className="text-xs font-semibold text-slate-700">
            {editingId ? 'Nova senha de acesso (opcional)' : 'Senha inicial de acesso'}{' '}
            {!editingId && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="user-pwd-input"
            type="password"
            required={!editingId}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editingId ? '•••••••• (deixe em branco para manter a atual)' : '••••••••'}
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
          {editingId && (
            <span className="text-[11px] text-slate-400">
              Preencha somente se desejar redefinir a senha do colaborador.
            </span>
          )}
        </div>
      </PageDialog>
    </div>
  );
}
