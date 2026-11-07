export function Spinner({ size = 24, className = "" }: { size?: number, className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Loading card shown in the middle of the screen. It does not block clicks on
 * the page underneath (pointer-events-none), it only shows that data is loading.
 */
export function CenteredLoader({ message = "Loading…", detail }: { message?: string; detail?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-4" role="status" aria-live="polite">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border-2 border-slate-900 bg-white/95 px-6 py-5 text-center shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <Spinner size={40} />
        <div className="text-sm font-black uppercase tracking-wide text-slate-900">{message}</div>
        {detail ? <div className="text-xs font-bold text-slate-600">{detail}</div> : null}
      </div>
    </div>
  );
}
