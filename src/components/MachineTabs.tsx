import React from "react";

export type MachineTab = { value: string; label: string; count?: number };

/** Machine-wise tabs ("All" first). value "" = All. */
export function MachineTabs({ tabs, value, onChange, showAll = true, allCount }: { tabs: MachineTab[]; value: string; onChange: (value: string) => void; showAll?: boolean; allCount?: number }) {
  const items: MachineTab[] = [...(showAll ? [{ value: "", label: "All", count: allCount }] : []), ...tabs];
  if (items.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Machines" className="flex gap-1 overflow-x-auto border-b-2 border-black">
      {items.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value || "__all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`-mb-[2px] inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t border-2 px-4 py-2 text-xs font-black uppercase tracking-wide transition ${active ? "border-black border-b-white bg-white text-indigo-700" : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-black"}`}
          >
            {tab.label}
            {typeof tab.count === "number" ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-700"}`}>{tab.count.toLocaleString()}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
