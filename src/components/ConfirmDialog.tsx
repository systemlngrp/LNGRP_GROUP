import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, X } from "lucide-react";

type ConfirmRequest = {
  message: string;
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (message: string) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<ConfirmRequest | null>(null);
  const [queuedRequests, setQueuedRequests] = useState<ConfirmRequest[]>([]);

  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => {
    const request = { message, resolve };
    setActiveRequest((active) => {
      if (active) {
        setQueuedRequests((queue) => [...queue, request]);
        return active;
      }
      return request;
    });
  }), []);

  const finish = (confirmed: boolean) => {
    if (!activeRequest) return;
    activeRequest.resolve(confirmed);
    setActiveRequest((current) => current ? null : current);
  };

  useEffect(() => {
    if (activeRequest || queuedRequests.length === 0) return;
    setQueuedRequests((queue) => {
      const [next, ...remaining] = queue;
      setActiveRequest(next || null);
      return remaining;
    });
  }, [activeRequest, queuedRequests]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {activeRequest ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-live="assertive" className="relative w-full max-w-lg rounded-lg border-2 border-indigo-700 bg-white p-6 text-black shadow-2xl">
            <button type="button" onClick={() => finish(false)} aria-label="Close confirmation" className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-black">
              <X size={18} />
            </button>
            <div className="flex items-start gap-3 pr-7">
              <AlertCircle className="mt-0.5 shrink-0 text-indigo-700" size={22} />
              <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{activeRequest.message}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => finish(false)} className="rounded border border-slate-400 bg-white px-5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">No</button>
              <button type="button" onClick={() => finish(true)} className="rounded border border-indigo-700 bg-indigo-700 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-800">Yes</button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside ConfirmProvider");
  return context.confirm;
}
