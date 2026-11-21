import { Fragment, useMemo, useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { Select } from "../components/Select";
import { SendReportWhatsappButton } from "../components/SendReportWhatsappButton";
import { usePageDataStatus } from "../components/DataLoadingBoundary";
import { exportsAllowed } from "../lib/exportPolicy";
import { formatDate } from "../lib/serial";
import { getFirmOptions } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { buildPhpPlateWorkflowJobs, computePhpPlatePlanRows, groupPhpPlatePlanByShift, phpPlatePlanTotals, type PhpPlatePlanRow, type PhpPlateSource } from "../lib/phpPlatePlan";
import { buildReportPdf, phpPlatePlanPdfSpec } from "../lib/reports/whatsappReports";
import type { Company, Firm, Order, OrderSchedule, Production } from "../types";

const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const qty = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const shortNo = (value: string) => value.match(/(\d{2}-\d{2}\/[^/]+)$/)?.[1] || value || "-";
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const STATUS_CLASS: Record<PhpPlatePlanRow["status"], string> = {
  Pending: "bg-amber-100 text-amber-800",
  "In Progress": "bg-sky-100 text-sky-800",
  Complete: "bg-emerald-100 text-emerald-800",
};

/** PHP / Plate Production Plan for one Plan Date: Shift, then Sequence (like the FG Production Plan). */
export function PhpPlateProductionPlan({ source }: { source: PhpPlateSource }) {
  const label = source === "PHP" ? "PHP" : "Plate";
  const reportKey = source === "PHP" ? "php-production-plan" : "plate-production-plan";
  const [sourceJobs] = useData<Production>(source === "PHP" ? "php_job_master" : "plate_job_master", [], { firmScope: "all", storageKey: source === "PHP" ? "php-job-master-all-firms" : "plate-job-master-all-firms" });
  const [fgProductions] = useData<Production>("productions", [], { firmScope: "all", storageKey: "productions-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const { itemsBySource } = useOrderItemCatalog();
  const { loading } = usePageDataStatus();
  const allowExports = exportsAllowed();

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [firmFilter, setFirmFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [methodologyFilter, setMethodologyFilter] = useState("");
  const [search, setSearch] = useState("");

  const jobs = useMemo(() => buildPhpPlateWorkflowJobs(source, sourceJobs, fgProductions), [fgProductions, source, sourceJobs]);
  const sourceItems = useMemo(() => (itemsBySource as any)[source] || [], [itemsBySource, source]);
  // Every job for the date (dropdown choices), then with the filters (same code as the WhatsApp PDF).
  const dayRows = useMemo(
    () => computePhpPlatePlanRows({ source, date: selectedDate, jobs, schedules, orders, companies, firms, sourceItems }),
    [companies, firms, jobs, orders, schedules, selectedDate, source, sourceItems]
  );
  const filtered = useMemo(() => computePhpPlatePlanRows({
    source, date: selectedDate, jobs, schedules, orders, companies, firms, sourceItems,
    filters: { firm: firmFilter, company: companyFilter, item: itemFilter, shift: shiftFilter, methodology: methodologyFilter },
  }), [companies, companyFilter, firmFilter, firms, itemFilter, jobs, methodologyFilter, orders, schedules, selectedDate, shiftFilter, source, sourceItems]);
  const rows = useMemo(() => {
    const words = searchWords(search);
    if (!words.length) return filtered;
    return filtered.filter((row) => matchesTableSearch([row.jobNo, row.firmName, row.companyName, row.itemName, row.mainErp, row.erp, row.methodology, row.shift, row.status, row.sequence], words));
  }, [filtered, search]);
  const totals = useMemo(() => phpPlatePlanTotals(rows), [rows]);
  const groups = useMemo(() => groupPhpPlatePlanByShift(rows), [rows]);

  const options = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
  const firmOptions = useMemo(() => {
    const ids = new Set(dayRows.map((row) => row.firmId).filter(Boolean));
    return getFirmOptions(firms).filter((option) => ids.has(String(option.value)));
  }, [dayRows, firms]);
  const companyOptions = useMemo(() => options(dayRows.map((row) => row.companyName)), [dayRows]);
  const itemOptions = useMemo(() => options(dayRows.map((row) => row.itemName)), [dayRows]);
  const shiftOptions = useMemo(() => options(dayRows.map((row) => row.shift)), [dayRows]);
  const methodologyOptions = useMemo(() => options(dayRows.map((row) => row.methodology)), [dayRows]);
  const hasFilters = Boolean(firmFilter || companyFilter || itemFilter || shiftFilter || methodologyFilter || search.trim());
  const clearFilters = () => { setFirmFilter(""); setCompanyFilter(""); setItemFilter(""); setShiftFilter(""); setMethodologyFilter(""); setSearch(""); };

  const handlePdf = () => {
    if (!rows.length) return;
    buildReportPdf(phpPlatePlanPdfSpec(reportKey, rows, selectedDate)).save(`${label}_Production_Plan_${selectedDate}.pdf`);
  };
  const handleExcel = async () => {
    if (!rows.length) return;
    const xlsxModule: any = await import("xlsx-js-style");
    const XLSX = xlsxModule.utils ? xlsxModule : xlsxModule.default;
    const spec = phpPlatePlanPdfSpec(reportKey, rows, selectedDate);
    const aoa: (string | number)[][] = [[spec.title], [spec.subtitle], spec.head, ...spec.body, spec.foot || []];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const lastCol = spec.head.length - 1;
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } }];
    ws["!cols"] = spec.head.map((header) => ({ wch: /Company|Item/.test(header) ? 32 : Math.max(8, header.length + 2) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 3 };
    const thin = { style: "thin", color: { rgb: "000000" } };
    const style = (bold: boolean, fill?: string) => ({ font: { name: "Arial", sz: 9, bold }, alignment: { vertical: "center", wrapText: true }, border: { top: thin, bottom: thin, left: thin, right: thin }, ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}) });
    const set = (r: number, c: number, s: any) => { const ref = XLSX.utils.encode_cell({ r, c }); if (!ws[ref]) ws[ref] = { t: "s", v: "" }; ws[ref].s = s; };
    set(0, 0, { font: { name: "Arial", sz: 14, bold: true }, alignment: { horizontal: "center" } });
    set(1, 0, { font: { name: "Arial", sz: 10, bold: true }, alignment: { horizontal: "center" } });
    const groupRows = new Set(spec.groupRows || []);
    for (let c = 0; c <= lastCol; c += 1) set(2, c, style(true, "D9E1F2"));
    spec.body.forEach((_, index) => { for (let c = 0; c <= lastCol; c += 1) set(3 + index, c, style(groupRows.has(index), groupRows.has(index) ? "E2E8F0" : undefined)); });
    for (let c = 0; c <= lastCol; c += 1) set(3 + spec.body.length, c, style(true, "D9E1F2"));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${label} Production Plan`);
    XLSX.writeFile(wb, `${label}_Production_Plan_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-black pb-2">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">{label} Production Plan</h2>
        <div data-header-action="true" className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold uppercase text-black">Plan Date:</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value || todayKey())} className="rounded border-2 border-black p-1 text-sm focus:border-indigo-600 focus:outline-none" />
          </div>
          {allowExports ? (
            <>
              <button type="button" data-export="excel" onClick={() => void handleExcel()} disabled={!rows.length} title="Download Excel" className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Download size={16} /><span>Excel</span></button>
              <button type="button" data-export="pdf" onClick={handlePdf} disabled={!rows.length} title="Download PDF" className="inline-flex items-center gap-2 rounded border border-red-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-red-700 hover:bg-red-50 disabled:opacity-40"><FileText size={16} /><span>PDF</span></button>
            </>
          ) : null}
          <SendReportWhatsappButton
            report={reportKey}
            title={`${label} Production Plan`}
            loading={loading}
            disabled={!rows.length}
            buildRequest={() => ({ date: selectedDate, filters: { firm: firmFilter, company: companyFilter, item: itemFilter, shift: shiftFilter, methodology: methodologyFilter }, label: formatDate(selectedDate) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        {[
          { label: "Jobs", value: String(totals.jobs), tone: "from-indigo-500 to-indigo-700" },
          { label: "Planned Qty", value: qty(totals.planned), tone: "from-emerald-500 to-emerald-700" },
          { label: "Produced", value: qty(totals.produced), tone: "from-sky-500 to-sky-700" },
          { label: "Balance", value: qty(totals.balance), tone: "from-orange-500 to-orange-700" },
        ].map((tile) => (
          <div key={tile.label} className={`rounded-xl border-2 border-black bg-gradient-to-br ${tile.tone} p-3 text-white shadow`}>
            <div className="text-[10px] font-black uppercase tracking-widest">{tile.label}</div>
            <div className="text-xl font-black">{tile.value}</div>
          </div>
        ))}
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-[34px] w-full rounded border-2 border-black pl-9 pr-3 text-sm" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Shift</span><Select compact value={shiftFilter} onChange={setShiftFilter} options={shiftOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Methodology</span><Select compact value={methodologyFilter} onChange={setMethodologyFilter} options={methodologyOptions} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div data-disable-table-pagination="true" className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="min-w-[1100px] w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-white">
            <tr>
              {["Seq", "Shift", "Job No", "Firm", "Company", `${label} Item`, "Main ERP", `${label} ERP`, "Methodology", "Planned", "Produced", "Balance", "Status"].map((header) => (
                <th key={header} className={`border border-black px-3 py-2 ${["Planned", "Produced", "Balance"].includes(header) ? "text-right" : "text-left"}`}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={13} className="px-3 py-10 text-center font-bold text-slate-500">{loading ? "Loading…" : `No ${label} jobs scheduled for ${formatDate(selectedDate)}.`}</td></tr>
            ) : groups.map((group) => {
              const groupTotals = phpPlatePlanTotals(group.rows);
              return (
                <Fragment key={group.shift}>
                  <tr className="bg-slate-200"><td colSpan={13} className="border border-black px-3 py-1.5 text-xs font-black uppercase">{formatDate(selectedDate)} · {group.shift} Shift</td></tr>
                  {group.rows.map((row) => (
                    <tr key={`${row.job.id}-${row.jobNo}`} className="hover:bg-slate-50">
                      <td className="border border-black px-3 py-2 font-black">{row.sequence === null ? <span className="text-xs font-bold text-red-600">No sequence</span> : row.sequence}</td>
                      <td className="border border-black px-3 py-2">{row.shift}</td>
                      <td className="border border-black px-3 py-2 font-bold">{shortNo(row.jobNo)}</td>
                      <td className="border border-black px-3 py-2">{row.firmName}</td>
                      <td className="border border-black px-3 py-2">{row.companyName || "-"}</td>
                      <td className="border border-black px-3 py-2">{row.itemName || "-"}</td>
                      <td className="border border-black px-3 py-2">{row.mainErp || "-"}</td>
                      <td className="border border-black px-3 py-2 font-bold">{row.erp || "-"}</td>
                      <td className="border border-black px-3 py-2">{row.methodology || "-"}</td>
                      <td className="border border-black px-3 py-2 text-right">{qty(row.plannedQty)}</td>
                      <td className="border border-black px-3 py-2 text-right">{qty(row.producedQty)}</td>
                      <td className="border border-black px-3 py-2 text-right font-bold">{qty(row.balanceQty)}</td>
                      <td className="border border-black px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_CLASS[row.status]}`}>{row.status}</span></td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-black">
                    <td colSpan={9} className="border border-black px-3 py-1.5 text-xs uppercase">{group.shift} total · {groupTotals.jobs} jobs</td>
                    <td className="border border-black px-3 py-1.5 text-right">{qty(groupTotals.planned)}</td>
                    <td className="border border-black px-3 py-1.5 text-right">{qty(groupTotals.produced)}</td>
                    <td className="border border-black px-3 py-1.5 text-right">{qty(groupTotals.balance)}</td>
                    <td className="border border-black px-3 py-1.5" />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr className="bg-indigo-100 font-black">
                <td colSpan={9} className="border border-black px-3 py-2 uppercase">Total · {totals.jobs} jobs</td>
                <td className="border border-black px-3 py-2 text-right">{qty(totals.planned)}</td>
                <td className="border border-black px-3 py-2 text-right">{qty(totals.produced)}</td>
                <td className="border border-black px-3 py-2 text-right">{qty(totals.balance)}</td>
                <td className="border border-black px-3 py-2" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export function PhpProductionPlan() {
  return <PhpPlateProductionPlan source="PHP" />;
}

export function PlateProductionPlan() {
  return <PhpPlateProductionPlan source="PLATE" />;
}
