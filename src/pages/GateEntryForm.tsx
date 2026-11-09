import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { Company, Firm, GateEntry, GateEntryPhoto, GatePass, Supplier } from "../types";
import { useAuth } from "../auth/AuthContext";
import { getPendingQtyForGatePass, hasSavedReturnableReceiptGateEntry, isReturnableGatePass } from "../lib/gatePassState";
import { hasGateEntryMrr, isGateEntryCancelled } from "../lib/gateEntryState";
import { getFirmDisplayName } from "../lib/firmDisplay";

const PHOTO_SLOTS = 8;

type PhotoSlot = {
  filename: string;
  uploading: boolean;
};

function createInitialSlots(): PhotoSlot[] {
  return Array.from({ length: PHOTO_SLOTS }, () => ({ filename: "", uploading: false }));
}

function buildPhotoSlots(photos: GateEntryPhoto[]) {
  const slots = createInitialSlots();
  photos.forEach((photo) => {
    const index = Number(photo.slotNo || 0) - 1;
    if (index >= 0 && index < PHOTO_SLOTS) {
      slots[index] = { filename: photo.photo, uploading: false };
    }
  });
  return slots;
}

function toInputDate(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

export function GateEntryForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editGateEntryId = searchParams.get("id") || "";
  const sourceGatePassId = searchParams.get("sourceGatePassId") || "";
  const purposeFromQuery = searchParams.get("purpose") === "Returnable Receipt" ? "Returnable Receipt" : "Material Receipt";

  const [gateEntries, setGateEntries] = useData<GateEntry>("gate-entries", []);
  const [gateEntryPhotos, setGateEntryPhotos, gateEntryPhotosLoading] = useData<GateEntryPhoto>("gate-entry-photos", []);
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [companies] = useData<Company>("companies", []);
  const [gatePasses] = useData<GatePass>("gate_passes", []);
  const [materialIn] = useData("material-in", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { setActiveFirm } = useAuth();

  const editingEntry = gateEntries.find((entry) => entry.id === editGateEntryId) || null;
  const isEditing = Boolean(editingEntry);
  const editingLocked = hasGateEntryMrr(editingEntry) || isGateEntryCancelled(editingEntry);
  const effectiveSourceGatePassId = editingEntry?.sourceGatePassId || sourceGatePassId;
  const sourceGatePass = gatePasses.find((gatePass) => gatePass.id === effectiveSourceGatePassId) || null;
  const entryPhotos = useMemo(
    () => gateEntryPhotos.filter((photo) => photo.gateEntryId === editGateEntryId).sort((a, b) => a.slotNo - b.slotNo),
    [editGateEntryId, gateEntryPhotos]
  );

  const [date, setDate] = useState(toInputDate());
  const [supplierId, setSupplierId] = useState("");
  const [supplierLabel, setSupplierLabel] = useState("");
  const [purpose, setPurpose] = useState<GateEntry["purpose"]>(purposeFromQuery);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [truckNo, setTruckNo] = useState("");
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>(createInitialSlots);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firmId, setFirmId] = useState("");
  const initializedContextRef = useRef("");
  const initializedPhotosEntryRef = useRef("");
  const selectedFirm = firms.find((firm) => firm.id === firmId);

  const eligibleReturnableRecipientIds = useMemo(() => {
    return new Set(
      gatePasses
        .filter((gatePass) => isReturnableGatePass(gatePass))
        .filter((gatePass) => !gatePass.clearOffReason || !gatePass.clearedOffAt)
        .filter((gatePass) => getPendingQtyForGatePass(gatePass, materialIn) > 0)
        .filter((gatePass) => !hasSavedReturnableReceiptGateEntry(gatePass, materialIn))
        .map((gatePass) => String(gatePass.recipientId || "").trim())
        .filter(Boolean)
    );
  }, [gatePasses, materialIn]);

  const supplierOptions = useMemo(() => {
    const combined = [
      ...suppliers.filter((supplier) => supplier.active !== "No").map((supplier) => ({ value: supplier.id, label: supplier.name })),
      ...companies.map((company) => ({ value: company.id, label: company.name })),
    ];
    const filtered =
      purpose === "Returnable Receipt"
        ? combined.filter((option) => eligibleReturnableRecipientIds.has(option.value))
        : combined;
    if (supplierId && supplierLabel && !filtered.some((option) => option.value === supplierId)) {
      filtered.push({ value: supplierId, label: supplierLabel });
    }
    return filtered.sort((a, b) => a.label.localeCompare(b.label));
  }, [companies, eligibleReturnableRecipientIds, purpose, supplierId, supplierLabel, suppliers]);

  useEffect(() => {
    if (!supplierId) {
      if (supplierLabel) setSupplierLabel("");
      return;
    }
    const currentLabel = [...suppliers, ...companies].find((party) => party.id === supplierId)?.name || "";
    if (currentLabel && currentLabel !== supplierLabel) setSupplierLabel(currentLabel);
  }, [companies, supplierId, supplierLabel, suppliers]);

  const hasUploadingPhoto = photoSlots.some((slot) => slot.uploading);
  const purposeLocked = Boolean(effectiveSourceGatePassId || isEditing);

  useEffect(() => {
    const contextKey = editGateEntryId
      ? `edit:${editGateEntryId}`
      : `new:${sourceGatePassId}:${purposeFromQuery}`;
    if (initializedContextRef.current === contextKey) return;

    // Route-linked defaults arrive asynchronously. Wait for them before the one-time
    // initialization so a later data refresh never has to reset an in-progress draft.
    if (editGateEntryId && !editingEntry) return;
    if (!editGateEntryId && sourceGatePassId && !sourceGatePass) return;

    if (!isEditing || !editingEntry) {
      setDate(toInputDate());
      setSupplierId(sourceGatePass?.recipientId || "");
      setSupplierLabel("");
      setPurpose(purposeFromQuery);
      setInvoiceNo("");
      setInvoiceValue("");
      setTruckNo(sourceGatePass?.truckNo || "");
      setFirmId("");
      setPhotoSlots(createInitialSlots());
      initializedContextRef.current = contextKey;
      return;
    }

    setDate(toInputDate(editingEntry.date));
    setSupplierId(editingEntry.supplierId || sourceGatePass?.recipientId || "");
    setSupplierLabel("");
    setPurpose((editingEntry.purpose || purposeFromQuery) as GateEntry["purpose"]);
    setInvoiceNo(editingEntry.invoiceNo || "");
    setInvoiceValue(String(editingEntry.invoiceValue ?? ""));
    setTruckNo(editingEntry.truckNo || sourceGatePass?.truckNo || "");
    setFirmId(editingEntry.firmId || "");
    initializedContextRef.current = contextKey;
  }, [editGateEntryId, editingEntry, isEditing, purposeFromQuery, sourceGatePass, sourceGatePassId]);

  useEffect(() => {
    if (!editGateEntryId || !editingEntry || gateEntryPhotosLoading) return;
    if (initializedPhotosEntryRef.current === editGateEntryId) return;
    setPhotoSlots(buildPhotoSlots(entryPhotos));
    initializedPhotosEntryRef.current = editGateEntryId;
  }, [editGateEntryId, editingEntry, entryPhotos, gateEntryPhotosLoading]);

  useEffect(() => {
    if (!isEditing || !editingLocked) return;
    alert(isGateEntryCancelled(editingEntry) ? "Gate Entry cannot be edited after cancellation." : "Gate Entry cannot be edited after MRR is created.");
    navigate("/gate-entry/master", { replace: true });
  }, [editingEntry, editingLocked, isEditing, navigate]);

  useEffect(() => {
    if (purpose !== "Returnable Receipt") return;
    if (!supplierId) return;
    if (eligibleReturnableRecipientIds.has(supplierId)) return;
    setSupplierId(sourceGatePass?.recipientId || editingEntry?.supplierId || "");
    setSupplierLabel("");
  }, [editingEntry?.supplierId, eligibleReturnableRecipientIds, purpose, sourceGatePass?.recipientId, supplierId]);

  const updateSlot = (index: number, next: Partial<PhotoSlot>) => {
    setPhotoSlots((prev) => prev.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...next } : slot)));
  };

  const handlePhotoUpload = async (index: number, file?: File | null) => {
    if (!file) return;
    updateSlot(index, { uploading: true });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const token = window.localStorage.getItem("authToken");
        const response = await fetch("/api/upload-artwork", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ base64: reader.result, filename: file.name }),
        });
        if (!response.ok) throw new Error("Upload failed");
        const result = await response.json();
        updateSlot(index, { filename: result.filename, uploading: false });
      } catch (error) {
        console.error("Failed to upload gate entry photo:", error);
        updateSlot(index, { uploading: false, filename: "" });
        alert("Failed to upload photo.");
      }
    };
    reader.onerror = () => {
      updateSlot(index, { uploading: false });
      alert("Failed to read photo.");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firmId || !selectedFirm) { alert("Please select a valid Firm."); return; }
    if (!date || !supplierId || !invoiceNo.trim() || !invoiceValue || !truckNo.trim()) return;
    if (hasUploadingPhoto) {
      alert("Please wait for photo uploads to finish.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const gateEntryId = editingEntry?.id || crypto.randomUUID();
      const nextEntry: GateEntry = {
        ...(editingEntry || {}),
        id: gateEntryId,
        date,
        supplierId,
        purpose,
        invoiceNo: invoiceNo.trim(),
        invoiceValue: Number(invoiceValue || 0),
        truckNo: truckNo.trim(),
        firmId,
        firmName: selectedFirm.firmName,
        sourceGatePassId: sourceGatePass?.id || editingEntry?.sourceGatePassId,
        sourceGatePassNo: sourceGatePass?.gatePassNo || editingEntry?.sourceGatePassNo,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };

      const currentPhotos = photoSlots
        .map((slot, index) => ({ slot, slotNo: index + 1 }))
        .filter(({ slot }) => Boolean(slot.filename));
      const existingPhotoBySlot = new Map(entryPhotos.map((photo) => [photo.slotNo, photo]));
      const nextPhotos: GateEntryPhoto[] = currentPhotos.map(({ slot, slotNo }) => ({
        id: existingPhotoBySlot.get(slotNo)?.id || crypto.randomUUID(),
        gateEntryId,
        photo: slot.filename,
        slotNo,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      }));

      await setGateEntries((prev) =>
        editingEntry
          ? prev.map((entry) => (entry.id === gateEntryId ? nextEntry : entry))
          : [nextEntry, ...prev]
      );
      await setGateEntryPhotos((prev) => [
        ...prev.filter((photo) => photo.gateEntryId !== gateEntryId),
        ...nextPhotos,
      ]);

      navigate("/gate-entry/master");
    } catch (error) {
      console.error("Failed to save gate entry:", error);
      alert(isEditing ? "Failed to update gate entry." : "Failed to save gate entry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-blue-700">{isEditing ? "Edit Gate Entry" : "Add Gate Entry"}</h2>
          </div>
        </div>

        {sourceGatePass ? (
          <div className="mb-6 rounded-2xl border border-emerald-700 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
            Linked Returnable Gate Pass: <span className="font-bold">{sourceGatePass.gatePassNo}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Date" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </Field>

            <Field label="Purpose" required>
              {purposeLocked ? (
                <input value={purpose || "Material Receipt"} disabled className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-5 py-4 text-lg" />
              ) : (
                <select value={purpose || "Material Receipt"} onChange={(e) => setPurpose(e.target.value as GateEntry["purpose"])} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="Material Receipt">Material Receipt</option>
                  <option value="Returnable Receipt">Returnable Receipt</option>
                </select>
              )}
            </Field>

            <Field label="Firm" required>
              <select value={firmId} disabled={purposeLocked} onChange={(e) => { setFirmId(e.target.value); const firm = firms.find((item) => item.id === e.target.value); if (firm) setActiveFirm(firm); }} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg disabled:bg-slate-50">
                <option value=""></option>
                {firms.map((firm) => <option key={firm.id} value={firm.id}>{getFirmDisplayName(firm)}</option>)}
              </select>
            </Field>

            <Field label="Party Name" required>
              <Select
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value);
                  setSupplierLabel(supplierOptions.find((option) => option.value === value)?.label || "");
                }}
                options={supplierOptions}
                placeholder=""
                required
              />
            </Field>

            <Field label="Invoice No" required>
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </Field>

            <Field label="Invoice Value" required>
              <input type="number" min="0" step="0.01" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </Field>

            <Field label="Truck No" required className="md:max-w-[420px]">
              <input value={truckNo} onChange={(e) => setTruckNo(e.target.value.toUpperCase())} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </Field>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-black text-blue-700">Upload</h3>
            {/* Phones: one column of file boxes; the next box opens once the previous one has a file. */}
            <div className="grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-4">
              {photoSlots.map((slot, index) => {
                const openOnPhone = index === 0 || Boolean(slot.filename) || Boolean(photoSlots[index - 1]?.filename) || slot.uploading;
                return (
                <div key={index} className={`${openOnPhone ? "" : "hidden md:block "}min-w-0 md:rounded-2xl md:border md:border-slate-200 md:bg-slate-50 md:p-4`}>
                  <div className="mb-2 flex items-center justify-between md:mb-3">
                    <span className="font-bold text-blue-700 md:text-sm md:text-slate-700">Pic {index + 1}</span>
                    {slot.filename ? (
                      <button type="button" onClick={() => updateSlot(index, { filename: "" })} className="hidden rounded-full border border-slate-300 p-2 text-slate-600 hover:bg-white md:inline-flex">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                  <label className="flex w-full min-w-0 min-h-[56px] cursor-pointer overflow-hidden items-center gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40 md:min-h-[180px] md:flex-col md:justify-center md:border-dashed md:px-4 md:py-6 md:text-center">
                    {slot.uploading ? (
                      <Loader2 className="animate-spin text-indigo-700" size={22} />
                    ) : (
                      <Camera size={22} className="shrink-0 text-slate-500" />
                    )}
                    {slot.filename ? (
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 md:flex-none md:line-clamp-3 md:whitespace-normal" title={slot.filename}>{shortFileName(slot.filename)}</span>
                    ) : null}
                    {slot.filename ? (
                      // Phones: delete sits at the right end of the file box.
                      <button
                        type="button"
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); updateSlot(index, { filename: "" }); }}
                        className="ml-auto shrink-0 rounded-full border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 md:hidden"
                        aria-label={`Remove Pic ${index + 1}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handlePhotoUpload(index, e.target.files?.[0])} />
                  </label>
                </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting || hasUploadingPhoto} className="rounded-2xl bg-indigo-700 px-8 py-3 font-bold text-white transition hover:bg-indigo-800 disabled:opacity-50">
              {isSubmitting ? (isEditing ? "Updating..." : "Saving...") : (isEditing ? "Update" : "Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Long stored names (e.g. c4565be1-530c-….pdf) shown short: first 8 characters and the extension.
function shortFileName(filename: string) {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot) : "";
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return base.length > 10 ? `${base.slice(0, 8)}…${ext}` : filename;
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className || ""}>
      <label className="mb-2 block font-bold text-blue-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}
