import { useEffect, useState } from "react";
import { Undo2, X } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";

type UndoTarget = {
  id: string;
  invoiceNo: string;
  tallyInvNo?: string;
  date?: string;
  companyName: string;
  total: number;
  slipNos: string[];
};

const refreshLists = () => {
  ["invoices", "invoice_line_items", "loading_slips", "gate_passes", "inter_firm_pending_invoices", "material_in"].forEach((entity) => {
    window.dispatchEvent(new Event(`sync-data-${entity}`));
    window.dispatchEvent(new Event(`sync-data-${entity.replace(/_/g, "-")}`));
  });
};

/** Admin: undo an invoice so its loading slips come back to Pending Invoicing. */
export function UndoInvoiceDialog({ target, onClose, onDone }: { target: UndoTarget; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [tallyDeleted, setTallyDeleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inTally = Boolean(String(target.tallyInvNo || "").trim());
  const canSubmit = reason.trim().length >= 3 && (!inTally || tallyDeleted) && !saving;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(target.id)}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify({ reason: reason.trim(), tallyDeleted }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        setError(String(result.error || "Invoice could not be undone."));
        return;
      }
      refreshLists();
      onDone(`Invoice ${target.invoiceNo} undone. ${result.loadingSlips || 0} loading slip(s) are back in Pending Invoicing.`);
    } catch {
      setError("Invoice could not be undone. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border-2 border-black bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-black bg-red-50 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-black uppercase text-red-800"><Undo2 size={18} />Undo Invoicing</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded p-1 hover:bg-red-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-slate-300 bg-slate-50 p-3">
            <span className="font-bold text-slate-500">Invoice</span><span className="font-black">{target.invoiceNo || "-"}</span>
            <span className="font-bold text-slate-500">Tally Inv. No.</span><span className="font-black">{target.tallyInvNo || "Not in Tally"}</span>
            <span className="font-bold text-slate-500">Date</span><span>{target.date || "-"}</span>
            <span className="font-bold text-slate-500">Company</span><span>{target.companyName || "-"}</span>
            <span className="font-bold text-slate-500">Total</span><span>₹{target.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            <span className="font-bold text-slate-500">Loading slips back</span><span>{target.slipNos.length ? target.slipNos.join(", ") : "-"}</span>
          </div>
          <p className="text-xs font-semibold text-slate-600">The invoice, its lines and its gate pass are removed; the loading slips come back to Pending Invoicing with their full quantity. A full copy is kept in Undone Invoices.</p>
          <label className="block space-y-1">
            <span className="text-xs font-black uppercase text-slate-700">Reason <span className="text-red-600">*</span></span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this invoice undone?" className="w-full rounded border-2 border-black px-3 py-2 text-sm" />
          </label>
          {inTally ? (
            <label className="flex items-start gap-2 rounded border-2 border-amber-500 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              <input type="checkbox" checked={tallyDeleted} onChange={(e) => setTallyDeleted(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>I have deleted this invoice in Tally ({target.tallyInvNo}).</span>
            </label>
          ) : null}
          {error ? <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t-2 border-black px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="h-[36px] rounded border-2 border-black bg-white px-4 text-xs font-bold hover:bg-slate-100">Close</button>
          <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="h-[36px] rounded border-2 border-red-700 bg-red-700 px-4 text-xs font-black uppercase text-white hover:bg-red-800 disabled:opacity-40">{saving ? "Undoing…" : "Undo Invoice"}</button>
        </div>
      </div>
    </div>
  );
}

type UndoLogRow = { id: string; invoiceNo?: string; tallyInvNo?: string; invoiceDate?: string; companyName?: string; totalAfterGst?: number; reason?: string; tallyDeleted?: string; loadingSlipNos?: string; undoneBy?: string; undoneAt?: string };

/** Admin: list of undone invoices. */
export function UndoneInvoicesDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<UndoLogRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/invoice-undo-log", { headers: getDataAuthHeaders() })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load");
        setRows(Array.isArray(body.rows) ? body.rows : []);
      })
      .catch((err) => setError(String(err.message || err)));
  }, []);
  const when = (value?: string) => (value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "-");
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border-2 border-black bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-black px-5 py-3">
          <h3 className="text-base font-black uppercase">Undone Invoices</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase text-white">
              <tr><th className="px-3 py-2">Undone</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Tally No.</th><th className="px-3 py-2">Inv. Date</th><th className="px-3 py-2">Company</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Loading Slips</th><th className="px-3 py-2">Reason</th></tr>
            </thead>
            <tbody>
              {error ? <tr><td colSpan={8} className="px-3 py-6 text-center font-bold text-red-600">{error}</td></tr>
                : rows === null ? <tr><td colSpan={8} className="px-3 py-6 text-center font-bold text-slate-500">Loading…</td></tr>
                  : rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center font-bold text-slate-500">No invoice has been undone.</td></tr>
                    : rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-200 align-top">
                        <td className="px-3 py-2 whitespace-nowrap">{when(row.undoneAt)}<div className="text-xs text-slate-500">{row.undoneBy}</div></td>
                        <td className="px-3 py-2 font-bold">{row.invoiceNo || "-"}</td>
                        <td className="px-3 py-2">{row.tallyInvNo || "-"}{row.tallyDeleted === "Yes" ? <div className="text-xs font-bold text-amber-700">Deleted in Tally</div> : null}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.invoiceDate || "-"}</td>
                        <td className="px-3 py-2">{row.companyName || "-"}</td>
                        <td className="px-3 py-2 text-right">₹{Number(row.totalAfterGst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-xs">{row.loadingSlipNos || "-"}</td>
                        <td className="px-3 py-2 text-xs">{row.reason || "-"}</td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
