import { useMemo, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "../components/Spinner";
import { MaterialReceiptFilters } from "../components/MaterialReceiptFilters";
import { useData } from "../hooks/useData";
import { formatDate } from "../lib/serial";
import { Company, Firm, Material, MaterialIn, Supplier } from "../types";
import { useConfirm } from "../components/ConfirmDialog";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function getCreditNoteTaxableAmount(mrr: MaterialIn) {
  return (mrr.lines || []).reduce((sum, line) => {
    const qty = Number(line.actualQty || line.qty || line.invoiceQty || 0);
    const rate = Number(line.invoiceRate || line.rate || line.poRate || 0);
    if (qty <= 0 || rate <= 0) return sum;
    return sum + qty * rate;
  }, 0);
}

export function PendingCreditNote() {
  const confirm = useConfirm();
  const { user } = useAuth();
  // Only receipts this screen can list (all columns, so posting is unchanged);
  // the screen still applies its own filter below.
  const [materialIn, setMaterialIn, isLoading] = useData<MaterialIn>("material-in", [], {
    endpointOverride: "/api/material-in?eq_mrrType=Rejection%20In&blank=creditTallyTimestamp",
    storageKey: "material-in-pending-credit-note",
  });
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { cacheToLocalStorage: false });
  const [materials] = useData<Material>("materials", []);
  const npdItems = useNpdItemNames(); // names only: no stock calculation needed

  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [mrrFilter, setMrrFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const currentUserEmail = String(user?.email || "").trim().toLowerCase();
  const canPostCreditNote = currentUserEmail === "pankaj@bizskilledu.com";
  const columnCount = canPostCreditNote ? 7 : 6;

  function getFirmName(mrr: MaterialIn) {
    return getFirmDisplayName(firms.find((firm) => firm.id === mrr.firmId || firm.id === mrr.destinationFirmId) || (mrr.firmName ? { firmName: mrr.firmName } : null));
  }
  function getItemNames(mrr: MaterialIn) {
    return mrr.lines.map((line) => materials.find((item) => item.id === line.itemId)?.name || npdItems.find((item) => item.id === line.itemId)?.name || "Unknown").join(" ");
  }

  const getPartyName = (id: string) =>
    suppliers.find((supplier) => supplier.id === id)?.name ||
    companies.find((company) => company.id === id)?.name ||
    id;

  const creditNoteList = useMemo(() => {
    const words = searchWords(searchTerm);
    return materialIn
      .filter((mrr) => mrr.mrrType === "Rejection In" && !mrr.creditTallyTimestamp)
      .filter((mrr) => {
        const partyName = getPartyName(mrr.supplierId);
        const searchStr = `${mrr.transactionNo} ${partyName} ${mrr.invoiceNo}`.toLowerCase();
        return (!firmFilter || getFirmName(mrr) === firmFilter) && (!itemFilter || getItemNames(mrr).toLowerCase().includes(itemFilter.trim().toLowerCase())) && (!supplierFilter || partyName === supplierFilter) && (!mrrFilter || searchStr.includes(mrrFilter.trim().toLowerCase()));
      })
      .filter((mrr) => {
        // Search box: the table columns (MRR Details, Firm, Party, Date, Taxable Amount, Sync Remark).
        if (!words.length) return true;
        return matchesTableSearch([mrr.transactionNo, mrr.invoiceNo ? `INV: ${mrr.invoiceNo}` : "INV:", mrr.invoiceNo, getFirmName(mrr), getPartyName(mrr.supplierId), mrr.date || "-", getCreditNoteTaxableAmount(mrr).toFixed(2), mrr.creditRemarkTally || "-"], words);
      })
      .sort((a, b) => new Date(b.updateTimestamp || b.timestamp).getTime() - new Date(a.updateTimestamp || a.timestamp).getTime());
  }, [companies, firmFilter, itemFilter, materialIn, mrrFilter, searchTerm, supplierFilter, suppliers]);

  const { sorted: sortedCreditNotes, sort, toggle: toggleSort } = useTableSort(creditNoteList, (mrr: MaterialIn, key) => {
    switch (key) {
      case "mrr": return mrr.transactionNo;
      case "firm": return getFirmName(mrr);
      case "party": return getPartyName(mrr.supplierId);
      case "date": return mrr.date || "";
      case "amount": return getCreditNoteTaxableAmount(mrr);
      case "remark": return mrr.creditRemarkTally || "";
      default: return "";
    }
  }, [firms, suppliers, companies]);

  const handleMarkPosted = async (mrrId: string) => {
    if (!await confirm("Are you sure you want to mark this Credit Note as Posted/Cleared?")) return;

    setProcessingId(mrrId);
    try {
      const timestamp = new Date().toISOString();
      await setMaterialIn((prev) =>
        prev.map((mrr) =>
          mrr.id === mrrId
            ? {
                ...mrr,
                creditTallySync: timestamp,
                creditTallyTimestamp: timestamp,
                creditRemarkTally: `Credit Note manually marked posted at ${timestamp}`,
                updatedBy: user?.email || user?.name || "System User",
                updateTimestamp: timestamp,
              }
            : mrr
        )
      );
    } catch (err) {
      alert("Failed to update status.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Pending Credit Note Tally Posting</h2>
      </div>

      <MaterialReceiptFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} firmFilter={firmFilter} onFirmChange={setFirmFilter} itemFilter={itemFilter} onItemChange={setItemFilter} supplierFilter={supplierFilter} onSupplierChange={setSupplierFilter} mrrFilter={mrrFilter} onMrrChange={setMrrFilter} firms={Array.from(new Set(materialIn.filter((m) => m.mrrType === "Rejection In" && !m.creditTallyTimestamp).map(getFirmName))).sort()} suppliers={Array.from(new Set(materialIn.filter((m) => m.mrrType === "Rejection In" && !m.creditTallyTimestamp).map((m) => getPartyName(m.supplierId)))).sort()} />

      <div className="bg-white border border-black rounded shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="min-w-[950px] divide-y divide-black border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase"><SortHeader label="MRR Details" sortKey="mrr" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase"><SortHeader label="Party" sortKey="party" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase"><SortHeader label="Taxable Amount" sortKey="amount" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase"><SortHeader label="Sync Remark" sortKey="remark" sort={sort} onToggle={toggleSort} align="left" /></th>
                {canPostCreditNote ? (
                  <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {creditNoteList.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-20 text-center font-bold text-slate-400 uppercase tracking-widest text-sm">
                    {isLoading ? "Loading…" : "No pending credit notes found"}
                  </td>
                </tr>
              ) : (
                sortedCreditNotes.map((mrr) => (
                  <tr key={mrr.id} className="divide-x divide-black hover:bg-slate-50 transition-colors text-sm text-black">
                    <td className="px-4 py-4">
                      <div className="font-bold">{mrr.transactionNo}</div>
                      <div className="text-[10px] text-slate-500">INV: {mrr.invoiceNo}</div>
                    </td>
                    <td className="px-4 py-4 max-w-[130px] break-words">{getFirmName(mrr)}</td>
                    <td className="px-4 py-4">{getPartyName(mrr.supplierId)}</td>
                    <td className="px-4 py-4">{mrr.date ? formatDate(mrr.date) : "-"}</td>
                    <td className="px-4 py-4 text-right font-black text-indigo-700">
                      {getCreditNoteTaxableAmount(mrr).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4">{mrr.creditRemarkTally || "-"}</td>
                    {canPostCreditNote ? (
                      <td className="px-4 py-4 text-center">
                        <button
                          disabled={!!processingId}
                          onClick={() => handleMarkPosted(mrr.id)}
                          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-xs font-black uppercase hover:bg-emerald-700 flex items-center gap-2 mx-auto"
                        >
                          {processingId === mrr.id ? <Spinner size={12} /> : <><CheckCircle size={14} /> Post</>}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
