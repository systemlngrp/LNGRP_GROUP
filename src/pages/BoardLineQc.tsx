import React, { useEffect, useMemo, useState } from "react";
import { Edit, Search } from "lucide-react";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { BoardLineQcCheck, Production, Setting, User } from "../types";
import { formatDate, formatTime } from "../lib/utils";
import { normalizeProductionJobNumber } from "../lib/jobNumber";
import { calculateSamplingPlanQty } from "../lib/samplingPlanQty";
import { createQcGroupKey, getChunkFilledFields, getChunkTimestamp, getQcGroupKey, nextQcChunkNo, type QcChunkStatus } from "../lib/qcChunks";

type FieldType = "text" | "number" | "textarea" | "datetime-local";

type FieldConfig = {
  key: keyof BoardLineQcCheck;
  label: string;
  type?: FieldType;
  required?: boolean;
  wide?: boolean;
  readOnly?: boolean;
};

type FieldSection = {
  title: string;
  fields: FieldConfig[];
};

const CHECK_NO_OPTIONS = ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }));

const numberFields = new Set<keyof BoardLineQcCheck>([
  "cuttingSizeRequired",
  "cuttingSizeMm",
  "boardGsm",
  "boardThickness",
  "moisture",
  "sheetWeightGrams",
  "heightOd",
  "flap",
  "ply",
  "width",
  "length",
  "flapMinDs",
  "flapMaxDs",
  "flapAchievedOs",
  "heightAchievedOs",
  "flapLAchievedOs",
  "flapAchievedDs",
  "heightAchievedDs",
  "flapLAchievedDs",
  "planQty",
  "samplingPlanQty",
]);

const sections: FieldSection[] = [
  {
    title: "Job Details",
    fields: [
      { key: "timestamp", label: "Timestamp", type: "datetime-local" },
      { key: "bqcNo", label: "BQC No", readOnly: true },
      { key: "jobNo", label: "Job No.", required: true },
      { key: "partyName", label: "Company", readOnly: true },
      { key: "itemName", label: "Item Name", wide: true, readOnly: true },
      { key: "checkNo", label: "Check No." },
      { key: "standard", label: "Standard", readOnly: true },
      { key: "qcPerson", label: "QC Person" },
      { key: "erp", label: "ERP", readOnly: true },
    ],
  },
  {
    title: "Specification",
    fields: [
      { key: "flapHeightFlapOperatorSide", label: "Flap - Height - Flap (Operator Side)" },
      { key: "flapHeightFlapDriveSide", label: "Flap - Height - Flap (Drive Side)" },
      { key: "cuttingSizeRequired", label: "Cutting Size (Req.)", type: "number", readOnly: true },
      { key: "cuttingSizeMm", label: "Cutting Size (mm)", type: "number" },
      { key: "boardGsm", label: "B.GSM", type: "number" },
      { key: "typeOfFlute", label: "Type of Flute" },
      { key: "boardThickness", label: "Board Thickness", type: "number" },
      { key: "moisture", label: "Moisture", type: "number" },
      { key: "sheetWeightGrams", label: "Sheet Weight (Grams)", type: "number" },
    ],
  },
  {
    title: "Size Details",
    fields: [
      { key: "heightOd", label: "HEIGHT (OD)", type: "number", readOnly: true },
      { key: "flap", label: "FLAP", type: "number", readOnly: true },
      { key: "ply", label: "PLY", type: "number", readOnly: true },
      { key: "width", label: "WIDTH", type: "number", readOnly: true },
      { key: "length", label: "LENGTH", type: "number", readOnly: true },
      { key: "part", label: "PART", readOnly: true },
      { key: "flapMinDs", label: "Flap MIN (ds)", type: "number", readOnly: true },
      { key: "flapMaxDs", label: "Flap Max (ds)", type: "number", readOnly: true },
    ],
  },
  {
    title: "System Auto-Correction",
    fields: [
      { key: "systemAutoCorrection1", label: "System Auto-Correction:", readOnly: true },
      { key: "systemAutoCorrection2", label: "System Auto-Correction :", readOnly: true },
      { key: "systemAutoCorrection3", label: "System Auto-Correction:-", readOnly: true },
      { key: "systemAutoCorrection4", label: "System Auto-Correction:--", readOnly: true },
      { key: "systemAutoCorrection5", label: "System Auto-Correction -", readOnly: true },
    ],
  },
  {
    title: "Achieved Values",
    fields: [
      { key: "flapAchievedOs", label: "Flap (Achieved) OS", type: "number", readOnly: true },
      { key: "heightAchievedOs", label: "Height (Achieved) OS", type: "number", readOnly: true },
      { key: "flapLAchievedOs", label: "Flap L (Achieved) OS", type: "number", readOnly: true },
      { key: "flapAchievedDs", label: "Flap (Achieved) DS", type: "number", readOnly: true },
      { key: "heightAchievedDs", label: "Height (Achieved) DS", type: "number", readOnly: true },
      { key: "flapLAchievedDs", label: "Flap L (Achieved) DS", type: "number", readOnly: true },
    ],
  },
  {
    title: "Remarks And References",
    fields: [
      { key: "previousCustomerComplaintWarning", label: "WARNING - (Previous Customer Complained)", type: "textarea", wide: true },
      { key: "boardlineRemarks", label: "BOARDLINE REMARKS", type: "textarea", wide: true },
      { key: "photo", label: "PHOTO", type: "textarea", wide: true },
      { key: "printingArtwork", label: "PRINTING ARTWORK", type: "textarea", wide: true, readOnly: true },
      { key: "planQty", label: "Plan Qty", type: "number", readOnly: true },
      { key: "samplingPlanQty", label: "Sampling Plan Qty", type: "number", readOnly: true },
      { key: "samplingCheckNo", label: "Check No", readOnly: true },
    ],
  },
];

