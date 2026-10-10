import { FormEvent, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import type { Firm, Production, QualityComplaint, User } from "../types";
import { qcPersonOptions } from "../utils/qcPeople";

type FormState = {
  firmId: string;
  partyName: string;
  itemName: string;
  erpCode: string;
  dateOfComplaint: string;
  natureOfComplaint: string;
  lotNo: string;
  issueDetails: string;
  photo1: string;
  photo2: string;
  areaOfIssue: string;
  concernedPersonName: string;
  quantity: string;
};

const dateToday = () => new Date().toISOString().slice(0, 10);
const blank = (): FormState => ({ firmId: "", partyName: "", itemName: "", erpCode: "", dateOfComplaint: dateToday(), natureOfComplaint: "Complaint", lotNo: "", issueDetails: "", photo1: "", photo2: "", areaOfIssue: "", concernedPersonName: "", quantity: "" });
const field = "w-full rounded border-2 border-black bg-white px-3 py-2";
const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const dateValue = (value: unknown) => new Date(String(value || "")).getTime() || 0;

function matchesErp(production: Production, erp: string) {
  const row = production as any;
  return key(row.erpCode || row.itemErp || row.masterErp) === key(erp);
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read the selected photo."));
    reader.readAsDataURL(file);
  });
}

export function QualityComplaintFormUpdated() {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [people] = useData<User>("users", []);
  const items = useNpdItems();
  const [, , , api] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all" });
  const [form, setForm] = useState<FormState>(blank);
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<"photo1" | "photo2", boolean>>({ photo1: false, photo2: false });

  const firmOptions = useMemo(() => firms.map((firm) => ({ value: firm.id, label: firm.firmName })), [firms]);
  const erpOptions = useMemo(() => [...new Set(items.map((item: any) => String(item.erp || "").trim()).filter(Boolean))].map((value) => ({ value, label: value, searchText: `${value} ${items.find((item: any) => String(item.erp || "").trim() === value)?.name || ""}` })), [items]);
  const jobOptions = useMemo(() => [...new Set(productions.map((production) => String(production.transactionNo || production.jobCardNo || "").trim()).filter(Boolean))].sort().map((value) => ({ value, label: value })), [productions]);
  const personOptions = qcPersonOptions(people);
  const selectedFirm = firms.find((firm) => firm.id === form.firmId);
  const locked = Boolean(form.erpCode);

  const latestErpProduction = (erp: string) => productions.filter((production) => matchesErp(production, erp)).sort((a, b) => dateValue(b.date) - dateValue(a.date) || dateValue(b.updateTimestamp) - dateValue(a.updateTimestamp))[0];
  const setFormValue = <K extends keyof FormState>(name: K, value: FormState[K]) => { setForm((current) => ({ ...current, [name]: value })); setMessage(""); };

  const applyProduction = (production: Production | undefined, current: FormState, erp: string) => {
    const item = items.find((candidate: any) => key(candidate.erp) === key(erp) || key(candidate.id) === key((production as any)?.itemId || (production as any)?.npdId));
    const next = {
      ...current,
      erpCode: erp,
      partyName: String((production as any)?.companyName || "").trim(),
      itemName: String((production as any)?.itemName || (item as any)?.name || "").trim(),
      firmId: String((production as any)?.firmId || current.firmId || ""),
      lotNo: String((production as any)?.transactionNo || (production as any)?.jobCardNo || current.lotNo || ""),
      quantity: String((production as any)?.plannedQty || (production as any)?.planQty || (production as any)?.qty || current.quantity || ""),
    };
    return next;
  };

  const chooseErp = (erp: string) => {
    const production = latestErpProduction(erp);
    setForm((current) => applyProduction(production, current, erp));
    setHint(production ? `Latest matching Job No.: ${production.transactionNo || production.jobCardNo}` : "No matching production found for this ERP Code.");
    setMessage("");
  };

  const chooseJob = (jobNo: string) => {
    const production = productions.find((row) => String(row.transactionNo || row.jobCardNo || "").trim() === jobNo);
    if (!production) return setFormValue("lotNo", jobNo);
    const erp = String((production as any).erpCode || (production as any).itemErp || (production as any).masterErp || form.erpCode);
    setForm((current) => applyProduction(production, current, erp));
    setHint(`Job details loaded successfully.`);
  };

  const uploadPhoto = async (name: "photo1" | "photo2", file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setMessage("Photo must be 10 MB or smaller.");
    setUploading((current) => ({ ...current, [name]: true }));
    setMessage("");
    try {
      const response = await fetch("/api/upload-artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, base64: await fileDataUrl(file) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Photo upload failed.");
      setFormValue(name, result.filename || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading((current) => ({ ...current, [name]: false }));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (uploading.photo1 || uploading.photo2) return setMessage("Please wait for photo uploads to finish.");
    const required = [form.firmId, form.dateOfComplaint, form.partyName, form.itemName, form.erpCode, form.natureOfComplaint, form.issueDetails, form.lotNo, form.quantity];
    if (required.some((value) => !String(value).trim())) return setMessage("Please complete all required fields.");
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setMessage("Quantity must be greater than zero.");
    const now = new Date().toISOString();
    const record: QualityComplaint = { id: `QC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: now, dateOfComplaint: form.dateOfComplaint, firmId: form.firmId, firmName: selectedFirm?.firmName || "", partyName: form.partyName.trim(), itemName: form.itemName.trim(), erpCode: form.erpCode.trim(), natureOfComplaint: form.natureOfComplaint, lotNo: form.lotNo.trim(), issueDetails: form.issueDetails.trim(), photo1: form.photo1, photo2: form.photo2, areaOfIssue: form.areaOfIssue, concernedPersonName: form.concernedPersonName.trim(), quantity, updatedBy: "System User", updateTimestamp: now };
    setSaving(true);
    try {
      await api.addItem(record);
      setForm(blank());
      setHint("");
      setMessage("QC complaint saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save complaint.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5"><h2 className="border-b border-black pb-3 text-xl font-bold uppercase">QC Complaint Form</h2>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<form onSubmit={submit} className="grid grid-cols-1 gap-4 rounded border-2 border-black bg-white p-5 md:grid-cols-2">
    <label className="space-y-1"><span className="font-bold">Firm *</span><Select value={form.firmId} onChange={(value) => setFormValue("firmId", value)} options={firmOptions} placeholder="Select Firm" disabled={locked} /></label>
    <label className="space-y-1"><span className="font-bold">Date of Complaint *</span><input type="date" className={field} value={form.dateOfComplaint} onChange={(event) => setFormValue("dateOfComplaint", event.target.value)} /></label>
    <label className="space-y-1"><span className="font-bold">Party Name *</span><Select value={form.partyName} onChange={(value) => setFormValue("partyName", value)} options={form.partyName ? [{ value: form.partyName, label: form.partyName }] : []} placeholder="Select Party" disabled={locked} /></label>
    <label className="space-y-1"><span className="font-bold">Item Name *</span><Select value={form.itemName} onChange={(value) => setFormValue("itemName", value)} options={form.itemName ? [{ value: form.itemName, label: form.itemName }] : []} placeholder="Select Item" disabled={locked} /></label>
    <label className="space-y-1"><span className="font-bold">ERP Code *</span><Select value={form.erpCode} onChange={chooseErp} options={erpOptions} placeholder="Select ERP Code" /></label>
    <label className="space-y-1"><span className="font-bold">Nature of Complaint *</span><Select value={form.natureOfComplaint} onChange={(value) => setFormValue("natureOfComplaint", value)} options={[{ value: "Complaint", label: "Complaint" }, { value: "Rejection", label: "Rejection" }]} placeholder="Select Nature" /></label>
    <label className="space-y-1"><span className="font-bold">Job No. *</span><Select value={form.lotNo} onChange={chooseJob} options={jobOptions} placeholder="Select Job No." disabled={locked} />{hint && <span className="block text-xs font-bold text-amber-700">{hint}</span>}</label>
    <label className="space-y-1"><span className="font-bold">Quantity *</span><input type="number" min="0" className={field} value={form.quantity} onChange={(event) => setFormValue("quantity", event.target.value)} /></label>
    <label className="space-y-1"><span className="font-bold">Area of Issue</span><Select value={form.areaOfIssue} onChange={(value) => setFormValue("areaOfIssue", value)} options={[{ value: "Boardline", label: "Boardline" }, { value: "Printing", label: "Printing" }, { value: "Dispatch", label: "Dispatch" }]} placeholder="Select Area" /></label>
    <label className="space-y-1"><span className="font-bold">Concerned Person Name</span><Select value={form.concernedPersonName} onChange={(value) => setFormValue("concernedPersonName", value)} options={personOptions} placeholder="Select QC Person" /></label>
    <label className="space-y-1 md:col-span-2"><span className="font-bold">Issue Details *</span><textarea className={`${field} min-h-28`} value={form.issueDetails} onChange={(event) => setFormValue("issueDetails", event.target.value)} /></label>
    {(["photo1", "photo2"] as const).map((name, index) => <label key={name} className="space-y-1"><span className="font-bold">Photo {index + 1}</span><input type="file" accept="image/*" className={`${field} file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1 file:font-bold file:text-white`} disabled={saving || uploading[name]} onChange={(event) => void uploadPhoto(name, event.target.files?.[0])} />{uploading[name] && <span className="block text-xs font-bold text-indigo-700">Uploading...</span>}{form[name] && !uploading[name] && <span className="block text-xs text-slate-600">Photo uploaded.</span>}</label>)}
    <div className="md:col-span-2"><button className="rounded bg-cyan-700 px-5 py-2 font-bold text-white disabled:opacity-60" type="submit" disabled={saving || uploading.photo1 || uploading.photo2}>{saving ? "Saving..." : "Save QC Complaint"}</button></div>
  </form></div>;
}
