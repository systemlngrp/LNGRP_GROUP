import { useEffect, useState } from "react";

/**
 * Qty of each job still at a job worker (open Job Work gate passes), keyed by job (production) id.
 * Loading may not use that qty. Refreshed when the tab gets focus.
 */
export function useQtyAtJobWorker(enabled = true) {
  const [byJob, setByJob] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      const token = localStorage.getItem("authToken") || "";
      fetch("/api/job-work-at-worker", { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!alive || !payload?.byJob) return;
          setByJob(new Map(Object.entries(payload.byJob).map(([jobId, qty]) => [jobId, Number(qty || 0)])));
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("focus", load);
    return () => { alive = false; window.removeEventListener("focus", load); };
  }, [enabled]);
  return byJob;
}
