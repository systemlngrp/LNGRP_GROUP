import { Eye, FileText, LockKeyhole, Pencil, RotateCcw, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { printCoaRecord } from "../lib/coaPrint";
import type { CoaRecord, Firm } from "../types";

const text = (value: unknown) => String(value ?? "").trim();

function displayDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function CoaMaster() {
  const navigate = useNavigate();
  const { user, activeFirm } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [records, , loading, api] = useData<CoaRecord>("coa-records", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [message, setMessage] = useState("");

  const companies = useMemo(() => Array.from(new Set(records.map((record) => text(record.companyName)).filter(Boolean))).sort(), [records]);
  const versions = useMemo(() => Array.from(new Set(records.map((record) => String(record.templateVersion || "")).filter(Boolean))).sort((a, b) => Number(b) - Number(a)), [records]);
  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (company && record.companyName !== company) return false;
      if (status && record.status !== status) return false;
      if (templateVersion && String(record.templateVersion) !== templateVersion) return false;
      if (!query) return true;
      return [record.coaNo, record.jobNo, record.companyName, record.erpCode, record.itemName, record.invoiceNo, record.batchNo].some((value) => text(value).toLowerCase().includes(query));
    });
  }, [company, records, search, status, templateVersion]);

  const issuer = (record: CoaRecord) => {
    const firm = firms.find((value) => value.id === record.firmId);
    return { name: record.firmName || firm?.firmName || activeFirm?.firmName || "", logo: firm?.logo || activeFirm?.logo || "" };
  };

  const changeStatus = async (record: CoaRecord, action: "finalize" | "reopen") => {
    setMessage("");
    const token = window.localStorage.getItem("authToken") || "";
    const response = await fetch(`/api/coa-records/${record.id}/${action}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || `Unable to ${action} COA.`);
    await api.refresh({ force: true });
    setMessage(`COA ${action === "finalize" ? "finalized" : "reopened"}.`);
  };

  return <div className="space-y-4 text-black">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
      <div><h2 className="text-xl font-black uppercase">COA Master</h2><p className="text-sm font-semibold text-slate-600">Company-wise certificates and historical template versions</p></div>
      <button type="button" onClick={() => navigate("/quality/coa/form")} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 font-bold text-white"><FileText size={16} /> Create COA</button>
    </div>
    {message && <div className="rounded border-2 border-amber-700 bg-amber-50 p-3 font-bold">{message}</div>}
    <section className="grid gap-3 rounded border-2 border-black bg-white p-3 md:grid-cols-2 xl:grid-cols-5">
      <input className="rounded border-2 border-black px-3 py-2 text-sm" placeholder="Search COA, job, ERP, item..." value={search} onChange={(event) => setSearch(event.target.value)} />
      <Select value={company} onChange={setCompany} options={companies.map((value) => ({ value, label: value }))} placeholder="All Companies" />
      <Select value={status} onChange={setStatus} options={[{ value: "Draft", label: "Draft" }, { value: "Final", label: "Final" }]} placeholder="All Statuses" />
      <Select value={templateVersion} onChange={setTemplateVersion} options={versions.map((value) => ({ value, label: `Template v${value}` }))} placeholder="All Template Versions" />
      <button type="button" onClick={() => { setSearch(""); setCompany(""); setStatus(""); setTemplateVersion(""); }} className="rounded border-2 border-black bg-white px-3 py-2 font-bold">Clear Filters</button>
    </section>
    <div className="overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[1250px] w-full border-collapse text-sm">
        <thead><tr className="bg-slate-800 text-white"><th className="border border-black p-2">COA No.</th><th className="border border-black p-2">Company</th><th className="border border-black p-2">Job No.</th><th className="border border-black p-2">ERP</th><th className="border border-black p-2">Item</th><th className="border border-black p-2">COA Date</th><th className="border border-black p-2">Template</th><th className="border border-black p-2">Status</th><th className="border border-black p-2">Updated By</th><th className="border border-black p-2">Actions</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={10} className="p-6 text-center font-bold">Loading COAs...</td></tr>}
          {!loading && visibleRecords.length === 0 && <tr><td colSpan={10} className="p-6 text-center font-bold">No COA records found.</td></tr>}
          {visibleRecords.map((record) => {
            const editable = record.status === "Draft" || canManage;
            return <tr key={record.id} className="align-middle">
              <td className="border border-black p-2 font-bold">{record.coaNo}</td>
              <td className="border border-black p-2">{record.companyName || "-"}</td>
              <td className="border border-black p-2">{record.jobNo || "-"}</td>
              <td className="border border-black p-2">{record.erpCode || "-"}</td>
              <td className="border border-black p-2">{record.itemName || "-"}</td>
              <td className="border border-black p-2">{displayDate(record.coaDate)}</td>
              <td className="border border-black p-2">v{record.templateVersion}</td>
              <td className="border border-black p-2"><span className={`rounded px-2 py-1 font-bold ${record.status === "Final" ? "bg-green-200 text-green-900" : "bg-amber-200 text-amber-900"}`}>{record.status}</span></td>
              <td className="border border-black p-2">{record.updatedBy || record.createdBy || "-"}</td>
              <td className="border border-black p-2"><div className="flex flex-wrap justify-center gap-2">
                <button type="button" title="Preview / print" onClick={() => printCoaRecord(record, issuer(record))} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 font-bold text-white"><Eye size={14} /> Print</button>
                {editable ? <button type="button" title="Edit COA" onClick={() => navigate(`/quality/coa/form/${record.id}`)} className="inline-flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 font-bold text-white"><Pencil size={14} /> Edit</button> : <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 font-bold text-slate-700"><LockKeyhole size={14} /> Read only</span>}
                {canManage && record.status === "Draft" && <button type="button" onClick={() => void changeStatus(record, "finalize")} className="inline-flex items-center gap-1 rounded bg-green-700 px-2 py-1 font-bold text-white"><CheckCircle2 size={14} /> Finalize</button>}
                {canManage && record.status === "Final" && <button type="button" onClick={() => void changeStatus(record, "reopen")} className="inline-flex items-center gap-1 rounded bg-orange-700 px-2 py-1 font-bold text-white"><RotateCcw size={14} /> Reopen</button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
