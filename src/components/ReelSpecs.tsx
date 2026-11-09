import { useState } from "react";

// Reel material specs (GSM - BF - Size) shown as coloured chips on one line.
// Long text is cut with "…"; hover (desktop) or tap (phone) shows it in full.

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

/** Any text on one line: cut with "…", full text on hover or tap. */
export function OneLine({ text, className = "" }: { text?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const value = String(text ?? "").trim() || "-";
  return (
    <span
      title={value}
      onClick={() => setOpen((current) => !current)}
      className={`block max-w-full cursor-default ${open ? "whitespace-normal break-words" : "truncate whitespace-nowrap"} ${className}`}
    >
      {value}
    </span>
  );
}

export function ReelSpecs({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  const full = String(text || "").trim();
  const parts = full.split(/\s+[-/]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return <OneLine text={full} />;
  return (
    <span
      title={full}
      onClick={() => setOpen((current) => !current)}
      className={`block max-w-[300px] cursor-default ${open ? "whitespace-normal" : "truncate whitespace-nowrap"}`}
    >
      {parts.map((part, index) => {
        const [first, ...rest] = part.split(/\s+/);
        const label = [trimNumber(first), ...rest].join(" ");
        return <span key={index} className={`mr-1 inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-bold ${TONES[index % TONES.length]}`}>{label}</span>;
      })}
    </span>
  );
}
