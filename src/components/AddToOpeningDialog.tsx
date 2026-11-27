import { useEffect, useMemo, useState } from "react";
import { PackagePlus, X } from "lucide-react";
import { Select } from "./Select";
import { getDataAuthHeaders } from "../hooks/useData";

type Item = { id: string; erp: string; itemName: string };
type Firm = { id: string; firmName?: string; shortName?: string };

/**
 * Admin only: add boxes to an FG item's opening stock (found later, not in the physical
 * count). Adds to the live-stock opening and to the firm's opening, so loading can take
 * them from "FG Stock". Every addition is logged (history: System Admin).
 */
export function AddToOpeningDialog({
  onClose,
  onSaved,
  source,
  defaultItemId = "",
  defaultFirmId = "",
}: {
  onClose: () => void;
  onSaved?: (message: string) => void;
  source: string;
  defaultItemId?: string;
  defaultFirmId?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [itemId, setItemId] = useState(defaultItemId);
  const [firmId, setFirmId] = useState(defaultFirmId);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"add" | "reduce">("add");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/fg-opening/items", { headers: getDataAuthHeaders(false) as HeadersInit })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) return setError(body?.error || "Could not load items.");
        setItems(body.items || []);
        setFirms(body.firms || []);
        if (!defaultFirmId) {
          // Default: Unit-II (the physical count is of Unit-II).
          const unit2 = (body.firms || []).find((firm: Firm) => /unit\s*[-–]?\s*(ii|2)\b/i.test(String(firm.firmName || "")));
          if (unit2) setFirmId(unit2.id);
        }
      })
      .catch(() => alive && setError("Could not load items."));
    return () => { alive = false; };
  }, [defaultFirmId]);

  const itemOptions = useMemo(() => items.map((item) => ({ value: item.id, label: `${item.erp} - ${item.itemName}` })), [items]);
  const firmOptions = useMemo(() => firms.map((firm) => ({ value: firm.id, label: firm.shortName ? `${firm.shortName} (${firm.firmName})` : String(firm.firmName || "") })), [firms]);

  const save = async () => {
    const amount = Number(qty);
    if (!itemId) return setError("Select the item.");
    if (!firmId) return setError("Select the firm.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Quantity must be more than 0.");
    if (reason.trim().length < 3) return setError(mode === "add" ? "Give a reason (where the boxes were found)." : "Give a reason (why the boxes are not there).");
    setSaving(true);
    setError("");
    try {
      const response = await fetch(mode === "add" ? "/api/fg-opening/add" : "/api/fg-opening/reduce", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getDataAuthHeaders(false) as Record<string, string>) },
        body: JSON.stringify({ npdId: itemId, firmId, qty: amount, reason: reason.trim(), source }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not change opening stock.");
      onSaved?.(`${mode === "add" ? "Added" : "Reduced"} ${amount.toLocaleString("en-IN")} ${mode === "add" ? "to" : "from"} the opening of ${body.erp} ${body.itemName || ""}. Opening now ${Number(body.openingNow || 0).toLocaleString("en-IN")}.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border-2 border-black bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2 font-black uppercase tracking-wide"><PackagePlus size={18} /> Opening Stock – Add / Reduce</div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/20"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <div className="grid grid-cols-2 overflow-hidden rounded border-2 border-black text-sm font-black">
            <button type="button" onClick={() => { setMode("add"); setError(""); }} className={mode === "add" ? "bg-emerald-700 py-2 text-white" : "bg-white py-2"}>+ Add</button>
            <button type="button" onClick={() => { setMode("reduce"); setError(""); }} className={mode === "reduce" ? "bg-red-700 py-2 text-white" : "bg-white py-2"}>− Reduce</button>
          </div>
          <p className="text-xs font-semibold text-slate-600">{mode === "add" ? "For FG boxes on the floor that were not in the physical count. Added to the item's existing opening (or starts one)." : "For opening boxes that are not really there. Only the item's remaining opening (old) stock can be reduced, never below zero; job stock is reduced through the job."} Every change is logged.</p>
          <label className="block space-y-1"><span className="text-[11px] font-black uppercase text-slate-600">ERP - Item *</span><Select options={itemOptions} value={itemId} onChange={setItemId} placeholder="Search ERP or item" /></label>
          <label className="block space-y-1"><span className="text-[11px] font-black uppercase text-slate-600">Firm *</span><Select options={firmOptions} value={firmId} onChange={setFirmId} placeholder="Select firm" /></label>
          <label className="block space-y-1"><span className="text-[11px] font-black uppercase text-slate-600">{mode === "add" ? "Quantity to add *" : "Quantity to reduce *"}</span><input type="number" min={1} value={qty} onChange={(event) => setQty(event.target.value)} className="w-full rounded border-2 border-black px-3 py-2 text-right font-bold" placeholder="0" /></label>
          <label className="block space-y-1"><span className="text-[11px] font-black uppercase text-slate-600">Reason *</span><input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded border-2 border-black px-3 py-2" placeholder="e.g. found in FG godown R3, not counted on 26-Nov" /></label>
          {error ? <div className="rounded border-2 border-red-600 bg-red-50 p-2 text-xs font-bold text-red-700">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t-2 border-black bg-slate-50 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded border-2 border-black bg-white px-4 py-2 text-sm font-bold">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={`rounded px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${mode === "add" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"}`}>{saving ? "Saving..." : mode === "add" ? "Add to Opening" : "Reduce Opening"}</button>
        </div>
      </div>
    </div>
  );
}
