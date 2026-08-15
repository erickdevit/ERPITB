import { describe, expect, it } from 'vitest';
import { catalogDeleteBlock, filterCatalog, filterUsers } from './directory-model';

const row = (id: string, values: Record<string, unknown> = {}) => ({ id, ...values });

describe('directory filters', () => {
  it('filters catalogs by code or name without case sensitivity', () => {
    const items = [row('1', { code: 'ADM', name: 'Administração' }), row('2', { code: 'TEC', name: 'Tecnologia' })];
    expect(filterCatalog(items, 'admin')).toEqual([items[0]]);
    expect(filterCatalog(items, 'tec')).toEqual([items[1]]);
  });

  it('combines user query, role and active filters', () => {
    const users = [
      row('1', { name: 'Ana', email: 'ana@itb.test', role: 'admin', active: 1 }),
      row('2', { name: 'Paulo', email: 'paulo@itb.test', role: 'professor', active: 0 }),
    ];
    expect(filterUsers(users, 'paulo', 'professor', 'false')).toEqual([users[1]]);
    expect(filterUsers(users, '', 'admin', 'true')).toEqual([users[0]]);
  });

  it('blocks catalog deletion while a class is linked', () => {
    const classes = [row('class-1', { course_id: 'course-1', laboratory_id: 'lab-1' })];
    expect(catalogDeleteBlock('courses', 'course-1', classes)).toContain('turmas');
    expect(catalogDeleteBlock('laboratories', 'lab-2', classes)).toBeUndefined();
  });
});
