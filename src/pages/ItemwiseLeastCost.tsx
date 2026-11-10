import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { Production } from "../types";
import { Search } from "lucide-react";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";

interface LeastCostRecord {
  date: string;
  jobCardNo: string;
  itemName: string;
  erp: string;
  company: string;
  length: number;
  breadth: number;
  height: number;
  reelAsPerCalc: number;
  reelActual: number;
  cutting: number;
  l1: number;
  f1: number;
  l2: number;
  f2: number;
  l3: number;
  gsm: number;
  sheetWeight: number;
  erpCode: string;
}


export function ItemwiseLeastCost() {
  const [productions, , prodsLoading] = useData<Production>("productions", []);
  const npdItems = useNpdItemsWithoutStock();
  const itemsLoading = false;
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const isLoading = prodsLoading || itemsLoading;

  const leastCostData = useMemo(() => {
      const erpMap = new Map<string, LeastCostRecord>();

    const npdById = new Map(npdItems.map((item) => [item.id, item]));
    productions.forEach((prod) => {
      // Skip canceled jobs
      if (prod.status === "Cancelled" || prod.cancelTimestamp) return;

      const erp = String(prod.erpCode || "").trim();
      const gsm = Number(prod.gsm || 0);
      
      if (!erp || isNaN(gsm) || gsm <= 0) return;

      const item = npdById.get(prod.itemId);
      const itemName = item?.name || String(prod.itemId || "Unknown Item");

      if (!erpMap.has(erp) || gsm < erpMap.get(erp)!.gsm) {
        erpMap.set(erp, {
          date: prod.date,
          jobCardNo: String(prod.transactionNo || ""),
          itemName,
          erp,
          company: prod.companyName || "",
          length: Number(prod.length || 0),
          breadth: Number(prod.breadth || 0),
          height: Number(prod.height || 0),
          reelAsPerCalc: Number(prod.reelAsPerCalc || 0),
          reelActual: Number(prod.reelActualWithTrimming || 0),
          cutting: Number(prod.cuttingWithTrimming || 0),
          l1: Number(prod.l1 || 0),
          f1: Number(prod.f1 || 0),
          l2: Number(prod.l2 || 0),
          f2: Number(prod.f2 || 0),
          l3: Number(prod.l3 || 0),
          gsm,
          sheetWeight: Number(prod.sheetWeight || 0)
          ,erpCode: erp
        });
      }
    });

    npdItems.forEach((item) => {
      const erp = String(item.erp || "").trim();
      const gsm = Number(item.gsmLeastCost || 0);
      if (!erp) return;
      const existing = erpMap.get(erp);
      if (existing) {
        existing.itemName = item.name || existing.itemName;
        existing.company = item.customer || existing.company;
        existing.length = Number(item.length || 0);
        existing.breadth = Number(item.breadth || 0);
        existing.height = Number(item.height || 0);
        existing.l1 = Number(item.l1 || 0);
        existing.f1 = Number(item.f1 || 0);
        existing.l2 = Number(item.l2 || 0);
        existing.f2 = Number(item.f2 || 0);
        existing.l3 = Number(item.l3 || 0);
        if (gsm > 0) { existing.gsm = gsm; existing.jobCardNo = "Opening"; }
        return;
      }
      if (gsm > 0) erpMap.set(erp, { date: "", jobCardNo: "Opening", itemName: item.name || "", erp, erpCode: erp, company: item.customer || "", length: Number(item.length || 0), breadth: Number(item.breadth || 0), height: Number(item.height || 0), reelAsPerCalc: 0, reelActual: 0, cutting: 0, l1: Number(item.l1 || 0), f1: Number(item.f1 || 0), l2: Number(item.l2 || 0), f2: Number(item.f2 || 0), l3: Number(item.l3 || 0), gsm, sheetWeight: 0 });
    });

    return Array.from(erpMap.values()).sort((a, b) => a.erp.localeCompare(b.erp));
  }, [productions, npdItems]);
  const filteredData = useMemo(() => {
    const words = searchWords(searchTerm);
    return leastCostData.filter((row) => {
      const itemValue = itemFilter.split("::")[0];
      return (!companyFilter || row.company === companyFilter) &&
        (!itemFilter || row.itemName === itemValue) &&
        (!jobFilter || row.jobCardNo === jobFilter) &&
        (!erpFilter || row.erp === erpFilter) &&
        (!words.length || matchesTableSearch(rowSearchText([row.jobCardNo, row.itemName, row.erp, row.company, row.length, row.breadth, row.height, row.reelAsPerCalc, row.reelActual, row.cutting, row.l1, row.f1, row.l2, row.f2, row.l3, row.gsm, row.sheetWeight]), words));
    });
  }, [companyFilter, erpFilter, itemFilter, jobFilter, leastCostData, searchTerm]);

  const companyOptions = useMemo(() => Array.from(new Set(leastCostData.map((row) => row.company).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })), [leastCostData]);
  const itemOptions = useMemo(() => Array.from(new Map(leastCostData.map((row) => [`${row.itemName}::${row.erp}`, { value: `${row.itemName}::${row.erp}`, label: row.erp && row.itemName && !row.itemName.toLowerCase().includes(row.erp.toLowerCase()) ? `${row.itemName} - ${row.erp}` : row.itemName || row.erp, searchText: `${row.itemName} ${row.erp}` }])).values()).filter((option) => option.label).sort((a, b) => a.label.localeCompare(b.label)), [leastCostData]);
  const jobOptions = useMemo(() => Array.from(new Set(leastCostData.map((row) => row.jobCardNo).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })), [leastCostData]);
  const erpOptions = useMemo(() => Array.from(new Set(leastCostData.map((row) => row.erp).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })), [leastCostData]);

  // Column sort over every filtered row before paging; no sort keeps ERP order.
  const { sorted: sortedData, sort, toggle: toggleSort } = useTableSort(filteredData, (row, key) => (key === "jobCardNo" ? row.jobCardNo || "" : row[key as keyof LeastCostRecord]));

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedData,
  } = useClientPagination(sortedData, 25);

  // The centred loading card comes from the page loading boundary.
  if (isLoading) return null;

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const hasFilters = Boolean(searchTerm.trim() || companyFilter || itemFilter || jobFilter || erpFilter);
  const clearFilters = () => { setSearchTerm(""); setCompanyFilter(""); setItemFilter(""); setJobFilter(""); setErpFilter(""); };
  const TH = "border border-black px-2 py-2 text-[10px] font-black uppercase";
  const TD = "border border-black px-2 py-1.5 text-xs text-black";
  const NUM = `${TD} whitespace-nowrap text-right`;
  const sortHead = (label: string, key: string, align: "left" | "right" = "right") => <SortHeader label={label} sortKey={key} sort={sort} onToggle={toggleSort} align={align} />;

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Itemwise Least Cost</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Job No</span><Select compact value={jobFilter} onChange={setJobFilter} options={jobOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>ERP Code</span><Select compact value={erpFilter} onChange={setErpFilter} options={erpOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="text-xs font-bold text-slate-700">{filteredData.length.toLocaleString()} {filteredData.length === 1 ? "item" : "items"}{hasFilters ? <span className="font-semibold text-slate-500"> of {leastCostData.length.toLocaleString()}</span> : null}</div>

      {/* Phones: one card per ERP. */}
      <div className="space-y-2 md:hidden">
        {paginatedData.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-bold text-slate-500">No data found.</div>
        ) : paginatedData.map((row, idx) => (
          <div key={`${row.erp}-${idx}`} className="rounded-lg border-2 border-black bg-white p-3 text-black">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-black">{row.erp}</span>
              <span className="text-[11px] font-bold text-slate-600">{row.jobCardNo || "-"}</span>
            </div>
            <div className="mt-1 break-words text-xs font-bold">{row.itemName}</div>
            <div className="break-words text-xs text-slate-700">{row.company || "-"}</div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              {([["L×B×H", `${row.length}×${row.breadth}×${row.height}`], ["GSM", row.gsm], ["Sheet Wt", row.sheetWeight], ["Cut", row.cutting], ["Reel Calc", row.reelAsPerCalc], ["Reel Act", row.reelActual], ["L1/F1", `${row.l1}/${row.f1}`], ["L2/F2/L3", `${row.l2}/${row.f2}/${row.l3}`]] as const).map(([label, value]) => (
                <div key={label} className={`rounded border border-slate-300 px-1 py-1 ${label === "GSM" ? "bg-emerald-50" : "bg-slate-50"}`}>
                  <div className="text-[9px] font-black uppercase text-slate-500">{label}</div>
                  <div className={`break-all text-[11px] font-black ${label === "GSM" ? "text-emerald-700" : ""}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white md:block">
        <div className="table-sticky-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className={TH}>SL No</th>
                <th className={TH}>{sortHead("Job No", "jobCardNo", "left")}</th>
                <th className={TH}>{sortHead("Item Name", "itemName", "left")}</th>
                <th className={TH}>{sortHead("ERP Code", "erp", "left")}</th>
                <th className={TH}>{sortHead("Company", "company", "left")}</th>
                <th className={TH}>{sortHead("L", "length")}</th>
                <th className={TH}>{sortHead("B", "breadth")}</th>
                <th className={TH}>{sortHead("H", "height")}</th>
                <th className={TH}>{sortHead("Reel Calc", "reelAsPerCalc")}</th>
                <th className={TH}>{sortHead("Reel Act", "reelActual")}</th>
                <th className={TH}>{sortHead("Cut", "cutting")}</th>
                <th className={TH}>{sortHead("L1", "l1")}</th>
                <th className={TH}>{sortHead("F1", "f1")}</th>
                <th className={TH}>{sortHead("L2", "l2")}</th>
                <th className={TH}>{sortHead("F2", "f2")}</th>
                <th className={TH}>{sortHead("L3", "l3")}</th>
                <th className={TH}>{sortHead("GSM", "gsm")}</th>
                <th className={TH}>{sortHead("Sheet Wt", "sheetWeight")}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={18} className="px-6 py-12 text-center font-bold text-slate-500">No data found.</td>
                </tr>
              ) : (
                paginatedData.map((row, idx) => (
                  <tr key={`${row.erp}-${idx}`} className="hover:bg-slate-50">
                    <td className={`${TD} text-center font-bold`}>{(page - 1) * pageSize + idx + 1}</td>
                    <td className={`${TD} whitespace-nowrap font-bold`}>{row.jobCardNo || "-"}</td>
                    <td className={TD}>{row.itemName}</td>
                    <td className={`${TD} whitespace-nowrap font-bold`}>{row.erp}</td>
                    <td className={TD}>{row.company}</td>
                    <td className={NUM}>{row.length}</td>
                    <td className={NUM}>{row.breadth}</td>
                    <td className={NUM}>{row.height}</td>
                    <td className={NUM}>{row.reelAsPerCalc}</td>
                    <td className={NUM}>{row.reelActual}</td>
                    <td className={NUM}>{row.cutting}</td>
                    <td className={NUM}>{row.l1}</td>
                    <td className={NUM}>{row.f1}</td>
                    <td className={NUM}>{row.l2}</td>
                    <td className={NUM}>{row.f2}</td>
                    <td className={NUM}>{row.l3}</td>
                    <td className={`${NUM} font-black text-emerald-700`}>{row.gsm}</td>
                    <td className={`${NUM} font-bold`}>{row.sheetWeight}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
