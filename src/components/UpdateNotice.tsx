import { useEffect, useState } from "react";

// The main script name changes with every build (assets/index-<hash>.js).
const SCRIPT_PATTERN = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const CHECK_EVERY_MS = 3 * 60_000;

function currentScript() {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  for (const script of scripts) {
    const match = script.src.match(SCRIPT_PATTERN);
    if (match) return match[0];
  }
  return "";
}

/**
 * Shows "A new version is available — Refresh" after a deploy, so people do not
 * keep running an old build. It never reloads by itself (a form may be open).
 */
export function UpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const running = currentScript();
    if (!running) return;
    let stopped = false;
    const check = async () => {
      if (stopped || available) return;
      try {
        const response = await fetch(`/?version-check=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const html = await response.text();
        const latest = html.match(SCRIPT_PATTERN)?.[0] || "";
        if (latest && latest !== running) setAvailable(true);
      } catch {
        // Offline or server restarting: try again later.
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [available]);

  if (!available) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-slate-900 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" role="alert">
      <span>A new version of LNGRP GROUP is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded border-2 border-slate-900 bg-indigo-600 px-3 py-1 text-xs font-black uppercase text-white hover:bg-indigo-700"
      >
        Refresh
      </button>
    </div>
  );
}