const allFields = sections.flatMap((section) => section.fields);
const formSections: FieldSection[] = [
  {
    title: "Job Details",
    fields: [
      { key: "jobNo", label: "Job No.", required: true },
      { key: "checkNo", label: "Check No.", required: true },
      { key: "qcPerson", label: "QC Person" },
    ],
  },
  {
    title: "Specification",
    fields: [
      { key: "flapHeightFlapOperatorSide", label: "Flap - Height - Flap (Operator Side)" },
      { key: "flapHeightFlapDriveSide", label: "Flap - Height - Flap (Drive Side)" },
      { key: "cuttingSizeMm", label: "Cutting Size (mm)", type: "number" },
      { key: "boardGsm", label: "B.GSM", type: "number" },
      { key: "typeOfFlute", label: "Type of Flute" },
      { key: "boardThickness", label: "Board Thickness", type: "number" },
      { key: "moisture", label: "Moisture", type: "number" },
      { key: "sheetWeightGrams", label: "Sheet Weight (Grams)", type: "number" },
    ],
  },
  {
    title: "Remarks And References",
    fields: [{ key: "boardlineRemarks", label: "BOARDLINE REMARKS", type: "textarea", wide: true }],
  },
];

const BOARDLINE_CHUNK_FIELD_KEYS = [
  "flapHeightFlapOperatorSide",
  "flapHeightFlapDriveSide",
  "cuttingSizeMm",
  "boardThickness",
  "moisture",
  "sheetWeightGrams",
  "boardlineRemarks",
] as const;


const FLUTE_OPTIONS = ["A", "C", "B", "E", "B+A", "B+C", "B+B"].map((value) => ({ value, label: value }));

function hasFormValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}


function toLocalDatetimeInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function createInitialForm(): Partial<BoardLineQcCheck> {
  return {
    timestamp: toLocalDatetimeInput(new Date()),
    jobNo: "",
    partyName: "",
    itemName: "",
    checkNo: "",
    qcPerson: "",
    bqcNo: "",
  };
}

function currentUserDisplayName(user: { name?: string; email?: string; userId?: string } | null | undefined) {
  return String(user?.name || user?.email || user?.userId || "System User").trim();
}

