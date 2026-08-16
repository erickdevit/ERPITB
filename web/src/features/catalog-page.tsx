import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  BookOpen,
  FlaskConical,
  Code2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../app-context';
import { PageDialog, Section, SelectField } from '../components';
import { useEntity } from '../lib/use-entity';
import type { LocalRecord } from '../types';

const identifier = () => crypto.randomUUID();
const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const enabled = (record: Record<string, unknown> | undefined) =>
  record?.active !== 0 && record?.active !== false && !record?.deleted_at;

interface CatalogProps {
  type: 'courses' | 'laboratories';
}

function CatalogPage({ type }: CatalogProps) {
  const { store, sync, session } = useApp();
  const entity = useEntity(type);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LocalRecord>();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [activeState, setActiveState] = useState(true);
  const [formError, setFormError] = useState<string>();

  const isCourse = type === 'courses';
  const title = isCourse ? 'Cursos' : 'Laboratórios';
  const singular = isCourse ? 'curso' : 'laboratório';
  const canCreateOrDelete = session.role === 'admin';
  const canEdit = session.role === 'admin' || session.role === 'pedagogico';

  const items = useMemo(() => {
    return entity.items.filter((item) => {
      if (item.deleted_at) return false;
      if (filterStatus === 'active' && !enabled(item)) return false;
      if (filterStatus === 'inactive' && enabled(item)) return false;

      const term = search.trim().toLocaleLowerCase('pt-BR');
      if (!term) return true;

      const itemName = text(item, 'name').toLocaleLowerCase('pt-BR');
      const itemCode = text(item, 'code').toLocaleLowerCase('pt-BR');
      return itemName.includes(term) || itemCode.includes(term);
    });
  }, [entity.items, filterStatus, search]);

  const startCreate = () => {
    setEditingItem(undefined);
    setName('');
    setCode('');
    setActiveState(true);
    setFormError(undefined);
    setDialogOpen(true);
  };

  const startEdit = (item: LocalRecord) => {
    setEditingItem(item);
    setName(text(item, 'name'));
    setCode(text(item, 'code'));
    setActiveState(enabled(item));
    setFormError(undefined);
    setDialogOpen(true);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(`O nome do ${singular} é obrigatório.`);
      return;
    }

    try {
      if (editingItem) {
        await store.mutate(type, {
          id: editingItem.id,
          name: trimmedName,
          ...(isCourse ? { code: code.trim() || null } : {}),
          active: activeState ? 1 : 0,
        });
      } else {
        await store.mutate(type, {
          id: identifier(),
          name: trimmedName,
          ...(isCourse ? { code: code.trim() || null } : {}),
          active: activeState ? 1 : 0,
        });
      }

      await entity.reload();
      setDialogOpen(false);
      void sync();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  };

  const remove = async (item: LocalRecord) => {
    if (!window.confirm(`Deseja realmente excluir "${text(item, 'name')}"?`)) return;
    try {
      await store.mutate(type, { id: item.id }, 'delete');
      await entity.reload();
      void sync();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir.');
    }
  };

  return (
    <div className="flex flex-col gap-5 text-left">
      <Section
        title={title}
        subtitle={`Cadastro e gestão de ${isCourse ? 'cursos e matriz curricular' : 'laboratórios e salas especializadas'}.`}
        action={
          canCreateOrDelete && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo {singular}</span>
            </button>
          )
        }
      />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="sm:col-span-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-catalog" className="text-xs font-medium text-slate-700">
                Buscar {singular}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="search-catalog"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Nome ou código do ${singular}...`}
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div>
            <SelectField
              label="Situação"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'active', label: 'Ativos' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
                {isCourse && <th className="py-3 px-4">Código</th>}
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                  {isCourse && (
                    <td className="py-3 px-4 font-semibold text-slate-500">{text(item, 'code') || '—'}</td>
                  )}
                  <td className="py-3 px-4">
                    {isCourse ? (
                      <Link
                        to={`/cursos/${item.id}`}
                        className="font-bold text-slate-900 hover:text-blue-600 hover:underline transition-colors"
                      >
                        {text(item, 'name')}
                      </Link>
                    ) : (
                      <span className="font-bold text-slate-900">{text(item, 'name')}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                        enabled(item)
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {enabled(item) ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar ${text(item, 'name')}`}
                          onClick={() => startEdit(item)}
                          title="Editar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canCreateOrDelete && (
                        <button
                          type="button"
                          aria-label={`Excluir ${text(item, 'name')}`}
                          onClick={() => void remove(item)}
                          title="Excluir"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={isCourse ? 4 : 3} className="py-8 text-center text-slate-400 font-medium">
                    Nenhum {singular} encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      <PageDialog
        open={dialogOpen}
        title={editingItem ? `Editar ${singular}` : `Novo ${singular}`}
        onClose={() => setDialogOpen(false)}
        onSave={save}
      >
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <label htmlFor="catalog-name" className="text-xs font-semibold text-slate-700">
            Nome do {singular} <span className="text-rose-500">*</span>
          </label>
          <input
            id="catalog-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Ex: ${isCourse ? 'Informática Básica' : 'Laboratório 1'}`}
            className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
          />
        </div>

        {isCourse && (
          <div className="flex flex-col gap-1.5 text-left">
            <label htmlFor="catalog-code" className="text-xs font-semibold text-slate-700">
              Código
            </label>
            <input
              id="catalog-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: INF-01"
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={activeState}
            onChange={(e) => setActiveState(e.target.checked)}
            className="w-4 h-4 rounded text-slate-900 focus:ring-slate-950 border-slate-300"
          />
          <span className="text-xs font-semibold text-slate-700">Ativo</span>
        </label>
      </PageDialog>
    </div>
  );
}

export function CoursesPage() {
  return <CatalogPage type="courses" />;
}

export function LaboratoriesPage() {
  return <CatalogPage type="laboratories" />;
}
