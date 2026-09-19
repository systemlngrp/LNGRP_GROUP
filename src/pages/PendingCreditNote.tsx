import { useMemo, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Spinner } from "../components/Spinner";
import { MaterialReceiptFilters } from "../components/MaterialReceiptFilters";
import { useData } from "../hooks/useData";
import { formatDate } from "../lib/serial";
import { Company, Firm, Material, MaterialIn, Supplier } from "../types";
import { useConfirm } from "../components/ConfirmDialog";
import { useNpdItems } from "../hooks/useNpdItems";
import { getFirmDisplayName } from "../lib/firmDisplay";

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
  const [materialIn, setMaterialIn, isLoading] = useData<MaterialIn>("material-in", []);
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { cacheToLocalStorage: false });
  const [materials] = useData<Material>("materials", []);
  const npdItems = useNpdItems();

  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [mrrFilter, setMrrFilter] = useState("");
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
    return materialIn
      .filter((mrr) => mrr.mrrType === "Rejection In" && !mrr.creditTallyTimestamp)
      .filter((mrr) => {
        const partyName = getPartyName(mrr.supplierId);
        const searchStr = `${mrr.transactionNo} ${partyName} ${mrr.invoiceNo}`.toLowerCase();
        return (!firmFilter || getFirmName(mrr) === firmFilter) && (!itemFilter || getItemNames(mrr).toLowerCase().includes(itemFilter.trim().toLowerCase())) && (!supplierFilter || partyName === supplierFilter) && (!mrrFilter || searchStr.includes(mrrFilter.trim().toLowerCase()));
      })
      .sort((a, b) => new Date(b.updateTimestamp || b.timestamp).getTime() - new Date(a.updateTimestamp || a.timestamp).getTime());
  }, [companies, firmFilter, itemFilter, materialIn, mrrFilter, supplierFilter, suppliers]);

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
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Pending Credit Notes</h2>
      </div>

      <MaterialReceiptFilters firmFilter={firmFilter} onFirmChange={setFirmFilter} itemFilter={itemFilter} onItemChange={setItemFilter} supplierFilter={supplierFilter} onSupplierChange={setSupplierFilter} mrrFilter={mrrFilter} onMrrChange={setMrrFilter} firms={Array.from(new Set(materialIn.filter((m) => m.mrrType === "Rejection In" && !m.creditTallyTimestamp).map(getFirmName))).sort()} suppliers={Array.from(new Set(materialIn.filter((m) => m.mrrType === "Rejection In" && !m.creditTallyTimestamp).map((m) => getPartyName(m.supplierId)))).sort()} />

      <div className="bg-white border border-black rounded shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="min-w-[950px] divide-y divide-black border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase">MRR Details</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase">Firm</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase">Supplier/Customer</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase">Taxable Amount</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase">Credit Note Tally Sync Remarks</th>
                {canPostCreditNote ? (
                  <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {creditNoteList.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-20 text-center font-bold text-slate-400 uppercase tracking-widest text-sm">
                    {isLoading ? <Spinner /> : "No pending credit notes found"}
                  </td>
                </tr>
              ) : (
                creditNoteList.map((mrr) => (
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