function nextQcNo<T extends Record<string, unknown>>(rows: T[], key: keyof T, prefix: string) {
  const highest = rows.reduce((max, row) => {
    const match = String(row[key] || "").match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(6, "0")}`;
}

function hasAnyWarning(values: Array<unknown>) {
  return values.some((value) => String(value ?? "").trim() !== "");
}

function uniqueOptions(values: Array<unknown>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function toOptionalNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return "";
}

function toFiniteNumber(value: unknown): number | "" {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

function parseFlapHeightFlap(value: unknown): [number | "", number | "", number | ""] {
  const parts = String(value || "")
    .split("-")
    .map((part) => toFiniteNumber(part.trim()));
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
}

function blankIfMissing(...values: unknown[]) {
  return values.some((value) => value === "" || value === null || value === undefined);
}

function isNumber(value: number | ""): value is number {
  return typeof value === "number";
}
function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function calculateBoardLineForm(form: Partial<BoardLineQcCheck>, settings?: Setting): Partial<BoardLineQcCheck> {
  const heightOd = toFiniteNumber(form.heightOd);
  const ply = toFiniteNumber(form.ply);
  const width = toFiniteNumber(form.width);
  const length = toFiniteNumber(form.length);
  const part = toFiniteNumber(form.part);
  const cuttingSizeMm = toFiniteNumber(form.cuttingSizeMm);
  const planQty = toFiniteNumber(form.planQty);
  const qcPerson = String(form.qcPerson || "").trim();
  const [flapAchievedOs, heightAchievedOs, flapLAchievedOs] = parseFlapHeightFlap(form.flapHeightFlapOperatorSide);
  const [flapAchievedDs, heightAchievedDs, flapLAchievedDs] = parseFlapHeightFlap(form.flapHeightFlapDriveSide);
  const flap = isNumber(ply) && isNumber(width) ? (ply === 3 ? width / 2 : width / 2 + 1) : "";
  const flapMinDs = flap === "" ? "" : flap - 1;
  const flapMaxDs = flap === "" ? "" : flap + 1;
  const cuttingSizeRequired =
    isNumber(part) && isNumber(width) && isNumber(length) ? (part === 1 ? (length + width) * 2 + 30 : length + width + 30) : "";
  const standard = blankIfMissing(heightOd, flap) ? "" : `${flap} - ${heightOd} - ${flap}`;
  const samplingPlanQty = calculateSamplingPlanQty(planQty, settings);
  const samplingCheckNo = String(form.checkNo || "").trim() && samplingPlanQty !== "" ? `${String(form.checkNo).trim()} / ${samplingPlanQty}` : "";
  const hasOsFlapInputs = isNumber(flapAchievedOs) && isNumber(flapMinDs) && isNumber(flapMaxDs) && qcPerson !== "";
  const hasOsHeightInputs = isNumber(heightAchievedOs) && isNumber(heightOd) && qcPerson !== "";
  const hasDsFlapInputs = isNumber(flapAchievedDs) && isNumber(flapMinDs) && isNumber(flapMaxDs) && qcPerson !== "";
  const hasDsHeightInputs = isNumber(heightAchievedDs) && isNumber(heightOd) && qcPerson !== "";
  const hasCuttingSizeInputs = isNumber(cuttingSizeMm) && isNumber(cuttingSizeRequired) && qcPerson !== "";

  return {
    ...form,
    standard,
    cuttingSizeRequired,
    flap,
    flapMinDs,
    flapMaxDs,
    flapAchievedOs,
    heightAchievedOs,
    flapLAchievedOs,
    flapAchievedDs,
    heightAchievedDs,
    flapLAchievedDs,
    samplingPlanQty,
    samplingCheckNo,
    systemAutoCorrection1:
      !hasOsFlapInputs || (flapAchievedOs >= flapMinDs && flapAchievedOs <= flapMaxDs)
        ? ""
        : `${qcPerson} - Wrong FLAP Size Achieved on Operator Side`,
    systemAutoCorrection2:
      !hasOsHeightInputs || (heightAchievedOs >= heightOd - 2 && heightAchievedOs <= heightOd + 2)
        ? ""
        : `${qcPerson} - Wrong HEIGHT Achieved on Operator Side`,
    systemAutoCorrection3:
      !hasDsFlapInputs || (flapAchievedDs >= flapMinDs && flapAchievedDs <= flapMaxDs)
        ? ""
        : `${qcPerson} - Wrong FLAP Size Achieved on Drive Side`,
    systemAutoCorrection4:
      !hasDsHeightInputs || (heightAchievedDs >= heightOd - 2 && heightAchievedDs <= heightOd + 2)
        ? ""
        : `${qcPerson} - Wrong HEIGHT Achieved on Drive Side`,
    systemAutoCorrection5:
      !hasCuttingSizeInputs || (cuttingSizeMm >= cuttingSizeRequired - 5 && cuttingSizeMm <= cuttingSizeRequired + 5)
        ? ""
        : `${qcPerson} - Wrong Cutting Size. Please Check`,
  };
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function buildFlapHeightValue(flap: number | "", height: number | "") {
  if (flap === "" || height === "") return "";
  return `${flap}-${height}-${flap}`;
}

function buildPayload(form: Partial<BoardLineQcCheck>, updatedBy: string, setting?: Setting, existingId?: string): BoardLineQcCheck {
  const calculatedForm = calculateBoardLineForm(form, setting);
  const timestampInput = String(form.timestamp || "").trim();
  const timestamp = timestampInput ? new Date(timestampInput).toISOString() : new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: existingId || crypto.randomUUID(),
    timestamp,
    jobNo: normalizeProductionJobNumber(calculatedForm.jobNo),
    partyName: String(calculatedForm.partyName || "").trim(),
    itemName: String(calculatedForm.itemName || "").trim(),
    checkNo: String(calculatedForm.checkNo || "").trim(),
    qcPerson: String(calculatedForm.qcPerson || "").trim(),
    updatedBy,
    updateTimestamp: new Date().toISOString(),
  };

  ["qcFormType", "groupKey", "chunkNo", "chunkStatus", "filledFields", "createdBy", "createdTimestamp"].forEach((key) => {
    const value = (calculatedForm as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== "") payload[key] = value;
  });

  allFields.forEach((field) => {
    if (["timestamp", "jobNo", "partyName", "itemName", "checkNo", "qcPerson"].includes(String(field.key))) return;
    const raw = calculatedForm[field.key];
    if (raw === undefined || raw === null || raw === "") return;
    if (numberFields.has(field.key)) {
      const value = Number(raw);
      if (Number.isFinite(value)) payload[field.key] = value;
      return;
    }
    payload[field.key] = String(raw).trim();
  });

  return payload as unknown as BoardLineQcCheck;
}

function FieldInput({
  field,
  value,
  onChange,
  readOnly = false,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (key: keyof BoardLineQcCheck, value: string | number | "") => void;
  readOnly?: boolean;
}) {
  const isReadOnly = field.readOnly || readOnly;
  const commonClass =
    "border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors bg-white w-full read-only:bg-gray-400 read-only:text-gray-900";
  const stringValue = value === undefined || value === null ? "" : String(value);

  return (
    <div className={`flex flex-col space-y-1 ${field.wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
      <label className="font-bold text-black text-sm">
        {field.label} {field.required ? <span className="text-red-600">*</span> : null}
      </label>
      {field.type === "textarea" ? (
        <textarea
          value={stringValue}
          onChange={(event) => onChange(field.key, event.target.value)}
          readOnly={isReadOnly}
          required={field.required}
          rows={3}
          className={`${commonClass} min-h-[88px] resize-y`} style={isReadOnly ? { backgroundColor: "#9ca3af", color: "#111827" } : undefined}
        />
      ) : (
        <input
          type={field.type || "text"}
          value={stringValue}
          onChange={(event) => onChange(field.key, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
          readOnly={isReadOnly}
          required={field.required}
          step={field.type === "number" ? "any" : undefined}
          className={commonClass} style={isReadOnly ? { backgroundColor: "#9ca3af", color: "#111827" } : undefined}
        />
      )}
    </div>
  );
}

export function BoardLineQcForm() {
  const [checks, setChecks] = useData<BoardLineQcCheck>("boardline_qc_checks", []);
  const [settings] = useData<Setting>("settings", []);
  const [productions] = useData<Production>("productions", []);
  const [users] = useData<User>("users", []);
  const { findItemAcrossSources } = useOrderItemCatalog();
  const { user } = useAuth();
  const [form, setForm] = useState<Partial<BoardLineQcCheck>>(createInitialForm);
  const [selectedProductionId, setSelectedProductionId] = useState("");
  const [editedChunkFields, setEditedChunkFields] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qcPersonName = currentUserDisplayName(user);
  const existingGroup = useMemo(() => {
    if (!hasFormValue(form.jobNo) || !hasFormValue(form.checkNo)) return null;
    const groupKey = createQcGroupKey("boardline", form.jobNo, form.checkNo);
    return groupBoardLineChecks(checks).find((group) => group.groupKey === groupKey) || null;
  }, [checks, form.jobNo, form.checkNo]);
  const lockedChunkFields = useMemo(() => {
    const fields = new Set<string>();
    BOARDLINE_CHUNK_FIELD_KEYS.forEach((field) => {
      const value = existingGroup?.[field];
      if (value === undefined || value === null || value === "") return;
      const numericValue = numberFields.has(field as keyof BoardLineQcCheck);
      if (numericValue ? Number(value) > 0 : String(value).trim() !== "") fields.add(field);
    });
    return fields;
  }, [existingGroup]);
  const displayedForm = useMemo(() => {
    if (!existingGroup) return form;
    const merged = { ...form } as Partial<BoardLineQcCheck>;
    BOARDLINE_CHUNK_FIELD_KEYS.forEach((field) => {
      if (editedChunkFields.has(field)) return;
      const key = field as keyof BoardLineQcCheck;
      if (existingGroup[key] !== undefined && existingGroup[key] !== null && existingGroup[key] !== "") merged[key] = existingGroup[key] as never;
    });
    return merged;
  }, [existingGroup, form, editedChunkFields]);
  const nextBqcNo = useMemo(() => nextQcNo(checks, "bqcNo", "BQC"), [checks]);
  const qcPersonOptions = useMemo(() => {
    const active = users.filter((row) => row.status !== "Inactive" && row.name.trim()).map((row) => ({ value: row.name, label: row.name }));
    const current = String(form.qcPerson || "").trim();
    if (current && !active.some((option) => option.value === current)) active.unshift({ value: current, label: `${current} (Inactive)` });
    return active.sort((a, b) => a.label.localeCompare(b.label));
  }, [form.qcPerson, users]);

  useEffect(() => {
    setForm((prev) => calculateBoardLineForm({ ...prev, qcPerson: qcPersonName, bqcNo: nextBqcNo }, settings[0]));
  }, [qcPersonName, nextBqcNo]);

  const productionById = useMemo(() => {
    const map = new Map<string, Production>();
    productions.forEach((production) => {
      if (production.id) map.set(String(production.id), production);
    });
    return map;
  }, [productions]);

  const jobOptions = useMemo(
    () =>
      [...productions]
        .sort((a, b) =>
          String(b.date || b.updateTimestamp || b.transactionNo || "").localeCompare(
            String(a.date || a.updateTimestamp || a.transactionNo || "")
          )
        )
        .map((production) => {
          const item = findItemAcrossSources(
            String(production.itemId || production.npdId || ""),
            production.itemSource,
            production.erpCode || production.masterErp
          );
          const jobNo = normalizeProductionJobNumber(production.transactionNo || production.jobCardNo || production.id);
          const itemName = String((production as any).itemName || item?.name || production.itemId || "").trim();
          const partyName = String(production.companyName || item?.companyName || "").trim();
          const erp = String(production.erpCode || production.masterErp || item?.erp || "").trim();
          const labelParts = [jobNo, partyName, itemName, erp].filter(Boolean);
          return {
            value: String(production.id),
            label: labelParts.join(" | "),
            searchText: labelParts.join(" "),
          };
        }),
    [findItemAcrossSources, productions]
  );

  const setField = (key: keyof BoardLineQcCheck, value: string | number | "") => {
    if (key === "checkNo") setEditedChunkFields(new Set());
    if (BOARDLINE_CHUNK_FIELD_KEYS.includes(key as typeof BOARDLINE_CHUNK_FIELD_KEYS[number])) {
      setEditedChunkFields((prev) => new Set(prev).add(String(key)));
    }
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "checkNo" && String(prev.checkNo || "") !== String(value || "")) {
        BOARDLINE_CHUNK_FIELD_KEYS.forEach((field) => { next[field] = ""; });
      }
      return calculateBoardLineForm(next, settings[0]);
    });
  };

  const handleJobSelect = (productionId: string) => {
    setSelectedProductionId(productionId);
    const production = productionById.get(productionId);
    if (!production) {
      setForm((prev) => {
        const next = { ...prev, jobNo: "", checkNo: "" };
        BOARDLINE_CHUNK_FIELD_KEYS.forEach((field) => { next[field] = ""; });
        return next;
      });
      setEditedChunkFields(new Set());
      return;
    }

    const item = findItemAcrossSources(
      String(production.itemId || production.npdId || ""),
      production.itemSource,
      production.erpCode || production.masterErp
    );
    const rawItem = item?.raw || {};
    const jobNo = normalizeProductionJobNumber(production.transactionNo || production.jobCardNo);
    const partyName = firstText(production.companyName, item?.companyName, rawItem.customerName, rawItem.customer);
    const itemName = firstText((production as any).itemName, item?.name, rawItem.itemName, rawItem.name);
    const erp = firstText(production.erpCode, production.masterErp, item?.erp, rawItem.erp, rawItem.erpCode);
    const ply = toOptionalNumber(production.ply, rawItem.ply, rawItem.noOfPly);
    const heightId = toOptionalNumber(rawItem.heightId, rawItem.hId, rawItem.height);
    const widthId = toOptionalNumber(rawItem.breadthId, rawItem.widthId, rawItem.wId, rawItem.width, rawItem.breadth);
    const lengthId = toOptionalNumber(rawItem.lengthId, rawItem.lId, rawItem.length);
    const height = isNumber(heightId) && isNumber(ply) ? heightId + ply : toOptionalNumber(production.height, rawItem.hOd, rawItem.heightOd);
    const width = isNumber(widthId) && isNumber(ply) ? widthId + ply : toOptionalNumber(production.breadth, rawItem.wOd, rawItem.widthOd);
    const length = isNumber(lengthId) && isNumber(ply) ? lengthId + ply : toOptionalNumber(production.length, rawItem.lOd, rawItem.lengthOd);
    const part = firstText(rawItem.part, rawItem.noOfParts, production.noOfParts);
    const boardGsm = toOptionalNumber(production.boardGsmReq, production.gsm, rawItem.boardGsmReq, rawItem.gsm, rawItem.calculatedBGsm, rawItem.standardBGsm);

    setForm((prev) => {
      const next = {
        ...prev,
        jobNo,
        checkNo: String(prev.checkNo || ""),
        partyName,
        itemName,
        erp,
        heightOd: height,
        width,
        length,
        ply,
        part,
        typeOfFlute: firstText(production.flute, production.fluteType, rawItem.flute),
        boardGsm,
        sheetWeightGrams: toOptionalNumber(production.sheetWeight, rawItem.sheetWeightGrams, rawItem.calculatedWeightPerBox),
        planQty: toOptionalNumber(production.plannedQty, production.qty, rawItem.planQty, rawItem.orderQuantity),
        printingArtwork: firstText(rawItem.artwork, rawItem.artworkUpload, prev.printingArtwork),
      };
      BOARDLINE_CHUNK_FIELD_KEYS.forEach((field) => { next[field] = ""; });
      return calculateBoardLineForm(next, settings[0]);
    });
    setEditedChunkFields(new Set());
  };

  const canSubmit =
    hasFormValue(form.jobNo) &&
    hasFormValue(form.checkNo) &&
    getChunkFilledFields(form as Record<string, unknown>, [...BOARDLINE_CHUNK_FIELD_KEYS]).length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      alert("Select a Job No. and Check No., then enter at least one QC field before saving.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedBy = qcPersonName;
      const normalizedJobNo = normalizeProductionJobNumber(form.jobNo);
      const normalizedCheckNo = String(form.checkNo || "").trim();
      const groupKey = createQcGroupKey("boardline", normalizedJobNo, normalizedCheckNo);
      const chunkForm = { ...form } as Partial<BoardLineQcCheck>;
      lockedChunkFields.forEach((field) => { chunkForm[field as keyof BoardLineQcCheck] = ""; });
      const filledFields = getChunkFilledFields(chunkForm as Record<string, unknown>, [...BOARDLINE_CHUNK_FIELD_KEYS]);
      if (existingGroup?.groupStatus === "Complete" && !canManageMasterRecords(user?.role)) {
        alert("This QC group is complete. Ask an Admin or QC Manager to reopen it.");
        return;
      }
      const now = new Date().toISOString();
      const payload = buildPayload({
        ...chunkForm,
        jobNo: normalizedJobNo,
        checkNo: normalizedCheckNo,
        qcPerson: String(form.qcPerson || "").trim(),
        bqcNo: nextBqcNo,
        qcFormType: "boardline",
        groupKey,
        chunkNo: nextQcChunkNo(checks, groupKey),
        chunkStatus: "Draft",
        filledFields,
        createdBy: updatedBy,
        createdTimestamp: now,
      }, updatedBy, settings[0]);
      await setChecks((prev) => [...prev, payload]);
      setSelectedProductionId("");
      setForm(createInitialForm());
      setEditedChunkFields(new Set());
      alert("Board Line QC check saved successfully.");
    } catch (error) {
      console.error("Failed to save Board Line QC check:", error);
      alert((error as Error).message || "Failed to save Board Line QC check.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded shadow-sm border border-black text-black">
      <h2 className="text-xl font-bold text-black mb-6 uppercase tracking-tight border-b border-black pb-2">
        Board Line QC Form
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formSections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-black border-b border-black pb-1">
              {section.title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {section.fields.map((field) =>
                field.key === "jobNo" ? (
                  <div key={String(field.key)} className="flex flex-col space-y-1">
                    <label className="font-bold text-black text-sm">
                      {field.label} <span className="text-red-600">*</span>
                    </label>
                    <Select
                      options={jobOptions}
                      value={selectedProductionId}
                      onChange={handleJobSelect}
                      required
                      placeholder="Search and select job no..."
                      wrapLabels
                    />
                  </div>
                ) : field.key === "typeOfFlute" ? (
                  <div key={String(field.key)} className={`flex flex-col space-y-1 ${field.wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
                    <label className="font-bold text-black text-sm">
                      {field.label} {field.required ? <span className="text-red-600">*</span> : null}
                    </label>
                    <Select
                      options={FLUTE_OPTIONS}
                      value={String(displayedForm[field.key] || "")}
                      onChange={(value) => setField(field.key, value)}
                      required={field.required}
                      disabled={lockedChunkFields.has(String(field.key))}
                      placeholder="Choose"
                    />
                  </div>
                ) : field.key === "checkNo" || field.key === "qcPerson" ? (
                  <div key={String(field.key)} className={`flex flex-col space-y-1 ${field.wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
                    <label className="font-bold text-black text-sm">
                      {field.label} {field.required ? <span className="text-red-600">*</span> : null}
                    </label>
                    <Select
                      options={field.key === "checkNo" ? CHECK_NO_OPTIONS : qcPersonOptions}
                      value={String(displayedForm[field.key] || "")}
                      onChange={(value) => setField(field.key, value)}
                      required={field.required}
                      disabled={lockedChunkFields.has(String(field.key))}
                      placeholder="Choose"
                    />
                  </div>
                ) : (
                  <FieldInput key={String(field.key)} field={field} value={field.key === "bqcNo" ? nextBqcNo : displayedForm[field.key]} onChange={setField} readOnly={lockedChunkFields.has(String(field.key))} />
                )
              )}
            </div>
          </section>
        ))}

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className="flex min-w-[180px] items-center justify-center rounded bg-indigo-600 px-6 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? <Spinner size={24} className="text-white" /> : "Save QC Check"}
          </button>
        </div>
      </form>
    </div>
  );
}

type BoardLineQcGroup = BoardLineQcCheck & {
  groupKey: string;
  chunks: BoardLineQcCheck[];
  chunkCount: number;
  qcPeople: string[];
  groupStatus: QcChunkStatus;
};

function groupBoardLineChecks(checks: BoardLineQcCheck[]): BoardLineQcGroup[] {
  const grouped = new Map<string, BoardLineQcCheck[]>();
  checks.forEach((row) => {
    const key = getQcGroupKey(row, "boardline");
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  return Array.from(grouped.entries()).map(([groupKey, rawChunks]) => {
    const chunks = [...rawChunks].sort((a, b) => getChunkTimestamp(a) - getChunkTimestamp(b));
    const merged: Record<string, unknown> = { ...(chunks[0] || {}) };
    chunks.forEach((chunk) => {
      allFields.forEach((field) => {
        const value = chunk[field.key];
        if (value !== undefined && value !== null && String(value).trim() !== "") merged[field.key] = value;
      });
    });
    const qcPeople = uniqueOptions(chunks.map((chunk) => chunk.qcPerson));
    const groupStatus: QcChunkStatus = chunks.length > 0 && chunks.every((chunk) => chunk.chunkStatus === "Complete") ? "Complete" : "Draft";
    return {
      ...(merged as unknown as BoardLineQcCheck),
      id: `group:${groupKey}`,
      groupKey,
      chunks,
      chunkCount: chunks.length,
      qcPeople,
      groupStatus,
    };
  });
}

const masterColumns: FieldConfig[] = [
  { key: "timestamp", label: "Timestamp" },
  { key: "bqcNo", label: "BQC No" },
  { key: "jobNo", label: "Job No." },
  { key: "partyName", label: "Party Name" },
  { key: "itemName", label: "Item Name" },
  { key: "checkNo", label: "Check No." },
  { key: "standard", label: "Standard" },
  { key: "qcPerson", label: "QC Person" },
  { key: "erp", label: "ERP", readOnly: true },
  { key: "boardlineRemarks", label: "Remarks" },
  ...allFields.filter(
    (field) =>
      ![
        "timestamp",
        "bqcNo",
        "jobNo",
        "partyName",
        "itemName",
        "checkNo",
        "standard",
        "qcPerson",
        "erp",
        "boardlineRemarks",
        "whatsapp",
        "column19",
        "column20",
      ].includes(String(field.key))
  ),
];
const compactMasterColumnKeys = new Set<keyof BoardLineQcCheck>([
  "timestamp",
  "bqcNo",
  "jobNo",
  "checkNo",
  "qcPerson",
  "erp",
]);

const wideMasterColumnKeys = new Set<keyof BoardLineQcCheck>([
  "partyName",
  "itemName",
  "standard",
  "boardlineRemarks",
  "systemAutoCorrection1",
  "systemAutoCorrection2",
  "systemAutoCorrection3",
  "systemAutoCorrection4",
  "systemAutoCorrection5",
  "previousCustomerComplaintWarning",
  "photo",
  "printingArtwork",
]);

function masterHeaderClass(key: keyof BoardLineQcCheck) {
  const base = "border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top";
  if (compactMasterColumnKeys.has(key)) return `${base} min-w-[96px] whitespace-nowrap`;
  if (wideMasterColumnKeys.has(key)) return `${base} min-w-[220px] max-w-[360px] whitespace-normal break-words leading-snug`;
  return `${base} min-w-[120px] whitespace-nowrap`;
}

function masterCellClass(key: keyof BoardLineQcCheck) {
  const base = "border border-black px-3 py-2 text-sm text-black align-top";
  if (compactMasterColumnKeys.has(key)) return `${base} min-w-[96px] whitespace-nowrap`;
  if (wideMasterColumnKeys.has(key)) return `${base} min-w-[220px] max-w-[360px] whitespace-normal break-words leading-snug`;
  return `${base} min-w-[120px] whitespace-nowrap`;
}

export function BoardLineQcMaster() {
  const [checks, setChecks, loading] = useData<BoardLineQcCheck>("boardline_qc_checks", []);
  const [settings] = useData<Setting>("settings", []);
  const [users] = useData<User>("users", []);
  const [productions] = useData<Production>("productions", []);
  const { findItemAcrossSources } = useOrderItemCatalog();
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [searchTerm, setSearchTerm] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [qcPersonFilter, setQcPersonFilter] = useState("");
  const [warningFilter, setWarningFilter] = useState("All");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<BoardLineQcCheck | null>(null);
  const [editForm, setEditForm] = useState<Partial<BoardLineQcCheck>>({});
  const [editSelectedProductionId, setEditSelectedProductionId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [historyGroup, setHistoryGroup] = useState<BoardLineQcGroup | null>(null);

  const editJobOptions = useMemo(
    () =>
      [...productions]
        .sort((a, b) => String(b.date || b.updateTimestamp || b.transactionNo || "").localeCompare(String(a.date || a.updateTimestamp || a.transactionNo || "")))
        .map((production) => {
          const item = findItemAcrossSources(String(production.itemId || production.npdId || ""), production.itemSource, production.erpCode || production.masterErp);
          const jobNo = normalizeProductionJobNumber(production.transactionNo || production.jobCardNo || production.id);
          const itemName = String((production as any).itemName || item?.name || production.itemId || "").trim();
          const partyName = String(production.companyName || item?.companyName || "").trim();
          const erp = String(production.erpCode || production.masterErp || item?.erp || "").trim();
          const labelParts = [jobNo, partyName, itemName, erp].filter(Boolean);
          return { value: String(production.id), label: labelParts.join(" | "), searchText: labelParts.join(" ") };
        }),
    [findItemAcrossSources, productions]
  );
  const editProductionById = useMemo(() => new Map(productions.map((production) => [String(production.id), production])), [productions]);

  const editQcPersonOptions = useMemo(() => {
    const active = users.filter((row) => row.status !== "Inactive" && row.name.trim()).map((row) => ({ value: row.name, label: row.name }));
    const current = String(editForm.qcPerson || "").trim();
    if (current && !active.some((option) => option.value === current)) active.unshift({ value: current, label: `${current} (Inactive)` });
    return active.sort((a, b) => a.label.localeCompare(b.label));
  }, [editForm.qcPerson, users]);

  const openEdit = (row: BoardLineQcCheck) => {
    setEditingRow(row);
    const selected = productions.find((production) => normalizeProductionJobNumber(production.transactionNo || production.jobCardNo) === normalizeProductionJobNumber(row.jobNo));
    setEditSelectedProductionId(String(selected?.id || ""));
    setEditForm({ ...row, timestamp: row.timestamp ? toLocalDatetimeInput(new Date(row.timestamp)) : "" });
  };

  const handleEditJobSelect = (productionId: string) => {
    setEditSelectedProductionId(productionId);
    const production = editProductionById.get(productionId);
    if (!production) return;
    const item = findItemAcrossSources(String(production.itemId || production.npdId || ""), production.itemSource, production.erpCode || production.masterErp);
    const rawItem = item?.raw || {};
    const jobNo = normalizeProductionJobNumber(production.transactionNo || production.jobCardNo);
    const partyName = firstText(production.companyName, item?.companyName, rawItem.customerName, rawItem.customer);
    const itemName = firstText((production as any).itemName, item?.name, rawItem.itemName, rawItem.name);
    const erp = firstText(production.erpCode, production.masterErp, item?.erp, rawItem.erp, rawItem.erpCode);
    const ply = toOptionalNumber(production.ply, rawItem.ply, rawItem.noOfPly);
    const heightId = toOptionalNumber(rawItem.heightId, rawItem.hId, rawItem.height);
    const widthId = toOptionalNumber(rawItem.breadthId, rawItem.widthId, rawItem.wId, rawItem.width, rawItem.breadth);
    const lengthId = toOptionalNumber(rawItem.lengthId, rawItem.lId, rawItem.length);
    const height = isNumber(heightId) && isNumber(ply) ? heightId + ply : toOptionalNumber(production.height, rawItem.hOd, rawItem.heightOd);
    const width = isNumber(widthId) && isNumber(ply) ? widthId + ply : toOptionalNumber(production.breadth, rawItem.wOd, rawItem.widthOd);
    const length = isNumber(lengthId) && isNumber(ply) ? lengthId + ply : toOptionalNumber(production.length, rawItem.lOd, rawItem.lengthOd);
    const part = firstText(rawItem.part, rawItem.noOfParts, production.noOfParts);
    const boardGsm = toOptionalNumber(production.boardGsmReq, production.gsm, rawItem.boardGsmReq, rawItem.gsm, rawItem.calculatedBGsm, rawItem.standardBGsm);
    setEditForm((prev) => calculateBoardLineForm({ ...prev, jobNo, partyName, itemName, erp, heightOd: height, width, length, ply, part, typeOfFlute: firstText(production.flute, production.fluteType, rawItem.flute), boardGsm, sheetWeightGrams: toOptionalNumber(production.sheetWeight, rawItem.sheetWeightGrams, rawItem.calculatedWeightPerBox), planQty: toOptionalNumber(production.plannedQty, production.qty, rawItem.planQty, rawItem.orderQuantity), printingArtwork: firstText(rawItem.artwork, rawItem.artworkUpload, prev.printingArtwork) }, settings[0]));
  };

  const updateEditField = (key: keyof BoardLineQcCheck, value: string | number | "") => {
    setEditForm((prev) => calculateBoardLineForm({ ...prev, [key]: value }, settings[0]));
  };

  const saveEdit = async () => {
    const filledFields = getChunkFilledFields(editForm as Record<string, unknown>, [...BOARDLINE_CHUNK_FIELD_KEYS]);
    if (!editingRow || !hasFormValue(editForm.jobNo) || !hasFormValue(editForm.checkNo) || filledFields.length === 0) {
      alert("Job No., Check No., and at least one QC field are required.");
      return;
    }
    setIsSaving(true);
    try {
      const updatedBy = currentUserDisplayName(user);
      const updated = buildPayload({
        ...editForm,
        checkNo: String(editForm.checkNo || "").trim(),
        qcPerson: String(editForm.qcPerson || "").trim(),
        qcFormType: editForm.qcFormType || "boardline",
        groupKey: editForm.groupKey || createQcGroupKey("boardline", editForm.jobNo, editForm.checkNo),
        chunkNo: editForm.chunkNo || 1,
        chunkStatus: editForm.chunkStatus || "Draft",
        filledFields,
        createdBy: editForm.createdBy || updatedBy,
        createdTimestamp: editForm.createdTimestamp || new Date().toISOString(),
      }, updatedBy, settings[0], editingRow.id);
      await setChecks((prev) => prev.map((row) => (row.id === editingRow.id ? updated : row)));
      setEditingRow(null);
      setEditForm({});
      setEditSelectedProductionId("");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGroupStatus = async (group: BoardLineQcGroup) => {
    if (!canManage) return;
    const nextStatus: QcChunkStatus = group.groupStatus === "Complete" ? "Draft" : "Complete";
    const updatedBy = currentUserDisplayName(user);
    const updateTimestamp = new Date().toISOString();
    await setChecks((prev) => prev.map((row) => getQcGroupKey(row, "boardline") === group.groupKey ? { ...row, chunkStatus: nextStatus, updatedBy, updateTimestamp } : row));
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, jobFilter, partyFilter, qcPersonFilter, warningFilter, pageSize]);

  const filterOptions = useMemo(
    () => ({
      jobs: uniqueOptions(checks.map((row) => row.jobNo)),
      parties: uniqueOptions(checks.map((row) => row.partyName)),
      qcPeople: uniqueOptions(checks.map((row) => row.qcPerson)),
    }),
    [checks]
  );

  const rows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const filteredChunks = [...checks]
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || "").getTime() || 0;
        const timeB = new Date(b.timestamp || "").getTime() || 0;
        return timeB - timeA;
      })
      .filter((row) => {
        const warning = hasAnyWarning([
          row.systemAutoCorrection1,
          row.systemAutoCorrection2,
          row.systemAutoCorrection3,
          row.systemAutoCorrection4,
          row.systemAutoCorrection5,
        ]);
        if (jobFilter && String(row.jobNo) !== jobFilter) return false;
        if (partyFilter && String(row.partyName) !== partyFilter) return false;
        if (qcPersonFilter && String(row.qcPerson) !== qcPersonFilter) return false;
        if (warningFilter === "With Warning" && !warning) return false;
        if (warningFilter === "No Warning" && warning) return false;
        if (!search) return true;
        return [
          row.bqcNo,
          row.jobNo,
          row.partyName,
          row.itemName,
          row.checkNo,
          row.samplingCheckNo,
          row.erp,
          row.qcPerson,
          row.boardlineRemarks,
          row.systemAutoCorrection1,
          row.systemAutoCorrection2,
          row.systemAutoCorrection3,
          row.systemAutoCorrection4,
          row.systemAutoCorrection5,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });
    return groupBoardLineChecks(filteredChunks);
  }, [checks, jobFilter, partyFilter, qcPersonFilter, searchTerm, warningFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 text-black">
      <div className="space-y-4 border-b border-black pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold uppercase tracking-tight text-black">Board Line QC Master</h2>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search BQC, job, party, item, ERP..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded border border-black py-2 pl-10 pr-4 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Select compact value={jobFilter} onChange={setJobFilter} options={filterOptions.jobs.map((value) => ({ value, label: value }))} placeholder="Job No." noOptionsMessage="No matching job no."/>
          <Select compact value={partyFilter} onChange={setPartyFilter} options={filterOptions.parties.map((value) => ({ value, label: value }))} placeholder="Party Name" noOptionsMessage="No matching party name"/>
          <Select compact value={qcPersonFilter} onChange={setQcPersonFilter} options={filterOptions.qcPeople.map((value) => ({ value, label: value }))} placeholder="QC Person" noOptionsMessage="No matching qc person"/>
          <select value={warningFilter} onChange={(event) => setWarningFilter(event.target.value)} className="rounded border border-black p-2 text-sm">
            <option>All</option>
            <option>With Warning</option>
            <option>No Warning</option>
          </select>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border border-black p-2 text-sm">
            {[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} / page</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse divide-y divide-black border border-black">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top min-w-[110px] whitespace-nowrap">Date</th>
                {masterColumns.map((column) => (
                  <th key={String(column.key)} className={masterHeaderClass(column.key)}>
                    {column.label}
                  </th>
                ))}
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top whitespace-nowrap">Chunks</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top whitespace-nowrap">Status</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top min-w-[160px]">QC People</th>
                <th className="border border-black px-3 py-2 text-left text-xs font-bold uppercase text-black align-top">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {loading ? (
                <tr><td colSpan={masterColumns.length + 5} className="px-6 py-8 text-center text-black">Loading QC checks...</td></tr>
              ) : pagedRows.length === 0 ? (
                <tr><td colSpan={masterColumns.length + 5} className="px-6 py-8 text-center font-medium italic text-black">No Board Line QC checks found.</td></tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="divide-x divide-black transition-colors hover:bg-slate-50">
                    <td className="border border-black px-3 py-2 text-sm text-black align-top min-w-[110px] whitespace-nowrap">{formatDate(row.timestamp)}</td>
                    {masterColumns.map((column) => (
                      <td key={String(column.key)} className={masterCellClass(column.key)}>
                        {column.key === "timestamp" ? formatTime(row.timestamp) : displayValue(row[column.key])}
                      </td>
                    ))}
                    <td className="border border-black px-3 py-2 text-sm text-black align-top">{row.chunkCount}</td>
                    <td className="border border-black px-3 py-2 text-sm font-bold text-black align-top">{row.groupStatus}</td>
                    <td className="border border-black px-3 py-2 text-sm text-black align-top">{row.qcPeople.join(", ") || "-"}</td>
                    <td className="border border-black px-3 py-2 text-sm text-black align-top whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => setHistoryGroup(row)} className="rounded border border-black px-2 py-1 font-bold">History</button>
                        {canManage ? <button type="button" onClick={() => openEdit(row.chunks[row.chunks.length - 1])} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 font-bold text-white"><Edit size={14} />Edit</button> : null}
                        {canManage ? <button type="button" onClick={() => void toggleGroupStatus(row)} className="rounded bg-emerald-700 px-2 py-1 font-bold text-white">{row.groupStatus === "Complete" ? "Reopen" : "Complete"}</button> : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-black p-3 text-sm md:flex-row md:items-center md:justify-between">
          <span>Showing {rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Previous</button>
            <span>Page {currentPage} / {totalPages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit Board Line QC">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded border-2 border-black bg-white p-5 text-black shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-black pb-3">
              <h3 className="text-lg font-black uppercase">Edit Board Line QC</h3>
              <button type="button" onClick={() => setEditingRow(null)} className="rounded border border-black px-3 py-1 font-bold">Close</button>
            </div>
            {formSections.map((section) => (
              <section key={section.title} className="mb-6 space-y-3">
                <h4 className="border-b border-black pb-1 text-sm font-black uppercase tracking-wide">{section.title}</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.fields.map((field) => {
                    const label = <label className="font-bold text-black text-sm">{field.label} {field.required ? <span className="text-red-600">*</span> : null}</label>;
                    if (field.key === "jobNo") return <div key={String(field.key)} className="flex flex-col space-y-1">{label}<Select options={[...editJobOptions, ...(editForm.jobNo && (!editSelectedProductionId || !editJobOptions.some((option) => option.value === editSelectedProductionId)) ? [{ value: editSelectedProductionId || "__legacy__", label: String(editForm.jobNo) }] : [])]} value={editSelectedProductionId || (editForm.jobNo ? "__legacy__" : "")} onChange={handleEditJobSelect} required placeholder="Search and select job no..." wrapLabels /></div>;
                    if (field.key === "checkNo" || field.key === "qcPerson" || field.key === "typeOfFlute") return <div key={String(field.key)} className="flex flex-col space-y-1">{label}<Select options={field.key === "checkNo" ? [...CHECK_NO_OPTIONS, ...(editForm.checkNo && !CHECK_NO_OPTIONS.some((option) => option.value === String(editForm.checkNo)) ? [{ value: String(editForm.checkNo), label: `${editForm.checkNo} (Legacy)` }] : [])] : field.key === "typeOfFlute" ? FLUTE_OPTIONS : editQcPersonOptions} value={String(editForm[field.key] || "")} onChange={(value) => updateEditField(field.key, value)} required={field.required} placeholder="Choose" /></div>;
                    return <FieldInput key={String(field.key)} field={field} value={editForm[field.key]} onChange={updateEditField} />;
                  })}
                </div>
              </section>
            ))}
            <div className="mt-5 flex justify-end gap-2 border-t border-black pt-4">
              <button type="button" onClick={() => setEditingRow(null)} className="rounded border border-black px-4 py-2 font-bold">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={isSaving || !hasFormValue(editForm.jobNo) || !hasFormValue(editForm.checkNo) || getChunkFilledFields(editForm as Record<string, unknown>, [...BOARDLINE_CHUNK_FIELD_KEYS]).length === 0} className="rounded bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50">{isSaving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {historyGroup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Board Line QC chunk history">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded border-2 border-black bg-white p-5 text-black shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-black pb-3">
              <h3 className="text-lg font-black uppercase">Chunk History · Job {displayValue(historyGroup.jobNo)} · Check {displayValue(historyGroup.checkNo)}</h3>
              <button type="button" onClick={() => setHistoryGroup(null)} className="rounded border border-black px-3 py-1 font-bold">Close</button>
            </div>
            <div className="space-y-3">
              {historyGroup.chunks.map((chunk) => (
                <div key={chunk.id} className="rounded border border-black p-3">
                  <div className="flex flex-wrap justify-between gap-2 font-bold">
                    <span>Chunk {chunk.chunkNo || "Legacy"} · {chunk.qcPerson || "-"}</span>
                    <span>{chunk.chunkStatus || "Draft"} · {formatDate(chunk.updateTimestamp || chunk.timestamp)}</span>
                  </div>
                  <div className="mt-2 text-sm">Fields: {chunk.filledFields?.join(", ") || "Legacy record / fields not tagged"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}





