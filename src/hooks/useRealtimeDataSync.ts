import { useEffect, useRef } from "react";

export const REALTIME_DATA_CHANGE_EVENT = "app-realtime-data-changed";
const CHANNEL_NAME = "lngrp-realtime-data-sync";

type RealtimeMessage = {
  type?: string;
  entities?: string[];
  /** Server change version the message is for (tabs skip a change they already have). */
  version?: number;
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
        if (broadcast) channel?.postMessage({ type: "data-changed", entities: changedEntities, version: lastVersion ?? undefined });
      }, 200);
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    let pollTimer: number | null = null;
    let lastVersion: number | null = null;
    channel?.addEventListener("message", (event: MessageEvent<RealtimeMessage>) => {
      if (event.data?.type !== "data-changed") return;
      // Another tab already read this change from the server: use it once and
      // move this tab's version on, so its own next poll does not reload it again.
      const version = Number(event.data.version);
      if (Number.isFinite(version) && lastVersion !== null) {
        if (version <= lastVersion) return;
        lastVersion = version;
      }
      emit(event.data);
    });
    let disposed = false;

    const poll = async () => {
      try {
        const url = lastVersion === null ? "/api/realtime/updates" : `/api/realtime/updates?since=${lastVersion}`;
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (disposed) return;
        if (!response.ok) return;
        const payload = await response.json() as { version?: number; entities?: string[] };
        const version = Number(payload.version);
        if (!Number.isFinite(version)) return;
        if (lastVersion !== null && version !== lastVersion) {
          // The server reports which tables changed since our last poll, so
          // screens reload only the affected collections. Older servers (or a
          // restart) answer without a list, which means "reload everything".
          const entities = Array.isArray(payload.entities) && payload.entities.length ? payload.entities : ["*"];
          emit({ entities }, true);
        }
        lastVersion = version;
      } catch {
        // A transient network failure is retried on the next polling cycle.
      }
    };

    void poll();
    pollTimer = window.setInterval(() => void poll(), 10_000);
    return () => {
      disposed = true;
      channel?.close();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    };
  }, [enabled]);
}
