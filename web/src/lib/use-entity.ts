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

// In-memory transient cache partitioned by user/account session to prevent cross-client or cross-session bleed
const inMemoryCache = new Map<string, { items: LocalRecord[]; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<LocalRecord[]>>();
const entityListeners = new Map<string, Set<() => void>>();
const CACHE_TTL_MS = 60_000; // 60 seconds TTL

export function clearEntityMemoryCache(entity?: Entity | string | string[]) {
  const targets = Array.isArray(entity)
    ? entity.filter(Boolean)
    : typeof entity === 'string' && entity.trim()
    ? [entity.trim()]
    : [];

  if (targets.length > 0) {
    for (const key of inMemoryCache.keys()) {
      const suffix = key.includes('::') ? key.split('::')[1]! : key;
      if (targets.some((ent) => suffix.startsWith(`${ent}_`))) {
        inMemoryCache.delete(key);
      }
    }
  } else {
    inMemoryCache.clear();
  }
}

export function notifyEntityChanged(entity?: Entity | string | string[]) {
  clearEntityMemoryCache(entity);
  const targets = Array.isArray(entity)
    ? entity.filter(Boolean)
    : typeof entity === 'string' && entity.trim()
    ? [entity.trim()]
    : [];

  if (targets.length > 0) {
    for (const ent of targets) {
      const listeners = entityListeners.get(ent);
      if (listeners) {
        for (const listener of listeners) {
          listener();
        }
      }
    }
  } else {
    for (const listeners of entityListeners.values()) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
}

export function useEntity(entity: Entity, includeDeleted = false) {
  const { session, store, api, refresh } = useApp();
  const accountScope = session?.id || (store as any)?.accountId || 'anon';
  const cacheKey = `${accountScope}::${entity}_${includeDeleted}`;
  const [items, setItems] = useState<LocalRecord[]>(() => {
    const cached = inMemoryCache.get(cacheKey);
    return cached?.items ?? [];
  });
  const [loading, setLoading] = useState(!inMemoryCache.has(cacheKey));
  const fetching = useRef(false);

  const reload = useCallback(async (force = true) => {
    const cached = inMemoryCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      return;
    }

    if (fetching.current) return;
    fetching.current = true;
    try {
      let values: LocalRecord[] = [];
      const endpoint = entityEndpointMap[entity];

      if (inFlightRequests.has(cacheKey)) {
        values = await inFlightRequests.get(cacheKey)!;
      } else {
        const fetchPromise = (async () => {
          let fetched: LocalRecord[] = [];
          if (api && endpoint) {
            try {
              const res = await api.get<{ items: LocalRecord[] }>(endpoint);
              if (Array.isArray(res?.items)) {
                fetched = res.items;
              }
            } catch {
              // Fallback to existing memory cache if API not reachable or quota exceeded (503)
              if (cached?.items && cached.items.length > 0) {
                return cached.items;
              }
              // Fallback to store if API not reachable or in mock test environment
              if (store && typeof store.list === 'function') {
                fetched = await store.list(entity, includeDeleted);
              }
            }
          } else if (store && typeof store.list === 'function') {
            fetched = await store.list(entity, includeDeleted);
          }
          return entity === 'attendance_records' ? latestAttendance(fetched) : fetched;
        })();

        inFlightRequests.set(cacheKey, fetchPromise);
        try {
          values = await fetchPromise;
        } finally {
          inFlightRequests.delete(cacheKey);
        }
      }

      inMemoryCache.set(cacheKey, { items: values, timestamp: Date.now() });
      setItems(values);
      setLoading(false);
    } finally {
      fetching.current = false;
    }
  }, [api, cacheKey, entity, includeDeleted, store]);

  useEffect(() => {
    void reload(false);
  }, [refresh, reload]);

  useEffect(() => {
    let set = entityListeners.get(entity);
    if (!set) {
      set = new Set();
      entityListeners.set(entity, set);
    }
    const handleTargetedReload = () => {
      void reload(true);
    };
    set.add(handleTargetedReload);
    return () => {
      set?.delete(handleTargetedReload);
    };
  }, [entity, reload]);

  return { items, loading, reload };
}
