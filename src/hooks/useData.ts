import { useState, useEffect, useCallback, useRef } from "react";
import { useAutoRefreshEffect } from "./useAutoRefresh";
import { REALTIME_DATA_CHANGE_EVENT } from "./useRealtimeDataSync";

type UseDataOptions = {
  cacheToLocalStorage?: boolean;
  endpointOverride?: string;
  storageKey?: string;
  syncEventKey?: string;
  firmScope?: 'active' | 'all';
};

function safeGetLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[useData] Failed to read localStorage key "${key}":`, error);
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const isQuotaError = 
      error instanceof DOMException && (
        error.name === 'QuotaExceededError' || 
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
        (error as any).code === 22 || 
        (error as any).code === 1014
      );

    if (isQuotaError) {
      console.warn(`[useData] LocalStorage quota exceeded while writing "${key}". Clearing caches to make room...`);
      try {
        const token = window.localStorage.getItem("authToken");
        window.localStorage.clear();
        if (token) window.localStorage.setItem("authToken", token);
        // Try again after clearing
        window.localStorage.setItem(key, value);
        console.info(`[useData] Cache cleared and "${key}" successfully saved.`);
        return true;
      } catch (retryError) {
        console.warn(`[useData] Even after clearing, data for "${key}" exceeds the 5MB quota. Skipping cache.`, retryError);
      }
    } else {
      console.warn(`[useData] Failed to write localStorage key "${key}":`, error);
    }
    return false;
  }
}

function getAuthHeaders(_includeActiveFirm = true) {
  const token = window.localStorage.getItem("authToken") || "";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (_includeActiveFirm) {
    const activeFirm = window.localStorage.getItem("activeFirm");
    try {
      const firmId = activeFirm ? JSON.parse(activeFirm)?.id : "";
      if (firmId) headers["X-Firm-Id"] = String(firmId);
    } catch {
      // Ignore malformed local storage and let the server apply its default scope.
    }
  }
  return headers;
}

export function useData<T extends { id: string }>(entity: string, initialValue: T[], options?: UseDataOptions) {
  const [data, setDataState] = useState<T[]>(initialValue);
  const dataRef = useRef<T[]>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const pendingForcedFetchRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const forbiddenUntilRef = useRef(0);

  const isItemAlias = entity === "items" && !options?.endpointOverride;
  const resolvedEntity = isItemAlias ? "npd" : entity;
  const endpoint = options?.endpointOverride || `/api/${resolvedEntity.replace(/_/g, "-")}`;
  const storageKey = `udc_${options?.storageKey || resolvedEntity}`;
  const syncEvent = options?.syncEventKey || `sync-data-${resolvedEntity}`;
  const shouldCacheToLocalStorage = options?.cacheToLocalStorage !== false;
  const includeActiveFirm = options?.firmScope !== "all";

  // Keep ref in sync
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const fetchData = useCallback(async (config?: { background?: boolean; force?: boolean }) => {
    const background = Boolean(config?.background);
    const force = Boolean(config?.force);
    const now = Date.now();

    if (isFetchingRef.current) {
      // Realtime and local sync signals can arrive while the initial request is
      // still running. Remember one forced follow-up so its result cannot leave
      // this hook (and sidebar counts derived from it) stale.
      if (force) pendingForcedFetchRef.current = true;
      return;
    }
    if (now < forbiddenUntilRef.current) return;
    if (!force && now - lastFetchAtRef.current < 10_000) return;

    isFetchingRef.current = true;
    try {
      if (!background) setLoading(true);
      const response = await fetch(endpoint, { headers: getAuthHeaders(options?.firmScope !== 'all') });
      if (response.status === 401 || response.status === 403) {
        // Sidebar counts request data from modules that a selective user may not access.
        // Treat that expected denial as an empty dataset rather than a recurring app error.
        forbiddenUntilRef.current = Date.now() + 5 * 60_000;
        lastFetchAtRef.current = Date.now();
        setDataState([]);
        dataRef.current = [];
        setError(response.status === 401 ? "Unauthorized" : null);
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 500 && String(errorData.error || "").toLowerCase().includes("authorization failed")) {
          forbiddenUntilRef.current = Date.now() + 5 * 60_000;
          lastFetchAtRef.current = Date.now();
        }
        throw new Error(errorData.error || "Failed to fetch data");
      }
      const result = await response.json();
      const finalData = Array.isArray(result) ? result : (result && Array.isArray(result.rows) ? result.rows : []);
      setDataState(finalData);
      dataRef.current = finalData;
      forbiddenUntilRef.current = 0;
      setError(null);
      lastFetchAtRef.current = Date.now();
      if (shouldCacheToLocalStorage) {
        safeSetLocalStorage(storageKey, JSON.stringify(finalData));
      }
    } catch (err) {
      console.error(`Error fetching ${entity}:`, err);
      setError((err as Error).message);
      if (shouldCacheToLocalStorage) {
        const saved = safeGetLocalStorage(storageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setDataState(parsed);
            dataRef.current = parsed;
          } catch (parseError) {
            console.warn(
              `[useData] Invalid cached JSON for "${storageKey}". Clearing corrupted cache entry.`,
              parseError,
            );
            try {
              window.localStorage.removeItem(storageKey);
            } catch (removeError) {
              console.warn(`[useData] Failed to clear corrupted localStorage key "${storageKey}":`, removeError);
            }
          }
        }
      }
    } finally {
      if (!background) setLoading(false);
      isFetchingRef.current = false;
      if (pendingForcedFetchRef.current) {
        pendingForcedFetchRef.current = false;
        void fetchData({ background: true, force: true });
      }
    }
  }, [endpoint, entity, includeActiveFirm, shouldCacheToLocalStorage, storageKey]);

  useEffect(() => {
    fetchData({ force: true });

    // Listen for sync events from other hook instances
    const handleSync = () => {
      fetchData({ background: true, force: true });
    };
    
    const handleFirmChange = () => {
      forbiddenUntilRef.current = 0;
      fetchData({ background: true, force: true });
    };
    const handleRealtimeDataChange = (event: Event) => {
      const entities = (event as CustomEvent<{ entities?: string[] }>).detail?.entities || ["*"];
      const entityNames = new Set([entity, resolvedEntity, entity.replace(/_/g, "-"), resolvedEntity.replace(/_/g, "-")]);
      if (entities.includes("*") || entities.some((name) => entityNames.has(String(name)))) {
        fetchData({ background: true, force: true });
      }
    };

    window.addEventListener(syncEvent, handleSync);
    window.addEventListener("active-firm-changed", handleFirmChange);
    window.addEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtimeDataChange);
    return () => {
      window.removeEventListener(syncEvent, handleSync);
      window.removeEventListener("active-firm-changed", handleFirmChange);
      window.removeEventListener(REALTIME_DATA_CHANGE_EVENT, handleRealtimeDataChange);
    };
  }, [fetchData, syncEvent]);

  useAutoRefreshEffect(() => {
    void fetchData({ background: true });
  });

  const updateData = useCallback(async (newData: T[] | ((prev: T[]) => T[])) => {
    const currentData = dataRef.current;
    const resolvedData = typeof newData === "function" ? newData(currentData) : newData;
    
    // Find what changed compared to the absolute LATEST data
    const added = resolvedData.filter(n => !currentData.find(o => o.id === n.id));
    const modified = resolvedData.filter(n => {
      const old = currentData.find(o => o.id === n.id);
      return old && JSON.stringify(old) !== JSON.stringify(n);
    });
    const deleted = currentData.filter(o => !resolvedData.find(n => n.id === o.id));

    console.log(`[useData:${entity}] Syncing: ${added.length} added, ${modified.length} modified, ${deleted.length} deleted`);

    // Optimistic update
    setDataState(resolvedData);
    dataRef.current = resolvedData;
    if (shouldCacheToLocalStorage) {
      safeSetLocalStorage(storageKey, JSON.stringify(resolvedData));
    }

    // Emit sync event immediately for other local components
    window.dispatchEvent(new CustomEvent(syncEvent));

    // Send to server
    let hasError = false;
    let lastErrorMessage = "";
    const authHeaders = getAuthHeaders(includeActiveFirm);

    try {
      for (const item of [...added, ...modified]) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(item),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.error || response.statusText;
          hasError = true;
          lastErrorMessage = msg;
          console.error(`[useData:${entity}] Save failed for ${item.id}:`, msg);
        }
      }
      for (const item of deleted) {
        const response = await fetch(`${endpoint}/${item.id}`, { method: "DELETE", headers: { ...authHeaders } });
        if (!response.ok) {
          hasError = true;
          const errData = await response.json().catch(() => ({}));
          lastErrorMessage = errData.error || response.statusText;
        }
      }

      if (hasError) {
        throw new Error(lastErrorMessage || "Failed to sync some items with server");
      }
      
      // Re-fetch to ensure perfect sync with DB state
      await fetchData();
      // Emit sync event again after server confirmation
      window.dispatchEvent(new CustomEvent(syncEvent));
    } catch (err) {
      console.error(`[useData:${entity}] Sync error:`, err);
      fetchData(); // Re-sync with server on error
      window.dispatchEvent(new CustomEvent(syncEvent));
      throw err;
    }
  }, [endpoint, entity, fetchData, includeActiveFirm, shouldCacheToLocalStorage, storageKey, syncEvent]);

  // Providing a more robust interface
  const addItem = async (item: T) => {
    const nextData = [...dataRef.current, item];
    try {
      setDataState(nextData);
      dataRef.current = nextData;
      if (shouldCacheToLocalStorage) safeSetLocalStorage(storageKey, JSON.stringify(nextData));
      const authHeaders = getAuthHeaders(includeActiveFirm);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(item),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to add item");
      }
      window.dispatchEvent(new CustomEvent(syncEvent));
    } catch (err) {
      console.error("Error adding item:", err);
      fetchData();
      throw err;
    }
  };

  const removeItem = async (id: string) => {
    const nextData = dataRef.current.filter((item) => item.id !== id);
    try {
      setDataState(nextData);
      dataRef.current = nextData;
      if (shouldCacheToLocalStorage) safeSetLocalStorage(storageKey, JSON.stringify(nextData));
      const authHeaders = getAuthHeaders(includeActiveFirm);
      const response = await fetch(`${endpoint}/${id}`, { method: "DELETE", headers: { ...authHeaders } });
      if (!response.ok) {
        throw new Error("Failed to delete item");
      }
      window.dispatchEvent(new CustomEvent(syncEvent));
    } catch (err) {
      console.error("Error deleting item:", err);
      fetchData();
      throw err;
    }
  };

  const saveItem = async (item: T) => {
    const nextData = dataRef.current.map((current) => current.id === item.id ? item : current);
    try {
      setDataState(nextData);
      dataRef.current = nextData;
      if (shouldCacheToLocalStorage) safeSetLocalStorage(storageKey, JSON.stringify(nextData));
      const authHeaders = getAuthHeaders(includeActiveFirm);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(item),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save item");
      }
      window.dispatchEvent(new CustomEvent(syncEvent));
    } catch (err) {
      console.error("Error saving item:", err);
      fetchData();
      throw err;
    }
  };

  return [data, updateData, loading, { refresh: fetchData, addItem, removeItem, saveItem }] as const;
}
