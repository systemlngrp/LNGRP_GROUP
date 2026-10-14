import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { printQualityCapaReport } from "../utils/qualityCapaPrint";
import type { CapaQuestion, QualityComplaint, User, Setting } from "../types";
import { isRejectionComplaint } from "../lib/complaintResponsibility";
import { useCapaReportContext } from "../hooks/useCapaReportContext";

type CapaData = NonNullable<QualityComplaint["capaData"]>;

const s = (value: unknown) => String(value ?? "");
const field = "w-full rounded border-2 border-black bg-white px-3 py-2.5 text-sm text-black shadow-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100";
const textArea = `${field} min-h-28 resize-y`;
const card = "rounded border-2 border-black bg-white p-4 shadow-sm md:p-5";
const empty: CapaData = { defectDescription: "", defectPercentage: "", rejectionDetails: "", previousActionPlanStatus: "", productionFailureRootCause: "", detectionFailureRootCause: "", productionPreventiveAction: "", detectionPreventiveAction: "", targetDate: "", preparedBy: "", immediateContainment: "", rootCauseAnalysis: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", targetCompletionDate: "", completionDate: "", effectivenessVerification: "", verificationRemarks: "", preparedDate: "", reviewedBy: "", reviewedDate: "", approvedBy: "", approvedDate: "", deliveryNo: "", vehicleNo: "", invoiceDate: "", productionDate: "", dispatchDate: "", productionTargetDate: "", detectionTargetDate: "", hodProduction: "" };

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
    productionTargetDate: value.productionTargetDate || value.targetDate || value.targetCompletionDate || "",
    preparedBy: resolveUserName(users, value.preparedBy, value.preparedByUserId),
    responsiblePerson: resolveUserName(users, value.responsiblePerson, value.responsiblePersonUserId) || resolveUserName(users, value.preparedBy, value.preparedByUserId),
  };
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
  const { setting, linkedDetails } = useCapaReportContext();
  const [, , , settingsApi] = useData<Setting>("settings", []);
  const defaultQuestions = useMemo<CapaQuestion[]>(() => [
    { id: "defectDescription", label: "Type of Defect (SHORT DESCRIPTION)", required: true },
    { id: "defectPercentage", label: "% of Defects", required: true },
    { id: "rejectionDetails", label: "Details of Rejection", required: true },
    { id: "productionFailureRootCause", label: "Root cause analysis for Production Failure", required: true },
    { id: "detectionFailureRootCause", label: "Root cause analysis for Detection Failure", required: true },
    { id: "correctiveAction", label: "CORRECTIVE ACTION", required: true },
    { id: "productionPreventiveAction", label: "Preventive action for Production Failures", required: true },
    { id: "detectionPreventiveAction", label: "Preventive action for Detection Failures", required: true },
  ], []);
  const [questions, setQuestions] = useState<CapaQuestion[]>(defaultQuestions);
  const [editingQuestions, setEditingQuestions] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const complaint = complaints.find((record) => record.id === id);
  const [data, setData] = useState<CapaData>(empty);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const touchedReportFields = useRef(new Set<keyof CapaData>());
  const loadedRevision = useRef("");
  const suggested = complaint ? linkedDetails(complaint) : undefined;
  const suggestionKey = suggested ? JSON.stringify(suggested) : "";

  const userOptions = useMemo(() => users
    .filter((user) => user.status !== "Inactive" && user.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((user) => ({ value: user.name, label: user.name, searchText: `${user.name} ${user.userId} ${user.email || ""}` })), [users]);

  useEffect(() => {
    if (!complaint) return;
    const revision = `${complaint.id}:${complaint.capaUpdatedAt || ""}`;
    if (loadedRevision.current === revision) return;
    loadedRevision.current = revision;
    touchedReportFields.current.clear();
    setData(toFormData(complaint.capaData, users));
    setCustomAnswers(complaint.capaData?.customAnswers || {});
  }, [complaint?.id, complaint?.capaUpdatedAt, users]);
  useEffect(() => {
    const stored = complaint?.capaData?.questionTemplate;
    if (stored?.length) setQuestions(stored.filter((q) => !q.removed));
    else if (setting?.capaQuestionTemplate) {
      try { const parsed = JSON.parse(setting.capaQuestionTemplate); if (Array.isArray(parsed) && parsed.length) setQuestions(parsed); } catch { /* legacy setting */ }
    } else setQuestions(defaultQuestions);
  }, [complaint?.id, complaint?.capaUpdatedAt, setting?.capaQuestionTemplate, defaultQuestions]);
  useEffect(() => {
    if (!suggested) return;
    setData((current) => {
      const next = { ...current };
      for (const field of ["deliveryNo", "vehicleNo", "invoiceDate", "productionDate", "dispatchDate"] as const) {
        if (!touchedReportFields.current.has(field) && !next[field]) next[field] = suggested[field];
      }
      return next;
    });
  }, [complaint?.id, suggestionKey]);

  if (loading) return <div className="p-6">Loading CAPA...</div>;
  if (!complaint) return <div className="rounded border border-red-700 bg-red-50 p-6 font-bold">Complaint not found.</div>;
  if (!isRejectionComplaint(complaint.natureOfComplaint) && !complaint.capaNo) {
    return <div className="rounded border border-amber-700 bg-amber-50 p-6 font-bold">CAPA can only be generated for Rejection complaints.</div>;
  }

  const update = (key: keyof CapaData, value: string) => {
    touchedReportFields.current.add(key);
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
    ...questions.filter((q) => q.required && q.id.startsWith("custom_")).map((q) => customAnswers[q.id]),
  ];
  const completedRequired = requiredValues.filter((value) => s(value).trim()).length;

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!isRejectionComplaint(complaint.natureOfComplaint)) {
      setMessage("CAPA can only be generated for Rejection complaints.");
      return;
    }
    if (requiredValues.some((value) => !s(value).trim())) {
      setMessage("Please complete all required CAPA fields.");
      return;
    }
    const preparedUser = users.find((user) => user.name === data.preparedBy);
    const responsibleUser = users.find((user) => user.name === data.responsiblePerson);
    const now = new Date().toISOString();
    const capaData: CapaData = {
      ...data,
      questionTemplate: questions,
      customAnswers,
      immediateContainment: data.rejectionDetails,
      rootCauseAnalysis: data.productionFailureRootCause,
      correctiveAction: data.correctiveAction,
      preventiveAction: data.productionPreventiveAction,
      responsiblePerson: data.responsiblePerson,
      responsiblePersonUserId: responsibleUser?.id || data.responsiblePersonUserId,
      targetCompletionDate: data.productionTargetDate || data.targetDate,
      targetDate: data.productionTargetDate || data.targetDate,
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

  const saveTemplate = async () => {
    if (questions.some((q) => !q.label.trim())) { setTemplateMessage("Every question must have a heading."); return; }
    const current = (setting || { id: "settings" }) as Setting;
    await settingsApi.saveItem({ ...current, capaQuestionTemplate: JSON.stringify(questions), updateTimestamp: new Date().toISOString(), updatedBy: "System User" });
    setTemplateMessage("Question template saved for future CAPAs.");
    setEditingQuestions(false);
  };

  const print = () => { void printQualityCapaReport(complaint, data, { setting, linkedDetails: suggested }).then((opened) => { if (!opened) setMessage("Printing was blocked by the browser. Please allow pop-ups and try again."); }); };

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
        <div className="mt-4 border-t border-slate-300 pt-3">
          <button type="button" onClick={() => setEditingQuestions((v) => !v)} className="rounded border-2 border-indigo-700 px-3 py-2 text-sm font-bold text-indigo-800">{editingQuestions ? "Close question editor" : "Edit questions"}</button>
          {templateMessage && <span className="ml-3 text-sm font-bold text-indigo-800">{templateMessage}</span>}
          {editingQuestions && <div className="mt-3 space-y-2 rounded border border-indigo-300 bg-indigo-50 p-3">{questions.map((q, index) => <div key={q.id} className="flex gap-2"><input className={`${field} flex-1`} value={q.label} onChange={(e) => setQuestions((all) => all.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} /><label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={Boolean(q.required)} onChange={(e) => setQuestions((all) => all.map((item, i) => i === index ? { ...item, required: e.target.checked } : item))} />Required</label><button type="button" onClick={() => setQuestions((all) => all.filter((_, i) => i !== index))} className="rounded border border-red-700 px-2 text-xs font-bold text-red-700">Remove</button></div>)}<div className="flex gap-2"><button type="button" onClick={() => setQuestions((all) => [...all, { id: `custom_${Date.now()}`, label: "New question", type: "text" }])} className="rounded border border-black bg-white px-3 py-2 text-sm font-bold">Add question</button><button type="button" onClick={() => void saveTemplate()} className="rounded bg-indigo-700 px-3 py-2 text-sm font-bold text-white">Save template</button></div></div>}
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
            <div className={card}><Field label="Production / Transit Target Date"><input type="date" className={field} value={s(data.productionTargetDate)} onChange={(event) => update("productionTargetDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="Detection Target Date"><input type="date" className={field} value={s(data.detectionTargetDate)} onChange={(event) => update("detectionTargetDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="Responsible Person" required><Select value={s(data.responsiblePerson)} onChange={(value) => update("responsiblePerson", value)} options={userOptions} placeholder="Select responsible person..." /></Field></div>
            <div className={card}><Field label="Prepared By" required><Select value={s(data.preparedBy)} onChange={(value) => update("preparedBy", value)} options={userOptions} placeholder="Select prepared by..." /></Field></div>
          </div>
        </Section>

        {questions.filter((q) => q.id.startsWith("custom_")).length > 0 && <Section title="Additional questions"><div className="space-y-3">{questions.filter((q) => q.id.startsWith("custom_")).map((q) => <div className={card} key={q.id}><Field label={q.label} required={q.required}><textarea className={textArea} value={customAnswers[q.id] || ""} onChange={(e) => setCustomAnswers((all) => ({ ...all, [q.id]: e.target.value }))} /></Field></div>)}</div></Section>}

        <Section title="Print report details and sign-off">
          <div className="grid gap-3 md:grid-cols-2">
            <div className={card}><Field label="Delivery / Invoice No."><input className={field} value={s(data.deliveryNo)} onChange={(event) => update("deliveryNo", event.target.value)} /></Field></div>
            <div className={card}><Field label="Vehicle No."><input className={field} value={s(data.vehicleNo)} onChange={(event) => update("vehicleNo", event.target.value)} /></Field></div>
            <div className={card}><Field label="Invoice Date"><input type="date" className={field} value={s(data.invoiceDate).slice(0, 10)} onChange={(event) => update("invoiceDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="Production Date"><input type="date" className={field} value={s(data.productionDate).slice(0, 10)} onChange={(event) => update("productionDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="Dispatch Date"><input type="date" className={field} value={s(data.dispatchDate).slice(0, 10)} onChange={(event) => update("dispatchDate", event.target.value)} /></Field></div>
            <div className={card}><Field label="HOD Quality"><Select value={s(data.reviewedBy)} onChange={(value) => update("reviewedBy", value)} options={userOptions} placeholder="Select HOD Quality..." /></Field></div>
            <div className={card}><Field label="HOD Production"><Select value={s(data.hodProduction)} onChange={(value) => update("hodProduction", value)} options={userOptions} placeholder="Select HOD Production..." /></Field></div>
            <div className={card}><Field label="Approved by - Plant Head"><Select value={s(data.approvedBy)} onChange={(value) => update("approvedBy", value)} options={userOptions} placeholder="Select approver..." /></Field></div>
            <div className={`${card} md:col-span-2`}><Field label="Verification for Effectiveness"><textarea className={textArea} value={s(data.effectivenessVerification)} onChange={(event) => update("effectivenessVerification", event.target.value)} /></Field></div>
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
