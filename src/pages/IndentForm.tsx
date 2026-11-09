import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "../hooks/useData";
import { Firm, Indent, IndentLine, Material, User } from "../types";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";

import { summarizeIndentLines } from "../lib/indentTotals";
import { getFirmDisplayName } from "../lib/firmDisplay";

type EditableIndentLine = {
  id: string;
  materialId: string;
  qty: number | "";
  targetDeliveryDate: string;
};

function createEmptyLine(): EditableIndentLine {
  return {
    id: crypto.randomUUID(),
    materialId: "",
    qty: "",
    targetDeliveryDate: "",
  };
}

function getIndentLineUom(indentType: Indent["indentType"], material?: Material | null) {
  return indentType === "Reel" ? "Kgs" : material?.uom || "";
}

// Some item names already start with their ERP code ("11105814 - Size: …");
// the ERP shows separately, so it is left out of the name in the item list.
function stripErpPrefix(name: string, erpCode?: string | number | null) {
  const erp = String(erpCode ?? "").trim();
  if (!erp) return name;
  const pattern = new RegExp(`^\\s*${erp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–:]\\s*`);
  return name.replace(pattern, "") || name;
}

export function IndentForm() {

  const navigate = useNavigate();
  const [indents, setIndents] = useData<Indent>("indents", []);
  const [indentLines, setIndentLines] = useData<IndentLine>("indent-lines", []);
  const [materials] = useData<Material>("materials", []);
  const [users] = useData<User>("users", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });

  const firmOptions = useMemo(
    () => firms.slice().sort((a, b) => a.firmName.localeCompare(b.firmName)),
    [firms]
  );

  const [requestedBy, setRequestedBy] = useState("");
  const [requisitionDate, setRequisitionDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [indentType, setIndentType] = useState<Indent["indentType"]>("Reel");
  const [lines, setLines] = useState<EditableIndentLine[]>([createEmptyLine()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const selectedFirm = firms.find((firm) => firm.id === selectedFirmId);

  const activeMaterials = useMemo(
    () => materials.filter((material) => material.active !== "No" && material.type === indentType),
    [indentType, materials]
  );

  const requestedByOptions = useMemo(() => {
    const userOptions = users
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((user) => ({ value: user.name, label: user.name }));

    return userOptions.length > 0 ? userOptions : [{ value: "System", label: "System" }];
  }, [users]);

  useEffect(() => {
    if (!requestedBy) {
      setRequestedBy(requestedByOptions[0]?.value || "System");
    }
  }, [requestedBy, requestedByOptions]);

  const materialOptions = activeMaterials
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((material) => ({
      value: material.id,
      // Name only (the ERP shows in its own column); typing an ERP still finds it.
      label: stripErpPrefix(material.name, material.erpCode),
      searchText: `${material.erpCode || ""} ${material.name}`,
    }));

  const handleLineChange = (lineId: string, field: "materialId" | "qty" | "targetDeliveryDate", value: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [field]: field === "qty" ? (value === "" ? "" : Number(value)) : value,
              ...(field === "materialId" && !line.targetDeliveryDate && requisitionDate ? { targetDeliveryDate: requisitionDate } : {}),
            }
          : line
      )
    );
  };

  // Adds a new empty line just below the given line.
  const handleAddRowAfter = (lineId: string) => {
    setLines((prev) => {
      const index = prev.findIndex((line) => line.id === lineId);
      const next = [...prev];
      next.splice(index < 0 ? next.length : index + 1, 0, createEmptyLine());
      return next;
    });
  };

  const handleRemoveRow = (lineId: string) => {
    setLines((prev) => (prev.length === 1 ? [createEmptyLine()] : prev.filter((line) => line.id !== lineId)));
  };

  const handleTypeChange = (value: Indent["indentType"]) => {
    setIndentType(value);
    setLines([createEmptyLine()]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedFirmId || !selectedFirm || !requestedBy.trim() || !requisitionDate) {
      alert("Firm, Requested By and Requisition Date are required.");
      return;
    }

    const validLines = lines.filter((line) => line.materialId && Number(line.qty) > 0);
    if (validLines.length === 0 || validLines.length !== lines.length) {
      alert("Please select a material and enter a quantity greater than 0 for every row.");
      return;
    }

    const missingMaterials = validLines.some((line) => !activeMaterials.find((material) => material.id === line.materialId));
    if (missingMaterials) {
      alert("One or more selected materials are no longer available for the chosen indent type.");
      return;
    }

    setIsSubmitting(true);
    const timestamp = new Date().toISOString();
    const indentId = crypto.randomUUID();

    const nextLines: IndentLine[] = validLines.map((line) => {
      const material = activeMaterials.find((row) => row.id === line.materialId) as Material;
      return {
        id: crypto.randomUUID(),
        indentId,
        erpCode: material.erpCode,
        materialId: material.id,
        uom: getIndentLineUom(indentType, material),
        qty: Number(line.qty),
        targetDeliveryDate: (line.targetDeliveryDate || requisitionDate || "").trim() || undefined,
        orderedQty: 0,
        cancelledQty: 0,
        balanceQty: Number(line.qty),
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
    });
    const totals = summarizeIndentLines(nextLines);

    const nextIndent: Indent = {
      id: indentId,
      firmId: selectedFirmId,
      firmName: selectedFirm.firmName,
      requestedBy: requestedBy.trim(),
      requisitionDate,
      requiredDate: requisitionDate,
      indentType,
      status: "Pending",
      totalIndentQty: totals.totalIndentQty,
      totalOrderedQty: totals.totalOrderedQty,
      totalCancelledQty: totals.totalCancelledQty,
      totalBalanceQty: totals.totalBalanceQty,
      updatedBy: "System User",
      updateTimestamp: timestamp,
    };

    try {
      await setIndents([nextIndent, ...indents]);
      await setIndentLines([...indentLines, ...nextLines]);
      setRequestedBy(requestedByOptions[0]?.value || "System");
      setRequisitionDate(new Date().toISOString().split("T")[0]);
      setIndentType("Reel");
      setLines([createEmptyLine()]);
      alert("Indent saved successfully.");
    } catch (error) {
      console.error("Failed to save indent:", error);
      alert("Failed to save indent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>

      <div className="bg-white rounded-xl border border-black p-6 shadow-sm space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">New Indent</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-blue-700 font-bold">Firm <span className="text-red-500">*</span></label>
            <select
              value={selectedFirmId}
              onChange={(event) => setSelectedFirmId(event.target.value)}
              required
              className="w-full rounded border-2 border-black bg-white px-4 py-3 font-bold text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              aria-label="Firm"
            >
              <option value="">Select firm...</option>
              {firmOptions.map((firm) => (
                <option key={firm.id} value={firm.id}>{getFirmDisplayName(firm)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-blue-700 font-bold">
              Requested By <span className="text-red-500">*</span>
            </label>
            <Select
              options={requestedByOptions}
              value={requestedBy}
              onChange={setRequestedBy}
              required
              placeholder="Select user..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-blue-700 font-bold">
              Requisition Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={requisitionDate}
              onChange={(e) => setRequisitionDate(e.target.value)}
              required
              className="w-full rounded border-2 border-black px-4 py-3 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-blue-700 font-bold">
            Indent Type <span className="text-red-500">*</span>
          </label>
          <select
            value={indentType}
            onChange={(e) => handleTypeChange(e.target.value as Indent["indentType"])}
            required
            className="w-full rounded border-2 border-black px-4 py-3 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          >
            <option value="Reel">Reel</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="rounded-xl border border-black overflow-hidden">
          <div className="px-4 py-3 border-b border-black bg-slate-50">
            <h3 className="text-sm font-bold uppercase tracking-tight text-blue-700">Items</h3>
          </div>

          {/* Desktop: a header row over the lines (ERP, Item, Unit, Qty, Target Delivery, icons). Phones: each line is a card. */}
          <div className={`hidden md:grid md:grid-cols-[110px_minmax(0,1fr)_70px_110px_150px_88px] gap-2 bg-indigo-700 px-3 py-2 text-sm font-bold text-white`}>
            <div>ERP</div>
            <div>Select Item <span className="text-red-200">*</span></div>
            <div>Unit</div>
            <div className="text-right">Qty <span className="text-red-200">*</span></div>
            <div>Target Delivery</div>
            <div />
          </div>
          <div className="divide-y divide-black">
            {lines.map((line) => {
              const material = activeMaterials.find((row) => row.id === line.materialId);
              const unit = getIndentLineUom(indentType, material);
              return (
                <div key={line.id} className="grid grid-cols-2 gap-2 bg-white p-3 md:grid-cols-[110px_minmax(0,1fr)_70px_110px_150px_88px] md:items-center">
                  <div className="hidden truncate font-semibold text-black md:block" title={material?.erpCode ? String(material.erpCode) : ""}>
                    {material?.erpCode ? String(material.erpCode) : "—"}
                  </div>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <Select
                      options={materialOptions}
                      value={line.materialId}
                      onChange={(value) => handleLineChange(line.id, "materialId", value)}
                      onAdd={() => navigate("/masters/materials?new=1")}
                      wrapLabels
                      placeholder={activeMaterials.length === 0 ? "No material available..." : "Select Item..."}
                    />
                  </div>
                  {/* Phones: ERP and unit as one small line under the item. */}
                  <div className="col-span-2 -mt-1 text-xs font-semibold text-slate-600 md:hidden">
                    {material ? `ERP ${material.erpCode || "—"}${unit ? ` · ${unit}` : ""}` : null}
                  </div>
                  <div className="hidden truncate text-black md:block">{unit || "—"}</div>
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-bold text-blue-700 md:hidden">Qty <span className="text-red-500">*</span></span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.qty}
                      onChange={(e) => handleLineChange(line.id, "qty", e.target.value)}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-right text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-bold text-blue-700 md:hidden">Target Delivery</span>
                    <input
                      type="date"
                      value={line.targetDeliveryDate}
                      onChange={(e) => handleLineChange(line.id, "targetDeliveryDate", e.target.value)}
                      className="w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                    />
                  </label>
                  <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(line.id)}
                      className="indent-line-action inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-red-300 bg-white text-red-600 hover:bg-red-50 transition"
                      title="Remove row"
                      aria-label="Remove row"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddRowAfter(line.id)}
                      className="indent-line-action inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-indigo-600 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                      title="Add row"
                      aria-label="Add row"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center min-w-[160px] rounded bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {isSubmitting ? <Spinner size={20} className="text-white" /> : "Save"}
          </button>
        </div>
      </form>
    </div>
    </>
  );
}
