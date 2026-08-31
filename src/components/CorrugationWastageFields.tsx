import type { Production } from "../types";
import {
  buildCorrugationWastageValues,
  type CorrugationWastageDraft,
  type CorrugationWastageInputKey,
} from "../lib/corrugationWastage";

const BOX_FIELDS: Array<{ key: CorrugationWastageInputKey; label: string; kgKey?: "warpageKg" | "delaminationKg" | "misalignmentKg" | "sheerCutterKg" }> = [
  { key: "warpageBoxes", label: "Warpage (Boxes)", kgKey: "warpageKg" },
  { key: "delaminationBoxes", label: "Delamination (Boxes)", kgKey: "delaminationKg" },
  { key: "misalignmentBoxes", label: "Misalignment (Boxes)", kgKey: "misalignmentKg" },
  { key: "sheerCutterBoxes", label: "Sheer Cutter (Boxes)", kgKey: "sheerCutterKg" },
  { key: "noHisabBoxes", label: "No Hisab (Boxes)" },
];

export function CorrugationWastageFields({
  draft,
  production,
  onChange,
  compact = false,
}: {
  draft: CorrugationWastageDraft;
  production?: Production | null;
  onChange: (key: CorrugationWastageInputKey, value: string) => void;
  compact?: boolean;
}) {
  const calculated = buildCorrugationWastageValues(draft, production);
  const inputClass = "w-full rounded border border-black bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none";
  return (
    <div className={compact ? "grid min-w-[680px] grid-cols-3 gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
      {BOX_FIELDS.map((field) => (
        <label key={field.key} className="space-y-1 text-xs font-bold text-black">
          <span className="block uppercase">{field.label}</span>
          <input type="number" min="0" step="0.01" value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} className={inputClass} />
          {field.kgKey ? <span className="block text-right text-[11px] text-indigo-700">{calculated[field.kgKey].toFixed(2)} KG</span> : null}
        </label>
      ))}
      <label className="space-y-1 text-xs font-bold text-black">
        <span className="block uppercase">2PLY &amp; Paper (KG)</span>
        <input type="number" min="0" step="0.01" value={draft.twoPlyPaperKg} onChange={(event) => onChange("twoPlyPaperKg", event.target.value)} className={inputClass} />
      </label>
      <label className="space-y-1 text-xs font-bold text-black">
        <span className="block uppercase">Deckel Wastage (KG)</span>
        <input type="number" min="0" step="0.01" value={draft.deckelWastageKg} onChange={(event) => onChange("deckelWastageKg", event.target.value)} className={inputClass} />
      </label>
    </div>
  );
}
