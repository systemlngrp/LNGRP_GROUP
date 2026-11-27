import { useState } from "react";

// System Admin: undo an invoice's Tally posting. The voucher must be deleted in Tally first;
// the invoice then returns to Pending Tally Posting ON HOLD (editable) until it is released.
export function UndoTallyPostingDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; invoiceNo?: string; tallyInvNo?: string; tallyInvDate?: string; companyName?: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [deletedInTally, setDeletedInTally] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!reason.trim()) return setError("Enter the reason for undoing the Tally posting.");
    if (!deletedInTally) return setError("First delete the voucher in Tally, then tick the confirmation.");
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken") || "";
      const response = await fetch(`/api/invoices/${encodeURIComponent(target.id)}/undo-tally`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim(), deletedInTally: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText));
      onDone(`Invoice ${target.invoiceNo || ""}: Tally posting undone. It is in Pending Tally Posting ON HOLD – edit it if needed, then Release to Tally.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to undo the Tally posting.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="w-full max-w-lg rounded border-2 border-black bg-white p-5 text-black" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Undo Tally Posting">
        <h3 className="text-lg font-black uppercase">Undo Tally Posting</h3>
        <div className="mt-2 space-y-0.5 text-sm font-semibold">
          <div>Invoice <b>{target.invoiceNo || "-"}</b>{target.companyName ? ` · ${target.companyName}` : ""}</div>
          <div>Tally No. <b>{target.tallyInvNo || "-"}</b>{target.tallyInvDate ? ` · ${target.tallyInvDate}` : ""}</div>
        </div>
        <div className="mt-3 rounded border-2 border-amber-600 bg-amber-50 p-3 text-xs font-bold text-amber-900">
          First delete this voucher in Tally. The invoice then goes back to Pending Tally Posting on hold, so it can be edited.
          It is posted again only after you press “Release to Tally”, and Tally may give it a new number.
        </div>
        <label className="mt-3 block text-sm font-bold">Reason *
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded border-2 border-black px-3 py-2 text-sm font-normal" />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm font-bold">
          <input type="checkbox" checked={deletedInTally} onChange={(event) => setDeletedInTally(event.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>I have deleted voucher {target.tallyInvNo || ""} in Tally.</span>
        </label>
        {error ? <div className="mt-3 rounded border-2 border-red-600 bg-red-50 p-2 text-sm font-bold text-red-700">{error}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="rounded border-2 border-black px-4 py-2 text-sm font-bold disabled:opacity-50">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Undoing…" : "Undo Tally Posting"}</button>
        </div>
      </div>
    </div>
  );
}
