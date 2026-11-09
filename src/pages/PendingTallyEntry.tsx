import { useData } from "../hooks/useData";
import { Firm, Material, MaterialIn, Item, Supplier } from "../types";
import { Fragment, useEffect, useState, useMemo } from "react";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { Spinner } from "../components/Spinner";

import { MaterialReceiptFilters } from "../components/MaterialReceiptFilters";
import { formatDate } from "../lib/serial";
import { cn } from "../lib/utils";
import { CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useNpdItemNames } from "../hooks/useNpdItems";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { getFirmDisplayName } from "../lib/firmDisplay";

export function PendingTallyEntry() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [firmFilter, setFirmFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [mrrFilter, setMrrFilter] = useState('');

  // Only receipts in Pending Tally are listed (all columns, so saves are unchanged).
  const [materialIn, setMaterialIn] = useData<MaterialIn>("material-in", [], {
    firmScope: "all",
    endpointOverride: "/api/material-in?status=Pending%20Tally",
    storageKey: "material-in-pending-tally",
  });
  const [materials] = useData<Material>("materials", []);
  const npdItems = useNpdItemNames(); // names only: no stock calculation needed
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [firms] = useData<Firm>("firms", [], { cacheToLocalStorage: false });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const currentUserEmail = String(user?.email || "").trim().toLowerCase();
  const canPostTally = currentUserEmail === "pankaj@bizskilledu.com";
  const tableColumnCount = canPostTally ? 23 : 21;
  const formatMoney = (value?: number) =>
    `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Lookups built once (the row loops used to search the full material, NPD,
  // supplier and firm lists for every line on every render). First match
  // wins, the same as .find().
  const firstNameById = (rows: Array<{ id: string; name?: string }>) => {
    const map = new Map<string, string | undefined>();
    rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row.name); });
    return map;
  };
  const materialNameById = useMemo(() => firstNameById(materials as any), [materials]);
  const npdNameById = useMemo(() => firstNameById(npdItems as any), [npdItems]);
  const supplierNameById = useMemo(() => firstNameById(suppliers as any), [suppliers]);
  const firmIndexById = useMemo(() => {
    const map = new Map<string, number>();
    firms.forEach((firm, index) => { if (!map.has(firm.id)) map.set(firm.id, index); });
    return map;
  }, [firms]);
  const itemNameFor = (itemId: string) => materialNameById.get(itemId) || npdNameById.get(itemId);

  const pendingList = useMemo(() => {
    return materialIn
      .filter((m) => m.status === "Pending Tally" && String(m.mrrType || "").trim().toLowerCase() !== "rejection in")
      .filter((m) => {
        const firmName = getFirmName(m);
        const itemNames = getItemNames(m).toLowerCase();
        const supplierName = getSupplierName(m.supplierId);
        return (!firmFilter || firmName === firmFilter) && (!itemFilter || itemNames.includes(itemFilter.trim().toLowerCase())) && (!supplierFilter || supplierName === supplierFilter) && (!mrrFilter || String(m.transactionNo || "").toLowerCase().includes(mrrFilter.trim().toLowerCase()));
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmFilter, itemFilter, materialIn, mrrFilter, supplierFilter, materialNameById, npdNameById, supplierNameById, firmIndexById]);

  // 25 rows per page: most receipts wait here, and drawing all of them froze
  // the screen. Select-all and bulk posting still cover every pending record.
  const pendingPagination = useClientPagination(pendingList, 25);
  const { setPage: setPendingPage } = pendingPagination;
  useEffect(() => { setPendingPage(1); }, [firmFilter, itemFilter, supplierFilter, mrrFilter, setPendingPage]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingList.map(m => m.id));
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  const handleComplete = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId(null), 3000);
      return;
    }
    setSubmittingId(id);
    try {
      const timestamp = new Date().toISOString();
      await setMaterialIn(prev =>
        prev.map((m) =>
          m.id === id ? { ...m, status: "Completed", tallyTimestamp: timestamp, updateTimestamp: timestamp } : m
        )
      );
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch (err) {
      console.error("Failed to complete Material In tally entry:", err);
    } finally {
      setSubmittingId(null);
      setConfirmId(null);
    }
  };

  const handleBulkComplete = async () => {
    if (selectedIds.length === 0) return;
    if (!await confirm(`Are you sure you want to complete tally entry for ${selectedIds.length} items?`)) return;

    setIsBulkSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      await setMaterialIn(prev =>
        prev.map((m) =>
          selectedIds.includes(m.id) ? { ...m, status: "Completed", tallyTimestamp: timestamp, updateTimestamp: timestamp } : m
        )
      );
      setSelectedIds([]);
    } catch (err) {
      console.error("Bulk completion failed:", err);
      alert("Failed to complete some entries.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const getLineItemsElement = (lines: MaterialIn['lines'] = []) => {
    return (
      <ul className="list-none space-y-1">
        {lines.map((l, idx) => {
          const itemName = itemNameFor(l.itemId);
          return (
            <li key={idx} className="whitespace-normal break-words border-b border-black last:border-0 pb-1 last:pb-0 mb-1 last:mb-0 text-[10px]">
              <span className="font-medium text-black">{itemName || 'Unknown'}</span>
              <span className="ml-2 text-black">[{l.qty} {l.uom} @ {l.rate}]</span>
            </li>
          );
        })}
      </ul>
    );
  };

  const getItemValue = (lines: MaterialIn["lines"] = []) =>
    lines.reduce((sum, line) => {
      const lineValue =
        Number(line.actualValue ?? line.value ?? (Number(line.qty || 0) * Number(line.rate || 0)) ?? 0) || 0;
      return sum + lineValue;
    }, 0);

  function getSupplierName(id: string) {
    return supplierNameById.get(id) || id;
  }
  function getFirmName(mrr: MaterialIn) {
    // Earliest firm in the list matching either id (same as the old .find).
    const indexes = [mrr.firmId, mrr.destinationFirmId]
      .map((id) => (id === undefined || id === null ? undefined : firmIndexById.get(id)))
      .filter((index): index is number => index !== undefined);
    const firm = indexes.length ? firms[Math.min(...indexes)] : undefined;
    return getFirmDisplayName(firm || (mrr.firmName ? { firmName: mrr.firmName } : null));
  }
  function getItemNames(mrr: MaterialIn) {
    return mrr.lines.map((line) => itemNameFor(line.itemId) || "Unknown").join(" ");
  }
  const firmOptions = Array.from(new Set(materialIn.filter((m) => m.status === "Pending Tally").map(getFirmName))).sort();
  const supplierOptions = Array.from(new Set(materialIn.filter((m) => m.status === "Pending Tally").map((m) => getSupplierName(m.supplierId)))).sort();

  const allSelected = selectedIds.length === pendingList.length && pendingList.length > 0;
  const th = "border border-black px-3 py-3 text-xs font-bold uppercase";
  const td = "border border-black px-3 py-2";
  const money = "border border-black px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending MRR Tally Posting</h2>
      </div>

      <MaterialReceiptFilters firmFilter={firmFilter} onFirmChange={setFirmFilter} itemFilter={itemFilter} onItemChange={setItemFilter} supplierFilter={supplierFilter} onSupplierChange={setSupplierFilter} mrrFilter={mrrFilter} onMrrChange={setMrrFilter} firms={firmOptions} suppliers={supplierOptions} />

      {/* Bulk posting: shown once something is selected */}
      {canPostTally && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-indigo-700 bg-indigo-50 px-3 py-2">
          <span className="text-sm font-black text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds([])} className="rounded border border-black bg-white px-3 py-1.5 text-sm font-bold hover:bg-slate-50">
              Clear
            </button>
            <button
              type="button"
              disabled={isBulkSubmitting}
              onClick={handleBulkComplete}
              className="inline-flex items-center gap-1.5 rounded border-2 border-emerald-800 bg-emerald-600 px-4 py-1.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isBulkSubmitting ? <Spinner size={14} className="text-white" /> : <CheckCircle size={16} />} Post Selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-black">
            <tr>
              {canPostTally ? (
                <th className={`${th} w-10 text-center`}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 accent-indigo-600" aria-label="Select all" />
                </th>
              ) : null}
              <th className={`${th} text-left`}>Trn No</th>
              <th className={`${th} text-left`}>Firm</th>
              <th className={`${th} text-left`}>MRR Type</th>
              <th className={`${th} text-left`}>Date</th>
              <th className={`${th} text-left`}>Party</th>
              <th className={`${th} text-left`}>Items</th>
              <th className={`${th} text-right`}>Gross Amount</th>
              <th className={`${th} text-right`}>TDS</th>
              <th className={`${th} text-right`}>Net Payable</th>
              <th className={`${th} text-right`}>Item Value</th>
              <th className={`${th} text-right`}>Pre-GST Invoice Value</th>
              <th className={`${th} text-right`}>Actual Value</th>
              <th className={`${th} text-right`}>CGST</th>
              <th className={`${th} text-right`}>SGST</th>
              <th className={`${th} text-right`}>IGST</th>
              <th className={`${th} text-right`}>Post-GST Invoice Value</th>
              <th className={`${th} text-right`}>Insurance</th>
              <th className={`${th} text-right`}>Other Charges</th>
              <th className={`${th} text-right`}>Round Off</th>
              <th className={`${th} text-left`}>Sync Remark</th>
              <th className={`${th} text-center`}>Details</th>
              {canPostTally ? <th className={`${th} text-center`}>Actions</th> : null}
            </tr>
          </thead>
          <tbody className="bg-white text-black">
            {pendingList.length === 0 ? (
              <tr>
                <td colSpan={tableColumnCount} className="h-16" aria-label="No records" />
              </tr>
            ) : (
              pendingPagination.paginatedItems.map((m) => {
                const isExpanded = expandedIds.includes(m.id);
                return (
                  <Fragment key={m.id}>
                    <tr className={cn("align-middle hover:bg-slate-50", selectedIds.includes(m.id) && "bg-indigo-50/60")}>
                      {canPostTally ? (
                        <td className={`${td} text-center`}>
                          <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} className="h-4 w-4 accent-indigo-600" aria-label={`Select ${m.transactionNo}`} />
                        </td>
                      ) : null}
                      <td className={`${td} font-bold`}>{m.transactionNo}</td>
                      <td className={`${td} font-semibold`}>{getFirmName(m)}</td>
                      <td className={td}>{m.mrrType || "-"}</td>
                      <td className={td}>{formatDate(m.date)}</td>
                      <td className={td}>{getSupplierName(m.supplierId)}</td>
                      <td className={td}>{m.lines?.length || 0} item{(m.lines?.length || 0) === 1 ? "" : "s"}</td>
                      <td className={`${money} font-bold`}>{formatMoney(m.totalAmount)}</td>
                      <td className={money}>{formatMoney(m.tdsAmount)}</td>
                      <td className={`${money} font-bold`}>{formatMoney(m.netSupplierPayable ?? (Number(m.totalAmount || 0) - Number(m.tdsAmount || 0)))}</td>
                      <td className={money}>{formatMoney(getItemValue(m.lines))}</td>
                      <td className={money}>{formatMoney(m.totalInvoiceValue)}</td>
                      <td className={money}>{formatMoney(m.totalActualValue)}</td>
                      <td className={money}>{formatMoney(m.totalCgst)}</td>
                      <td className={money}>{formatMoney(m.totalSgst)}</td>
                      <td className={money}>{formatMoney(m.totalIgst)}</td>
                      <td className={money}>{formatMoney(m.totalInvoiceValueAfterGst)}</td>
                      <td className={money}>{formatMoney(m.insurance)}</td>
                      <td className={money}>{formatMoney(m.otherCharges)}</td>
                      <td className={money}>{formatMoney(m.roundOff)}</td>
                      <td className={td}>
                        <div className="max-w-[320px] whitespace-pre-wrap break-words text-xs font-semibold text-rose-700" title={m.tallySyncRemark || ""}>
                          {m.tallySyncRemark || "-"}
                        </div>
                      </td>
                      <td className={`${td} text-center`}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(m.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-100"
                          title={isExpanded ? "Hide item details" : "Show item details"}
                          aria-label={isExpanded ? "Hide item details" : "Show item details"}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      {canPostTally ? (
                        <td className={`${td} text-center`}>
                          <button
                            type="button"
                            onClick={() => handleComplete(m.id)}
                            disabled={submittingId === m.id || isBulkSubmitting}
                            className={cn(
                              "inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-md border-2 px-3 py-1.5 text-xs font-black transition disabled:opacity-50",
                              confirmId === m.id
                                ? "animate-pulse border-amber-700 bg-amber-500 text-white"
                                : "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
                            )}
                            title={confirmId === m.id ? "Click again to confirm" : "Post to Tally"}
                          >
                            {submittingId === m.id ? <Spinner size={12} className="text-white" /> : <><CheckCircle size={14} />{confirmId === m.id ? "Confirm?" : "Post"}</>}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={tableColumnCount} className="border border-black px-4 py-3">
                          <div className="mb-2 text-xs font-black uppercase text-slate-700">Item details</div>
                          {getLineItemsElement(m.lines)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <ClientPagination
        page={pendingPagination.page}
        pageSize={pendingPagination.pageSize}
        totalItems={pendingPagination.totalItems}
        onPageChange={pendingPagination.setPage}
        onPageSizeChange={pendingPagination.setPageSize}
      />
    </div>
  );
}
