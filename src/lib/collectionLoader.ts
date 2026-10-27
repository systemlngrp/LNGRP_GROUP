export type CollectionProgress<T> = {
  rows: T[];
  loaded: number;
  total: number | null;
  done: boolean;
};

export class CollectionHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Priority = "page" | "sidebar";
type QueueEntry = {
  run: () => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal;
  priority: Priority;
};

const MAX_CONCURRENT_REQUESTS = 4;
const BATCH_SIZE = 250;
const queue: QueueEntry[] = [];
let activeRequests = 0;
let sidebarReleased = false;
const NPD_CACHE_TTL_MS = 30_000;
const completedNpdLoads = new Map<string, { expiresAt: number; rows: any[]; total: number | null }>();

// The shell may register dozens of badge requests before the route mounts.
// Give the visible route first access to the connection pool.
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    sidebarReleased = true;
    pumpQueue();
  }, 5000);
}

export function releaseSidebarRequests() {
  sidebarReleased = true;
  pumpQueue();
}

function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length) {
    const index = queue.findIndex((entry) => entry.priority === "page");
    if (index < 0 && !sidebarReleased) return;
    const [entry] = queue.splice(index < 0 ? 0 : index, 1);
    if (entry.signal.aborted) {
      entry.reject(new DOMException("Request cancelled", "AbortError"));
      continue;
    }
    activeRequests += 1;
    entry.run();
  }
}

function queuedFetch(url: string, headers: Record<string, string>, priority: Priority, signal: AbortSignal) {
  return new Promise<Response>((resolve, reject) => {
    queue.push({
      priority,
      signal,
      reject,
      run: () => {
        fetch(url, { headers, signal }).then(resolve, reject).finally(() => {
          activeRequests -= 1;
          pumpQueue();
        });
      },
    });
    pumpQueue();
  });
}

type SharedLoad<T> = {
  controller: AbortController;
  listeners: Set<(progress: CollectionProgress<T>) => void>;
  progress: CollectionProgress<T>;
  promise: Promise<T[]>;
};

const sharedLoads = new Map<string, SharedLoad<any>>();

function pageUrl(endpoint: string, cursor: string | null, page: number) {
  const url = new URL(endpoint, window.location.origin);
  if (/^\/api\/(npd|npd-firm-wise|npd\/catalog)$/.test(url.pathname)) {
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(BATCH_SIZE));
  } else {
    url.searchParams.set("limit", String(BATCH_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);
    else url.searchParams.delete("cursor");
  }
  return url.toString();
}

export function loadCollection<T extends { id: string }>(
  endpoint: string,
  headers: Record<string, string>,
  priority: Priority,
  onProgress: (progress: CollectionProgress<T>) => void,
  force = false,
) {
  const key = JSON.stringify([endpoint, headers.Authorization || "", headers["X-Firm-Id"] || ""]);
  const isNpd = /^\/api\/(npd|npd-firm-wise|npd\/catalog)$/.test(new URL(endpoint, window.location.origin).pathname);
  if (isNpd && !force) {
    const cached = completedNpdLoads.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      const progress = { rows: cached.rows as T[], loaded: cached.rows.length, total: cached.total, done: true };
      console.info(`[collectionLoader] NPD cache hit endpoint=${endpoint} rows=${cached.rows.length}`);
      onProgress(progress);
      return { promise: Promise.resolve(cached.rows as T[]), unsubscribe: () => {} };
    }
    if (cached) completedNpdLoads.delete(key);
  }
  let task = sharedLoads.get(key) as SharedLoad<T> | undefined;
  if (task?.controller.signal.aborted) {
    sharedLoads.delete(key);
    task = undefined;
  }
  if (!task) {
    const controller = new AbortController();
    task = {
      controller,
      listeners: new Set(),
      progress: { rows: [], loaded: 0, total: null, done: false },
      promise: Promise.resolve([]),
    };
    const currentTask = task;
    task.promise = (async () => {
      const rowsById = new Map<string, T>();
      let cursor: string | null = null;
      let page = 1;
      let total: number | null = null;
      while (true) {
        const response = await queuedFetch(pageUrl(endpoint, cursor, page), headers, priority, controller.signal);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new CollectionHttpError(response.status, String(body?.error || `Failed to load data (${response.status})`));
        }
        const payload = await response.json();
        const batch: T[] = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : [];
        if (Number.isFinite(Number(payload?.total))) total = Number(payload.total);
        batch.forEach((row) => rowsById.set(String(row.id), row));
        const rows = Array.from(rowsById.values());
        const nextCursor = typeof payload?.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null;
        const done = Array.isArray(payload) || (isNpd
          ? batch.length === 0 || batch.length < BATCH_SIZE || (total !== null && page * BATCH_SIZE >= total)
          : !nextCursor);
        currentTask.progress = { rows, loaded: rows.length, total, done };
        currentTask.listeners.forEach((listener) => listener(currentTask.progress));
        if (done) return rows;
        cursor = nextCursor;
        page += 1;
      }
    })();
    sharedLoads.set(key, task);
    task.promise.then(
      (rows) => {
        if (isNpd) completedNpdLoads.set(key, { expiresAt: Date.now() + NPD_CACHE_TTL_MS, rows, total: currentTask.progress.total });
        if (sharedLoads.get(key) === currentTask) sharedLoads.delete(key);
      },
      () => { if (sharedLoads.get(key) === currentTask) sharedLoads.delete(key); },
    );
  }
  task.listeners.add(onProgress);
  if (task.progress.loaded || task.progress.done) onProgress(task.progress);
  const activeTask = task;
  return {
    promise: task.promise,
    unsubscribe: () => {
      activeTask.listeners.delete(onProgress);
      if (activeTask.listeners.size === 0 && !activeTask.progress.done) activeTask.controller.abort();
    },
  };
}
