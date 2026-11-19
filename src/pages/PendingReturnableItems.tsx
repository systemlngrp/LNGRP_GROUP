import { useMemo, useState } from "react";
import { Eye, FilePlus2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { daysOutside, deriveGatePassState, getGatePassLinesWithReturns, getGatePassPrimaryPartyName, getPendingQtyForGatePass, hasSavedReturnableReceiptGateEntry, isReturnableGatePass } from "../lib/gatePassState";
import { useAuth } from "../auth/AuthContext";

// Days outside: amber after 30, red after 45; at 300+ the GST one-year limit is close.
const daysClass = (days: number) => days >= 300 ? "bg-red-700 text-white" : days > 45 ? "bg-red-100 text-red-900" : days > 30 ? "bg-amber-100 text-amber-900" : "";
const purposeOf = (gatePass: GatePass) => gatePass.purpose || "Other";
import { GateEntry, GatePass, MaterialIn } from "../types";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function PendingReturnableItems() {
  const navigate = useNavigate();
  const [gatePasses, setGatePasses] = useData<GatePass>("gate_passes", []);
  const [gateEntries] = useData<GateEntry>("gate-entries", []);
  const [materialIn] = useData<MaterialIn>("material-in", []);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const [purposeTab, setPurposeTab] = useState<"All" | "Job Work" | "Others">("All");
  const [selectedGatePassId, setSelectedGatePassId] = useState<string | null>(null);

  const pendingGatePasses = useMemo(() => {
    // Search: only the columns the table shows.
    const words = searchWords(searchTerm);
    return gatePasses
        .filter((gatePass) => isReturnableGatePass(gatePass))
        .filter((gatePass) => purposeTab === "All" || (purposeTab === "Job Work" ? purposeOf(gatePass) === "Job Work" : purposeOf(gatePass) !== "Job Work"))
        .filter((gatePass) => !hasSavedReturnableReceiptGateEntry(gatePass, gateEntries))
        .filter((gatePass) => {
          const state = deriveGatePassState(gatePass, materialIn);
          return state === "Open" || state === "Partially Returned";
        })
        .filter((gatePass) => {
          if (!words.length) return true;
          const itemNames = (gatePass.lines || [])
            .map((line) => String(line.itemDescription || line.itemName || "").trim())
            .filter(Boolean);
          return matchesTableSearch(
            [
              gatePass.gatePassNo,
              formatDate(gatePass.date),
              purposeOf(gatePass),
              gatePass.jobNo,
              gatePass.process,
              getGatePassPrimaryPartyName(gatePass),
              itemNames,
              gatePass.truckNo,
              Number(gatePass.totalQty || 0),
              getPendingQtyForGatePass(gatePass, materialIn),
              deriveGatePassState(gatePass, materialIn),
            ],
            words
          );
        })
        // Longest outside (overdue) first.
        .sort((a, b) => daysOutside(b) - daysOutside(a) || String(b.gatePassNo || "").localeCompare(String(a.gatePassNo || ""), undefined, { numeric: true }));
  }, [gateEntries, gatePasses, materialIn, purposeTab, searchTerm]);

  const selectedGatePass = pendingGatePasses.find((gatePass) => gatePass.id === selectedGatePassId) || null;
  const getGatePassItemNames = (gatePass: GatePass) => {
    const labels = Array.from(
      new Set(
        (gatePass.lines || [])
          .map((line) => String(line.itemDescription || line.itemName || "").trim())
          .filter(Boolean)
      )
    );
    return labels.length ? labels.join(", ") : "-";
  };
  const selectedLines = selectedGatePass ? getGatePassLinesWithReturns(selectedGatePass, materialIn) : [];
  const { sorted: sortedGatePasses, sort, toggle: toggleSort } = useTableSort(pendingGatePasses, (gatePass, key) => {
    switch (key) {
      case "gatePassNo": return gatePass.gatePassNo;
      case "date": return gatePass.date;
      case "purpose": return purposeOf(gatePass);
      case "jobNo": return gatePass.jobNo || "";
      case "days": return daysOutside(gatePass);
      case "recipient": return getGatePassPrimaryPartyName(gatePass);
      case "itemName": return getGatePassItemNames(gatePass);
      case "truck": return gatePass.truckNo;
      case "totalQty": return Number(gatePass.totalQty || 0);
      case "pendingQty": return getPendingQtyForGatePass(gatePass, materialIn);
      case "state": return deriveGatePassState(gatePass, materialIn);
      default: return "";
    }
  }, [materialIn]);
  const { sorted: sortedLines, sort: lineSort, toggle: toggleLineSort } = useTableSort(selectedLines, (line, key) => {
    switch (key) {
      case "item": return line.itemDescription || line.itemName;
      case "qty": return line.qty;
      case "returnedQty": return line.returnedQty;
      case "pendingQty": return line.pendingQty;
      case "shortQty": return line.shortQty;
      case "uom": return line.uom;
      default: return "";
    }
  });

  const handleClearOff = async (gatePass: GatePass) => {
    const reason = window.prompt("Enter clear-off reason for this returnable gate pass:");
    if (!reason || !reason.trim()) return;
    const timestamp = new Date().toISOString();
    await setGatePasses((prev) =>
      prev.map((entry) =>
        entry.id === gatePass.id
          ? { ...entry, clearOffReason: reason.trim(), clearedOffAt: timestamp, clearedOffBy: user?.name || "System User", updatedBy: user?.name || "System User", updateTimestamp: timestamp }
          : entry
      )
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Returnable Items</h2>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded border border-black bg-white p-4 shadow-sm">
        <div className="flex gap-1" role="tablist" aria-label="Purpose">
          {(["All", "Job Work", "Others"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={purposeTab === tab} onClick={() => setPurposeTab(tab)} className={`rounded border-2 px-3 py-1.5 text-sm font-bold ${purposeTab === tab ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black hover:bg-slate-50"}`}>{tab === "Others" ? "Repair / Sample / Other" : tab}</button>
          ))}
        </div>
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search" className="w-full max-w-xl rounded border border-black px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
      </div>

      <div className="overflow-hidden rounded border border-black bg-white shadow-sm">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr className="divide-x divide-black">
              {[["Gate Pass No", "gatePassNo"], ["Date", "date"], ["Purpose", "purpose"], ["Recipient / Job Worker", "recipient"], ["Job No", "jobNo"], ["Item Name", "itemName"], ["Truck", "truck"], ["Total Qty", "totalQty"], ["Pending Qty", "pendingQty"], ["Days Outside", "days"], ["Derived State", "state"], ["Actions", ""]].map(([heading, key]) => (
                <th key={heading} className="border-b border-black px-4 py-3 text-left text-xs font-black uppercase text-black">{key ? <SortHeader label={heading} sortKey={key} sort={sort} onToggle={toggleSort} align="left" /> : heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black bg-white">
            {pendingGatePasses.length === 0 ? (
              <tr>
                <td colSpan={12} className="h-16" aria-label="No records" />
              </tr>
            ) : (
              sortedGatePasses.map((gatePass) => (
                <tr key={gatePass.id} className="divide-x divide-black hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-bold text-black">{gatePass.gatePassNo}</td>
                  <td className="px-4 py-3 text-sm text-black">{formatDate(gatePass.date)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-black">{purposeOf(gatePass)}{gatePass.process ? <div className="text-xs font-normal text-slate-600">{gatePass.process}</div> : null}</td>
                  <td className="px-4 py-3 text-sm text-black">{getGatePassPrimaryPartyName(gatePass)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-black">{gatePass.jobNo || "-"}</td>
                  <td className="px-4 py-3 text-sm text-black max-w-[320px]">{getGatePassItemNames(gatePass)}</td>
                  <td className="px-4 py-3 text-sm text-black">{gatePass.truckNo || "-"}</td>
                  <td className="px-4 py-3 text-right text-sm text-black">{Number(gatePass.totalQty || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-amber-700">{getPendingQtyForGatePass(gatePass, materialIn).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right text-sm font-black ${daysClass(daysOutside(gatePass))}`} title={daysOutside(gatePass) >= 300 ? "Close to the GST one-year limit for job work" : undefined}>{daysOutside(gatePass)}{daysOutside(gatePass) >= 300 ? " ⚠" : ""}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-black">{deriveGatePassState(gatePass, materialIn)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setSelectedGatePassId(gatePass.id)} className="rounded border border-black p-2 hover:bg-slate-100" title="View">
                        <Eye size={15} />
                      </button>
                      <button type="button" onClick={() => navigate(`/gate-entry/form?purpose=Returnable%20Receipt&sourceGatePassId=${gatePass.id}`)} className="rounded border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                        Create Return Gate Entry
                      </button>
                      <button type="button" onClick={() => handleClearOff(gatePass)} className="rounded border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">
                        <XCircle size={15} className="inline-block mr-1" />
                        Clear Off
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedGatePass ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded border border-black bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-blue-700">{selectedGatePass.gatePassNo}</h3>
                <p className="mt-1 text-sm text-slate-500">{getGatePassPrimaryPartyName(selectedGatePass)} | {deriveGatePassState(selectedGatePass, materialIn)}</p>
              </div>
              <button type="button" onClick={() => setSelectedGatePassId(null)} className="rounded-full border border-slate-300 px-3 py-2 text-slate-700 transition hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="overflow-hidden rounded border border-black">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-30 bg-slate-100">
                  <tr className="divide-x divide-black">
                    {[["Item", "item"], ["Sent Qty", "qty"], ["Returned Qty", "returnedQty"], ["Pending Qty", "pendingQty"], ["Short (closed)", "shortQty"], ["UOM", "uom"]].map(([heading, key]) => (
                      <th key={heading} className="border-b border-black px-3 py-2 text-left text-[10px] font-black uppercase"><SortHeader label={heading} sortKey={key} sort={lineSort} onToggle={toggleLineSort} align="left" /></th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black bg-white">
                  {sortedLines.map((line) => (
                    <tr key={line.id} className="divide-x divide-black">
                      <td className="px-3 py-2 text-xs font-bold">{line.itemDescription || line.itemName}</td>
                      <td className="px-3 py-2 text-right text-xs">{line.qty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs">{line.returnedQty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-amber-700">{line.pendingQty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-red-700">{line.shortQty ? line.shortQty.toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 text-xs">{line.uom || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




