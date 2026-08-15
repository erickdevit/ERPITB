import type { LocalRecord, Role } from '../types';

const text = (record: LocalRecord, key: string) => String(record[key] ?? '');

export function filterCatalog(items: LocalRecord[], query: string): LocalRecord[] {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  if (!needle) return items;
  return items.filter((item) => `${text(item, 'code')} ${text(item, 'name')}`.toLocaleLowerCase('pt-BR').includes(needle));
}

export function filterUsers(items: LocalRecord[], query: string, role: Role | '', active: '' | 'true' | 'false'): LocalRecord[] {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  return items.filter((item) => {
    const matchesQuery = !needle || `${text(item, 'name')} ${text(item, 'email')}`.toLocaleLowerCase('pt-BR').includes(needle);
    const matchesRole = !role || item.role === role;
    const enabled = item.active !== 0 && item.active !== false;
    const matchesActive = !active || enabled === (active === 'true');
    return matchesQuery && matchesRole && matchesActive;
  });
}

export function catalogDeleteBlock(entity: 'courses' | 'laboratories', itemId: string, classes: LocalRecord[]): string | undefined {
  const linked = classes.some((item) => !item.deleted_at && (entity === 'courses' ? item.course_id === itemId : item.laboratory_id === itemId));
  if (!linked) return undefined;
  return entity === 'courses'
    ? 'Este curso ainda possui turmas vinculadas. Transfira ou exclua essas turmas primeiro.'
    : 'Este laboratório ainda possui turmas vinculadas. Altere ou exclua essas turmas primeiro.';
}
