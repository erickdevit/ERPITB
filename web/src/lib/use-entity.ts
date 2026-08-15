import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app-context';
import type { Entity, LocalRecord } from '../types';
import { latestAttendance } from './attendance';

export function useEntity(entity: Entity, includeDeleted = false) {
  const { store, refresh } = useApp();
  const [items, setItems] = useState<LocalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const values = await store.list(entity, includeDeleted);
    setItems(entity === 'attendance_records' ? latestAttendance(values) : values);
    setLoading(false);
  }, [entity, includeDeleted, store]);

  useEffect(() => { void reload(); }, [refresh, reload]);
  return { items, loading, reload };
}
