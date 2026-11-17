import { getFirmDisplayName } from "../lib/firmDisplay";

type FirmLike = { id: string; firmName?: string; shortName?: string };

// Unit-I / Unit-II firms show as "UNIT 1" / "UNIT 2"; others by short name (e.g. LNKI).
export function firmTabLabel(firm: FirmLike) {
  const name = String(firm.firmName || "").toUpperCase();
  if (/UNIT[\s-]*(II|2)\b/.test(name)) return "UNIT 2";
  if (/UNIT[\s-]*(I|1)\b/.test(name)) return "UNIT 1";
  return getFirmDisplayName(firm);
}

function tabOrder(label: string) {
  return label === "UNIT 1" ? 0 : label === "UNIT 2" ? 1 : 2;
}

export function orderedFirmTabs(firms: FirmLike[]) {
  return firms
    .map((firm) => ({ id: String(firm.id), label: firmTabLabel(firm), name: String(firm.firmName || "") }))
    .sort((a, b) => tabOrder(a.label) - tabOrder(b.label) || a.label.localeCompare(b.label));
}

// "All" + one tab per firm, each with its row count. value "" = All.
export function FirmTabs({ firms, counts, value, onChange }: {
  firms: FirmLike[];
  counts: Map<string, number>;
  value: string;
  onChange: (firmId: string) => void;
}) {
  const tabs = orderedFirmTabs(firms);
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const tab = (id: string, label: string, count: number, title?: string) => {
    const active = value === id;
    return (
      <button
        key={id || "all"}
        type="button"
        title={title}
        onClick={() => onChange(id)}
        className={`rounded-t border-2 border-b-0 border-black px-4 py-2 text-sm font-black uppercase tracking-wide ${active ? "bg-indigo-700 text-white" : "bg-white text-black hover:bg-indigo-50"}`}
      >
        {label} <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${active ? "bg-white text-indigo-700" : "bg-slate-200 text-black"}`}>{count.toLocaleString()}</span>
      </button>
    );
  };
  return (
    <div className="flex flex-wrap gap-1 border-b-2 border-black" role="tablist">
      {tab("", "All", total)}
      {tabs.map((firm) => tab(firm.id, firm.label, counts.get(firm.id) || 0, firm.name))}
    </div>
  );
}

export function countByFirm<T>(rows: T[], getFirmId: (row: T) => unknown) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const id = String(getFirmId(row) ?? "").trim();
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}
