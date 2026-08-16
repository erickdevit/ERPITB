import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  UserX,
  UserCheck,
  Shield,
  KeyRound,
  Mail,
  User,
} from 'lucide-react';
import { useApp } from '../app-context';
import { PageDialog, Section, SelectField } from '../components';
import { roleLabel, type Role, type UserSession } from '../types';
import type { LocalRecord } from '../types';

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const active = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'professor', label: 'Professor' },
  { value: 'pedagogico', label: 'Pedagógico' },
  { value: 'admin', label: 'Administrador' },
];

export function UsersPage() {
  const { api, session } = useApp();
  const [users, setUsers] = useState<LocalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('professor');
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
    setName('');
    setEmail('');
    setRole('professor');
    setPassword('');
    setFormError(undefined);
    setDialogOpen(true);
  };

  const saveUser = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setFormError('Todos os campos são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/users', {
        name: name.trim(),
        email: email.trim(),
        role,
        password,
      });
      await loadUsers();
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao cadastrar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (user: LocalRecord) => {
    const isAct = active(user);
    const actionName = isAct ? 'inativar' : 'reativar';
    if (!window.confirm(`Deseja realmente ${actionName} o usuário "${text(user, 'name')}"?`)) return;

    try {
      if (isAct) {
        await api.request(`/users/${user.id}`, 'DELETE');
      } else {
        await api.request(`/users/${user.id}`, 'PATCH', { active: 1 });
      }
      await loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao alterar situação do usuário.');
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
                {(filteredUsers ?? []).map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center">
                          {text(user, 'name').slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-bold text-slate-900">{text(user, 'name')}</span>
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
                      {user.id !== session.id && (
                        <button
                          type="button"
                          aria-label={`Inativar ${text(user, 'name')}`}
                          onClick={() => void toggleUserStatus(user)}
                          title={active(user) ? 'Inativar usuário' : 'Reativar usuário'}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          {active(user) ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <PageDialog
        open={dialogOpen}
        title="Novo usuário"
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

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="user-pwd-input" className="text-xs font-semibold text-slate-700">
            Senha inicial de acesso <span className="text-rose-500">*</span>
          </label>
          <input
            id="user-pwd-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>
      </PageDialog>
    </div>
  );
}
