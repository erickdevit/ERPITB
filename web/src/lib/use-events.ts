import { useEffect, useRef } from 'react';
import type { BrandingSettings } from '../types';
import { clearEntityMemoryCache } from './use-entity';

export interface SseEventMessage {
  id?: string;
  event: string;
  data: Record<string, unknown>;
}

/**
 * Parses a raw SSE text chunk into discrete SseEventMessage objects.
 */
export function parseSseChunk(raw: string): SseEventMessage[] {
  const messages: SseEventMessage[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;
    let id: string | undefined;
    let event = 'message';
    let dataStr = '';
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataStr += line.slice(5).trim();
      }
    }
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        messages.push({ id, event, data });
      } catch {
        // Ignore malformed JSON payloads
      }
    }
  }
  return messages;
}

export interface UseServerEventsOptions {
  enabled?: boolean;
  token?: string;
  onEntityChanged?: (entity?: string) => void;
  onBrandingUpdated?: (branding: Partial<BrandingSettings>) => void;
  onSessionRevoked?: (reason?: string) => void;
}

/**
 * React hook for subscribing to `/api/v1/events` SSE notifications when EventSource is available.
 * Safe in JSDOM/Vitest environments where EventSource is not defined.
 */
export function useServerEvents({
  enabled = true,
  token,
  onEntityChanged,
  onBrandingUpdated,
  onSessionRevoked,
}: UseServerEventsOptions) {
  const lastEventIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !token || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        const queryParams = new URLSearchParams();
        if (token) queryParams.set('token', token);
        if (lastEventIdRef.current) queryParams.set('since', lastEventIdRef.current);
        const url = `/api/v1/events?${queryParams.toString()}`;

        source = new EventSource(url, { withCredentials: true });

        source.onerror = () => {
          if (source) {
            source.close();
            source = null;
          }
          if (!closed) {
            // Reconnect with a safe delay (15s) instead of tight browser loop
            retryTimer = setTimeout(connect, 15000);
          }
        };

        source.addEventListener('entity_changed', (evt: MessageEvent) => {
          if (evt.lastEventId) lastEventIdRef.current = evt.lastEventId;
          clearEntityMemoryCache();
          try {
            const payload = JSON.parse(evt.data);
            onEntityChanged?.(payload?.entity);
          } catch {
            onEntityChanged?.();
          }
        });

        source.addEventListener('branding_updated', (evt: MessageEvent) => {
          if (evt.lastEventId) lastEventIdRef.current = evt.lastEventId;
          try {
            const payload = JSON.parse(evt.data);
            onBrandingUpdated?.(payload);
          } catch {
            // Ignore malformed payload
          }
        });

        source.addEventListener('session_revoked', (evt: MessageEvent) => {
          if (evt.lastEventId) lastEventIdRef.current = evt.lastEventId;
          clearEntityMemoryCache();
          try {
            const payload = JSON.parse(evt.data);
            onSessionRevoked?.(payload?.reason);
          } catch {
            onSessionRevoked?.();
          }
        });
      } catch {
        // Fail open if EventSource fails to initialize
      }
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (source) {
        source.close();
        source = null;
      }
    };
  }, [enabled, token, onBrandingUpdated, onEntityChanged, onSessionRevoked]);
}
