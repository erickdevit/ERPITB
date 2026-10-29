import { eventBus, type SseEventType, type SystemEvent, broadcastEvent } from './events-bus';
import { teacherOwnsClass } from './sync';
import type { AuthUser, Env } from './types';

export { eventBus, broadcastEvent };
export type { SseEventType, SystemEvent };

const PEDAGOGICAL_ONLY_ENTITIES = new Set([
  'attendance_records',
  'class_notes',
  'replacements',
  'grade_tables',
  'grade_items',
  'student_grades',
]);

const FINANCE_ONLY_ENTITIES = new Set([
  'financial_fees',
  'cash_transactions',
  'financial_contacts',
]);

export function formatSseEvent(event: SseEventType, data: unknown, id?: string): string {
  let message = '';
  if (id) message += `id: ${id}\n`;
  message += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return message;
}

export async function handleEventsStream(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const encoder = new TextEncoder();
  const url = new URL(request.url);

  // Check Last-Event-ID header or ?since= query parameter
  const lastEventId = request.headers.get('last-event-id') || url.searchParams.get('since');

  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Prepare initial SSE comments and ping heartbeat
      let initialPayload =
        `: connected\n\n` +
        `: keep-alive\n\n` +
        formatSseEvent('ping', { time: Date.now() });

      // 2. If Last-Event-ID or since is provided, replay missed events from D1
      if (lastEventId && env.DB) {
        try {
          const isIso = /^\d{4}-\d{2}-\d{2}T/.test(lastEventId);
          const stmt = isIso
            ? env.DB.prepare(`
                SELECT id, event_type, payload_json, target_user_id, created_at
                  FROM system_events
                 WHERE created_at > ?
                   AND (target_user_id IS NULL OR target_user_id = ?)
                 ORDER BY created_at ASC
                 LIMIT 50
              `).bind(lastEventId, user.id)
            : env.DB.prepare(`
                SELECT se.id, se.event_type, se.payload_json, se.target_user_id, se.created_at
                  FROM system_events se
                 WHERE se.created_at > (SELECT created_at FROM system_events WHERE id = ?)
                   AND (se.target_user_id IS NULL OR se.target_user_id = ?)
                 ORDER BY se.created_at ASC
                 LIMIT 50
              `).bind(lastEventId, user.id);

          const { results } = await stmt.all<{
            id: string;
            event_type: SseEventType;
            payload_json: string;
            target_user_id: string | null;
            created_at: string;
          }>();

          if (results) {
            for (const row of results) {
              const parsed = JSON.parse(row.payload_json);
              initialPayload += formatSseEvent(row.event_type, parsed, row.id);
            }
          }
        } catch {
          // Table may not exist yet or query failed; fail open
        }
      }

      controller.enqueue(encoder.encode(initialPayload));

      // 3. Subscribe to real-time events on the authentic in-memory bus
      unsubscribe = eventBus.subscribe(async (event: SystemEvent) => {
        // Enforce user targeting: if event has targetUserId, verify user match
        if (event.targetUserId && event.targetUserId !== user.id) {
          return;
        }

        if (event.type === 'entity_changed') {
          const dataRecord =
            event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>) : undefined;
          const entityName = typeof dataRecord?.entity === 'string' ? dataRecord.entity : undefined;
          const entitiesList = Array.isArray(dataRecord?.entities)
            ? dataRecord.entities.map(String)
            : entityName
            ? [entityName]
            : [];

          // Financeiro role has no access to pedagogical-only entities
          if (
            user.role === 'financeiro' &&
            entitiesList.length > 0 &&
            entitiesList.every((ent) => PEDAGOGICAL_ONLY_ENTITIES.has(ent))
          ) {
            return;
          }

          // Professor & Pedagogico roles have no access to finance-only entities
          if (
            (user.role === 'professor' || user.role === 'pedagogico') &&
            entitiesList.length > 0 &&
            entitiesList.every((ent) => FINANCE_ONLY_ENTITIES.has(ent))
          ) {
            return;
          }

          // Professor isolation: if mutation targets a specific class, only notify professors assigned to that class
          if (user.role === 'professor' && event.targetClassId && env.DB) {
            const owns = await teacherOwnsClass(env, user.id, event.targetClassId).catch(() => false);
            if (!owns) {
              return;
            }
          }
        }

        try {
          const payload = formatSseEvent(event.type, event.data, event.id);
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream closed / client dropped
          unsubscribe?.();
        }
      });
    },
    cancel() {
      // Clean up subscription when client disconnects
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  });
}
