import { PRINTING_WASTAGE_FIELDS, type PrintingWastageDraft, type PrintingWastageKey } from "../lib/printingWastage";

const LABELS: Record<PrintingWastageKey, string> = {
  slotting: "Slotting",
  delaminationPrinting: "Delamination Printing",
  misalignmentPrinting: "Misalignment Printing",
  drySheets: "Dry Sheets",
  warp: "Warp",
  misprinting: "Misprinting",
  jobSetting: "Job Setting",
};

export function PrintingWastageFields({
  draft,
  onChange,
  compact = false,
}: {
  draft: PrintingWastageDraft;
  onChange: (key: PrintingWastageKey, value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid min-w-[680px] grid-cols-4 gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
      {PRINTING_WASTAGE_FIELDS.map((key) => (
        <label key={key} className="space-y-1 text-xs font-bold text-black">
          <span className="block uppercase">{LABELS[key]} (Boxes)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft[key]}
            onChange={(event) => onChange(key, event.target.value)}
            className="w-full rounded border border-black bg-white px-2 py-1.5 text-right text-sm font-semibold outline-none"
          />
        </label>
      ))}
    </div>
  );
}
