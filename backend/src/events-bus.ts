import { nowIso, uuid } from './http';
import type { Env } from './types';

export type SseEventType = 'session_revoked' | 'entity_changed' | 'branding_updated' | 'ping';

export interface SystemEvent<T = unknown> {
  id: string;
  type: SseEventType;
  data: T;
  targetUserId?: string;
  timestamp: string;
}

export type EventSubscriber = (event: SystemEvent) => void;

export class EventBus {
  private subscribers = new Set<EventSubscriber>();

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  broadcast(event: SystemEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (err) {
        console.error('Failed to dispatch event to subscriber:', err);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  clear(): void {
    this.subscribers.clear();
  }
}

export const eventBus = new EventBus();

/**
 * Broadcasts an authentic system event to all connected SSE clients in the isolate,
 * and optionally persists the event to D1 for durability and client replay.
 */
export function broadcastEvent<T = unknown>(
  type: SseEventType,
  data: T,
  options?: {
    id?: string;
    targetUserId?: string;
    env?: Env;
  }
): SystemEvent<T> {
  const timestamp = nowIso();
  const event: SystemEvent<T> = {
    id: options?.id || uuid(),
    type,
    data,
    targetUserId: options?.targetUserId,
    timestamp,
  };

  // 1. Instant in-memory broadcast to all active SSE streams in this isolate
  eventBus.broadcast(event);

  // 2. Persistent D1 storage if DB binding is provided
  if (options?.env?.DB) {
    try {
      options.env.DB.prepare(`
        INSERT INTO system_events (id, event_type, target_user_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        event.id,
        event.type,
        event.targetUserId ?? null,
        JSON.stringify(event.data),
        event.timestamp
      ).run().catch((err: unknown) => {
        // Non-fatal background persistence error
        console.warn('Failed to log system event to D1:', err);
      });
    } catch {
      // Ignore if DB not ready
    }
  }

  return event;
}
