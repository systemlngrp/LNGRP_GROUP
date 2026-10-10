import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import type { QualityComplaint, User } from "../types";

type CapaData = NonNullable<QualityComplaint["capaData"]>;

const s = (value: unknown) => String(value ?? "");
const field = "w-full rounded border-2 border-black bg-white px-3 py-2.5 text-sm text-black shadow-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100";
const textArea = `${field} min-h-28 resize-y`;
const card = "rounded border-2 border-black bg-white p-4 shadow-sm md:p-5";
const empty: CapaData = { defectDescription: "", defectPercentage: "", rejectionDetails: "", previousActionPlanStatus: "", productionFailureRootCause: "", detectionFailureRootCause: "", productionPreventiveAction: "", detectionPreventiveAction: "", targetDate: "", preparedBy: "", immediateContainment: "", rootCauseAnalysis: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", targetCompletionDate: "", completionDate: "", effectivenessVerification: "", verificationRemarks: "", preparedDate: "", reviewedBy: "", reviewedDate: "", approvedBy: "", approvedDate: "" };

const resolveUserName = (users: User[], value?: string, userId?: string) => users.find((user) => user.id === userId || user.userId === userId || user.id === value || user.userId === value || user.name === value)?.name || value || "";
const toFormData = (stored: CapaData | undefined, users: User[]): CapaData => {
  const value = stored || {};
  return {
    ...empty,
    ...value,
    defectDescription: value.defectDescription || "",
    defectPercentage: value.defectPercentage || "",
    rejectionDetails: value.rejectionDetails || value.immediateContainment || "",
    previousActionPlanStatus: value.previousActionPlanStatus || "",
    productionFailureRootCause: value.productionFailureRootCause || value.rootCauseAnalysis || "",
    detectionFailureRootCause: value.detectionFailureRootCause || "",
    productionPreventiveAction: value.productionPreventiveAction || value.preventiveAction || "",
    detectionPreventiveAction: value.detectionPreventiveAction || "",
    targetDate: value.targetDate || value.targetCompletionDate || "",
    preparedBy: resolveUserName(users, value.preparedBy, value.preparedByUserId),
    responsiblePerson: resolveUserName(users, value.responsiblePerson, value.responsiblePersonUserId) || resolveUserName(users, value.preparedBy, value.preparedByUserId),
  };
};

const isPhotoLink = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) || /^[^/\s]+\.(?:jpe?g|png|gif|webp|bmp)$/i.test(s(value));
const photoHref = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) ? s(value) : `/uploads/${encodeURIComponent(s(value))}`;
const escapeHtml = (value: unknown) => s(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
const waitForPrintImages = async (win: Window) => {
  await Promise.all(Array.from(win.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  })));
};

const Field = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => (
  <label className="block space-y-2">
    <span className="text-sm font-bold text-black">{label}{required && <span className="text-red-600"> *</span>}</span>
    {children}
  </label>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3">
    <div className="border-b-2 border-black pb-2 text-sm font-bold uppercase tracking-wide text-indigo-900">{title}</div>
    {children}
  </section>
);

