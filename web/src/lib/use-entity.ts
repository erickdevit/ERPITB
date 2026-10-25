import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import type { Entity, LocalRecord } from '../types';
import { latestAttendance } from './attendance';

const entityEndpointMap: Record<Entity, string> = {
  laboratories: '/v1/laboratories',
  courses: '/v1/courses',
  classes: '/v1/classes',
  class_teachers: '/v1/class-teachers',
  students: '/v1/students',
  enrollments: '/v1/enrollments',
  attendance_records: '/v1/attendance',
  class_notes: '/v1/class-notes',
  replacements: '/v1/replacements',
  grade_tables: '/v1/grade-tables',
  grade_items: '/v1/grade-items',
  student_grades: '/v1/student-grades',
};

// In-memory transient cache to prevent redundant HTTP roundtrips across components
const inMemoryCache = new Map<string, { items: LocalRecord[]; timestamp: number }>();

export function clearEntityMemoryCache() {
  inMemoryCache.clear();
}

export function useEntity(entity: Entity, includeDeleted = false) {
  const { store, api, refresh } = useApp();
  const [items, setItems] = useState<LocalRecord[]>(() => {
    const cached = inMemoryCache.get(`${entity}_${includeDeleted}`);
    return cached?.items ?? [];
  });
  const [loading, setLoading] = useState(!inMemoryCache.has(`${entity}_${includeDeleted}`));
  const fetching = useRef(false);

  const reload = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      let values: LocalRecord[] = [];
      const endpoint = entityEndpointMap[entity];

      if (api && endpoint) {
        try {
          const res = await api.get<{ items: LocalRecord[] }>(endpoint);
          if (Array.isArray(res?.items)) {
            values = res.items;
          }
        } catch {
          // Fallback to store if API not reachable or in mock test environment
          if (store && typeof store.list === 'function') {
            values = await store.list(entity, includeDeleted);
          }
        }
      } else if (store && typeof store.list === 'function') {
        values = await store.list(entity, includeDeleted);
      }

      const processed = entity === 'attendance_records' ? latestAttendance(values) : values;
      inMemoryCache.set(`${entity}_${includeDeleted}`, { items: processed, timestamp: Date.now() });
      setItems(processed);
      setLoading(false);
    } finally {
      fetching.current = false;
    }
  }, [api, entity, includeDeleted, store]);

  useEffect(() => {
    void reload();
  }, [refresh, reload]);

  return { items, loading, reload };
}
