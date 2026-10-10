import { FormEvent, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { Firm, Production, QualityComplaint } from "../types";

type PhotoKey = "photo1" | "photo2";
type Area = "Boardline" | "Printing" | "Dispatch" | "";
type FormState = {
  erpCode: string;
  dateOfComplaint: string;
  natureOfComplaint: "Complaint" | "Rejection";
  issueDetails: string;
  photo1: string;
  photo2: string;
  lotNo: string;
  concernedPersonName: string;
  quantity: string;
  areaOfIssue: Area;
};

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): FormState => ({ erpCode: "", dateOfComplaint: today(), natureOfComplaint: "Complaint", issueDetails: "", photo1: "", photo2: "", lotNo: "", concernedPersonName: "", quantity: "", areaOfIssue: "" });
const card = "rounded-lg border border-[#d8d5d2] bg-white px-5 py-6 shadow-sm";
const input = "w-full border-0 border-b border-[#d6d3d1] bg-transparent px-0 py-2 text-sm outline-none focus:border-indigo-600 focus:ring-0";
const label = "mb-5 block text-sm font-bold text-slate-950";
const key = (value: unknown) => String(value ?? "").trim().toLowerCase();

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    reader.readAsDataURL(file);
  });
}

export function QualityComplaintScreenshotForm() {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const items = useNpdItems();
  const [, , , api] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all" });
  const [form, setForm] = useState<FormState>(blank);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<Record<PhotoKey, boolean>>({ photo1: false, photo2: false });
  const [saving, setSaving] = useState(false);

  const selectedItem = useMemo(() => items.find((item: any) => key(item.erp) === key(form.erpCode)), [form.erpCode, items]);
  const matchingProduction = useMemo(() => {
    const lot = key(form.lotNo);
    const erp = key(form.erpCode);
    const byLot = productions.find((production) => key(production.transactionNo || production.jobCardNo) === lot);
    if (byLot) return byLot;
    return productions.find((production) => {
      const jobNo = key(production.transactionNo || production.jobCardNo);
      const productionErp = key(production.erpCode || production.itemErp || production.masterErp);
      return Boolean(erp && productionErp === erp && (!lot || jobNo !== lot));
    });
  }, [form.erpCode, form.lotNo, productions]);

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  const uploadPhoto = async (photoKey: PhotoKey, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setMessage("Photo must be 10 MB or smaller.");
    setMessage("");
    setUploading((current) => ({ ...current, [photoKey]: true }));
    try {
      const response = await fetch("/api/upload-artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, base64: await fileDataUrl(file) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Photo upload failed.");
      update(photoKey, result.filename || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading((current) => ({ ...current, [photoKey]: false }));
    }
  };

  const clearForm = () => { setForm(blank()); setMessage(""); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (uploading.photo1 || uploading.photo2) return setMessage("Please wait for photo uploads to finish.");
    const required = [form.erpCode, form.dateOfComplaint, form.natureOfComplaint, form.issueDetails, form.lotNo, form.quantity];
    if (required.some((value) => !String(value).trim())) return setMessage("Please complete all required fields.");
    const numericQuantity = Number(form.quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return setMessage("Quantity must be greater than zero.");

    const production = matchingProduction;
    const firmId = production?.firmId || "";
    const firmName = firms.find((firm) => firm.id === firmId)?.firmName || production?.firmName || "";
    const now = new Date().toISOString();
    const record: QualityComplaint = {
      id: `QC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      dateOfComplaint: form.dateOfComplaint,
      firmId,
      firmName,
      partyName: String(production?.companyName || selectedItem?.customer || "").trim(),
      itemName: String((production as any)?.itemName || selectedItem?.name || "").trim(),
      erpCode: form.erpCode.trim(),
      natureOfComplaint: form.natureOfComplaint,
      lotNo: form.lotNo.trim(),
      issueDetails: form.issueDetails.trim(),
      photo1: form.photo1,
      photo2: form.photo2,
      areaOfIssue: form.areaOfIssue,
      concernedPersonName: form.concernedPersonName.trim(),
      quantity: numericQuantity,
      updatedBy: "System User",
      updateTimestamp: now,
    };

    setSaving(true);
    try {
      await api.addItem(record);
      setForm(blank());
      setMessage("QC complaint saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save complaint.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="min-h-full bg-[#f0efff] px-3 py-6 text-slate-950 sm:px-6"><form onSubmit={submit} className="mx-auto max-w-xl space-y-3 pb-6">
    {message && <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold">{message}</div>}
    <section className={card}><label className={label}>ERP Code <span className="text-red-600">*</span><input className={input} value={form.erpCode} onChange={(event) => update("erpCode", event.target.value)} placeholder="Your answer" /></label></section>
    <section className={card}><label className={label}>Date of Complaint <span className="text-red-600">*</span><span className="mt-4 block text-xs font-normal text-slate-500">Date</span><input type="date" className={input} value={form.dateOfComplaint} onChange={(event) => update("dateOfComplaint", event.target.value)} /></label></section>
    <fieldset className={card}><legend className="mb-5 text-sm font-bold">Nature Of Complaint <span className="text-red-600">*</span></legend><div className="space-y-4">{["Complaint", "Rejection"].map((value) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="natureOfComplaint" value={value} checked={form.natureOfComplaint === value} onChange={() => update("natureOfComplaint", value as FormState["natureOfComplaint"])} className="h-5 w-5 accent-indigo-600" />{value}</label>)}</div></fieldset>
    <section className={card}><label className={label}>Issue Details <span className="text-red-600">*</span><textarea className={`${input} min-h-24 resize-y`} value={form.issueDetails} onChange={(event) => update("issueDetails", event.target.value)} placeholder="Your answer" /></label></section>
    {(["photo1", "photo2"] as PhotoKey[]).map((photoKey, index) => <section key={photoKey} className={card}><div className="text-sm font-bold">Photo {index + 1} <span className="font-normal">(If available)</span></div><p className="mt-4 text-xs text-slate-500">Upload 1 supported file. Max 10 MB.</p><label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><Upload size={16} /> Add file<input type="file" accept="image/*" className="sr-only" disabled={uploading[photoKey] || saving} onChange={(event) => void uploadPhoto(photoKey, event.target.files?.[0])} /></label>{uploading[photoKey] && <p className="mt-3 text-xs font-semibold text-indigo-700">Uploading...</p>}{form[photoKey] && !uploading[photoKey] && <p className="mt-3 text-xs text-slate-600">Photo uploaded.</p>}</section>)}
    <section className={card}><label className={label}>LOT NO. <span className="text-red-600">*</span><input className={input} value={form.lotNo} onChange={(event) => update("lotNo", event.target.value)} placeholder="Your answer" /></label></section>
    <section className={card}><label className={label}>Concerned Person Name<input className={input} value={form.concernedPersonName} onChange={(event) => update("concernedPersonName", event.target.value)} placeholder="Your answer" /></label></section>
    <section className={card}><label className={label}>Quantity <span className="text-red-600">*</span><input type="number" min="0" step="any" className={input} value={form.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="Your answer" /></label></section>
    <fieldset className={card}><legend className="mb-5 text-sm font-bold">Area of Issue</legend><div className="space-y-4">{["Boardline", "Printing", "Dispatch"].map((value) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="areaOfIssue" value={value} checked={form.areaOfIssue === value} onChange={() => update("areaOfIssue", value as Area)} className="h-5 w-5 accent-indigo-600" />{value}</label>)}</div></fieldset>
    <div className="flex items-center justify-between px-1 pt-2"><button type="submit" disabled={saving || uploading.photo1 || uploading.photo2} className="rounded bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{saving ? "Submitting..." : "Submit"}</button><button type="button" onClick={clearForm} className="text-sm font-medium text-indigo-700 hover:underline">Clear form</button></div>
  </form></div>;
}