export function QualityComplaintCapa() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [complaints, , loading, api] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all" });
  const [users] = useData<User>("users", []);
  const complaint = complaints.find((record) => record.id === id);
  const [data, setData] = useState<CapaData>(empty);
  const [message, setMessage] = useState("");

  const userOptions = useMemo(() => users
    .filter((user) => user.status !== "Inactive" && user.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((user) => ({ value: user.name, label: user.name, searchText: `${user.name} ${user.userId} ${user.email || ""}` })), [users]);

  useEffect(() => {
    if (complaint) setData(toFormData(complaint.capaData, users));
  }, [complaint?.id, complaint?.capaUpdatedAt, users]);

  if (loading) return <div className="p-6">Loading CAPA...</div>;
  if (!complaint) return <div className="rounded border border-red-700 bg-red-50 p-6 font-bold">Complaint not found.</div>;

  const update = (key: keyof CapaData, value: string) => {
    setData((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const requiredValues = [
    complaint.lotNo,
    data.defectDescription,
    data.defectPercentage,
    data.rejectionDetails,
    data.previousActionPlanStatus,
    data.productionFailureRootCause,
    data.detectionFailureRootCause,
    data.correctiveAction,
    data.productionPreventiveAction,
    data.detectionPreventiveAction,
    data.responsiblePerson,
    data.preparedBy,
  ];
  const completedRequired = requiredValues.filter((value) => s(value).trim()).length;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (requiredValues.some((value) => !s(value).trim())) {
      setMessage("Please complete all required CAPA fields.");
      return;
    }
    const preparedUser = users.find((user) => user.name === data.preparedBy);
    const responsibleUser = users.find((user) => user.name === data.responsiblePerson);
    const now = new Date().toISOString();
    const capaData: CapaData = {
      ...data,
      immediateContainment: data.rejectionDetails,
      rootCauseAnalysis: data.productionFailureRootCause,
      correctiveAction: data.correctiveAction,
      preventiveAction: data.productionPreventiveAction,
      responsiblePerson: data.responsiblePerson,
      responsiblePersonUserId: responsibleUser?.id || data.responsiblePersonUserId,
      targetCompletionDate: data.targetDate,
      preparedBy: data.preparedBy,
      preparedByUserId: preparedUser?.id || data.preparedByUserId,
    };
    const updated = {
      ...complaint,
      capaNo: complaint.capaNo || `CAPA-${new Date().getFullYear()}-${String(complaints.filter((record) => record.capaNo).length + 1).padStart(4, "0")}`,
      capaStatus: complaint.capaStatus || "Generated",
      capaGeneratedAt: complaint.capaGeneratedAt || now,
      capaData,
      capaUpdatedAt: now,
      updatedBy: "System User",
      updateTimestamp: now,
    };
    await api.saveItem(updated);
    setMessage("CAPA saved successfully.");
  };

  const print = () => {
    const rows: Array<[string, unknown]> = [
      ["CAPA No.", complaint.capaNo || "Pending"], ["Complaint Date", complaint.dateOfComplaint], ["Firm", complaint.firmName], ["Party Name", complaint.partyName], ["Item Name", complaint.itemName], ["ERP Code", complaint.erpCode], ["Nature", complaint.natureOfComplaint], ["LOT NO.", complaint.lotNo], ["Quantity", complaint.quantity], ["Issue Details", complaint.issueDetails],
      ["Type of Defect (SHORT DESCRIPTION)", data.defectDescription], ["% of Defects", data.defectPercentage], ["Details of Rejection", data.rejectionDetails], ["Status of Last Action Plan", data.previousActionPlanStatus], ["Root Cause - Production Failure", data.productionFailureRootCause], ["Root Cause - Detection Failure", data.detectionFailureRootCause], ["Corrective Action", data.correctiveAction], ["Preventive Action - Production Failures", data.productionPreventiveAction], ["Preventive Action - Detection Failures", data.detectionPreventiveAction], ["Target Date", data.targetDate], ["Responsible Person", data.responsiblePerson], ["Prepared By", data.preparedBy], ["Completion Date", data.completionDate], ["Reviewed By / Date", `${data.reviewedBy} / ${data.reviewedDate}`], ["Approved By / Date", `${data.approvedBy} / ${data.approvedDate}`],
    ];
    const photos = [complaint.photo1, complaint.photo2].filter(Boolean).map((photo, index) => isPhotoLink(photo) ? `<figure><figcaption>Photo ${index + 1}</figcaption><img src="${escapeHtml(photoHref(photo))}" alt="Photo ${index + 1}" /></figure>` : "").join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>CAPA ${escapeHtml(complaint.capaNo || "Report")}</title><style>body{font-family:Arial;padding:32px}h1{text-align:center;background:#123b59;color:#fff;padding:16px}table{width:100%;border-collapse:collapse}td{border:1px solid #222;padding:9px;vertical-align:top;white-space:pre-wrap}td:first-child{font-weight:bold;width:34%;background:#eef3f7}figure{display:inline-block;vertical-align:top;width:46%;margin:10px 2% 10px 0}figcaption{font-weight:bold;margin-bottom:6px}figure img{display:block;max-width:100%;max-height:320px;object-fit:contain;border:1px solid #ccc}@media print{figure{break-inside:avoid}}</style></head><body><h1>GENERATE CAPA REPORT</h1><table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>${photos ? `<h3>Photos</h3>${photos}` : ""}</body></html>`);
    win.document.close();
    void waitForPrintImages(win).then(() => { win.focus(); win.print(); });
  };

  const clearForm = () => {
    setData(empty);
    setMessage("");
  };

  return <div className="min-h-screen bg-slate-100 px-3 py-5 text-black md:px-6">
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="rounded border-2 border-black bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Quality Control</p>
            <h2 className="mt-1 text-2xl font-bold uppercase tracking-tight">Generate CAPA</h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">ERP: {complaint.erpCode || "-"} <span className="px-1 text-slate-400">•</span> LOT: {complaint.lotNo || "-"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded border-2 border-indigo-700 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase text-indigo-800">{complaint.capaStatus || "Pending"}</span>
            <button type="button" onClick={print} className="inline-flex items-center gap-2 rounded border-2 border-indigo-700 bg-indigo-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-800"><Printer size={16} />Print CAPA</button>
            <button type="button" onClick={() => navigate("/quality/complaints/master")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold transition hover:bg-slate-100"><ArrowLeft size={16} />Back</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 pt-3 text-xs font-bold text-slate-600">
          <span>Fields marked <span className="text-red-600">*</span> are required.</span>
          <span className="text-indigo-800">Required fields completed: {completedRequired}/{requiredValues.length}</span>
        </div>
      </header>

      {message && <div role="alert" className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-900">{message}</div>}

      <form onSubmit={save} className="space-y-6">
        <Section title="Complaint and defect details">
          <div className="space-y-3">
            <div className={card}><Field label="LOT NO." required><input className={`${field} bg-slate-200 text-slate-700`} value={complaint.lotNo} readOnly /></Field></div>
            <div className={card}><Field label="Type of Defect (SHORT DESCRIPTION)" required><input className={field} value={s(data.defectDescription)} onChange={(event) => update("defectDescription", event.target.value)} /></Field></div>
            <div className={card}><Field label="% of Defects" required><input className={field} inputMode="decimal" value={s(data.defectPercentage)} onChange={(event) => update("defectPercentage", event.target.value)} /></Field></div>
            <div className={card}><Field label="Details of Rejection" required><textarea className={textArea} value={s(data.rejectionDetails)} onChange={(event) => update("rejectionDetails", event.target.value)} /></Field></div>
            <div className={card}><Field label="Status of Last Action plan for the same complaint (if the complaint is first time, please neglect this row):" required><div className="space-y-3 pt-1">{[["First time", "First time"], ["Previous Complaint Action plan was already implemented.", "Previous Complaint Action plan was already implemented."], ["Previous Complaint Action plan not yet implemented.", "Previous Complaint Action plan not yet implemented."]].map(([label, value]) => <label key={value} className="flex items-start gap-3 rounded border border-slate-300 px-3 py-2.5 text-sm font-semibold transition hover:bg-indigo-50"><input type="radio" name="previousActionPlanStatus" value={value} checked={data.previousActionPlanStatus === value} onChange={(event) => update("previousActionPlanStatus", event.target.value)} className="mt-0.5 h-5 w-5 accent-indigo-700" /><span>{label}</span></label>)}</div></Field></div>
          </div>
        </Section>

        <Section title="Root cause and corrective / preventive actions">
          <div className="space-y-3">
            <div className={card}><Field label="Root cause analysis for Production Failure (What went wrong in production, to eliminate in process stage):" required><textarea className={textArea} value={s(data.productionFailureRootCause)} onChange={(event) => update("productionFailureRootCause", event.target.value)} /></Field></div>
            <div className={card}><Field label="Root cause analysis for Detection Failure (What went wrong in detection, to eliminate at process stage):" required><textarea className={textArea} value={s(data.detectionFailureRootCause)} onChange={(event) => update("detectionFailureRootCause", event.target.value)} /></Field></div>
            <div className={card}><Field label="CORRECTIVE ACTION: (What did you do with the Rejected boxes)" required><textarea className={textArea} value={s(data.correctiveAction)} onChange={(event) => update("correctiveAction", event.target.value)} /></Field></div>
            <div className={card}><Field label="Preventive action for Production Failures (Action Plan)" required><textarea className={textArea} value={s(data.productionPreventiveAction)} onChange={(event) => update("productionPreventiveAction", event.target.value)} /></Field></div>
            <div className={card}><Field label="Preventive action for Detection Failures (Action Plan)" required><textarea className={textArea} value={s(data.detectionPreventiveAction)} onChange={(event) => update("detectionPreventiveAction", event.target.value)} /></Field></div>
          </div>
        </Section>

        <Section title="Ownership and target date">
          <div className="space-y-3">
            <div className={card}><Field label="Target Date"><input type="date" className={field} value={s(data.targetDate)} onChange={(event) => update("targetDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="Responsible Person" required><Select value={s(data.responsiblePerson)} onChange={(value) => update("responsiblePerson", value)} options={userOptions} placeholder="Select responsible person..." /></Field></div>
            <div className={card}><Field label="Prepared By" required><Select value={s(data.preparedBy)} onChange={(value) => update("preparedBy", value)} options={userOptions} placeholder="Select prepared by..." /></Field></div>
          </div>
        </Section>

        <footer className="flex flex-col-reverse items-stretch justify-between gap-3 rounded border-2 border-black bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <button type="button" onClick={clearForm} className="rounded border-2 border-black bg-white px-5 py-2.5 text-sm font-bold transition hover:bg-slate-100">Clear form</button>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded border-2 border-indigo-800 bg-indigo-700 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800"><Save size={17} />Submit CAPA</button>
        </footer>
      </form>
    </div>
  </div>;
}
