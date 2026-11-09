// Reel material specs (GSM - BF - Size) shown as coloured chips.

function trimNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  const number = Number(text);
  return Number.isFinite(number) ? String(Number(number.toFixed(2))) : text;
}

export function formatReelSpecs(gsm: unknown, bf: unknown, size: unknown, uom?: unknown) {
  const unit = String(uom ?? "").trim();
  return `${trimNumber(gsm)} GSM - ${trimNumber(bf)} BF - ${trimNumber(size)}${unit ? ` ${unit}` : ""}`;
}

const TONES = [
  "border-indigo-300 bg-indigo-50 text-indigo-800",
  "border-emerald-300 bg-emerald-50 text-emerald-800",
  "border-amber-300 bg-amber-50 text-amber-900",
];

export function ReelSpecs({ text }: { text?: string | null }) {
  const parts = String(text || "").split(/\s+[-/]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return <>{text || "-"}</>;
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {parts.map((part, index) => {
        const [first, ...rest] = part.split(/\s+/);
        const label = [trimNumber(first), ...rest].join(" ");
        return <span key={index} className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-bold ${TONES[index % TONES.length]}`}>{label}</span>;
      })}
    </span>
  );
}
