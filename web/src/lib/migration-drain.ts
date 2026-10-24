import Dexie from 'dexie';
import type { ApiClient } from './api';

const DRAINED_FLAG_KEY = 'erpitb_legacy_drained';

export async function drainLegacyClientStorage(api: ApiClient): Promise<{ drained: boolean; count: number }> {
  try {
    if (localStorage.getItem(DRAINED_FLAG_KEY) === 'true') {
      return { drained: false, count: 0 };
    }

    const dbsToInspect = ['erpitb-pwa', 'frequencia-itb-pwa'];
    let totalDrained = 0;

    for (const dbName of dbsToInspect) {
      if (!(await Dexie.exists(dbName))) continue;

      const db = new Dexie(dbName);
      await db.open();

      const tableNames = db.tables.map((t) => t.name);
      if (tableNames.includes('queue')) {
        const queueTable = db.table('queue');
        const queuedItems = await queueTable.toArray();

        if (queuedItems.length > 0) {
          // Push to server migration drain endpoint
          const res = await api.post<{ ok: boolean; processedCount: number }>('/v1/migration/drain', {
            operations: queuedItems,
          });

          if (res?.ok) {
            totalDrained += queuedItems.length;
            // Clean queue only after server confirms persistence
            await queueTable.clear();
          }
        }
      }

      db.close();
    }

    localStorage.setItem(DRAINED_FLAG_KEY, 'true');
    return { drained: true, count: totalDrained };
  } catch {
    // Non-fatal: if drain fails due to offline state, it will retry on next startup
    return { drained: false, count: 0 };
  }
}
