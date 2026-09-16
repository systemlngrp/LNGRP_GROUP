import { useEffect, useRef } from "react";

export const REALTIME_DATA_CHANGE_EVENT = "app-realtime-data-changed";
const CHANNEL_NAME = "lngrp-realtime-data-sync";

type RealtimeMessage = {
  type?: string;
  entities?: string[];
};

export function useRealtimeDataSync(enabled = true) {
  const pendingEntitiesRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const emit = (message: RealtimeMessage, broadcast = false) => {
      const entities = Array.isArray(message.entities) && message.entities.length ? message.entities : ["*"];
      entities.forEach((entity) => pendingEntitiesRef.current.add(String(entity)));

      if (flushTimerRef.current !== null) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        const changedEntities = Array.from(pendingEntitiesRef.current);
        pendingEntitiesRef.current.clear();
        window.dispatchEvent(new CustomEvent(REALTIME_DATA_CHANGE_EVENT, { detail: { entities: changedEntities } }));
        if (broadcast) channel?.postMessage({ type: "data-changed", entities: changedEntities });
      }, 200);
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    channel?.addEventListener("message", (event: MessageEvent<RealtimeMessage>) => {
      if (event.data?.type === "data-changed") emit(event.data);
    });

    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource("/api/realtime/updates");
      source.addEventListener("data-changed", (event: MessageEvent<string>) => {
        reconnectAttempts = 0;
        try {
          emit(JSON.parse(event.data), true);
        } catch {
          emit({ entities: ["*"] }, true);
        }
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed || reconnectTimer !== null) return;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempts++, 5));
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      channel?.close();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    };
  }, [enabled]);
}
