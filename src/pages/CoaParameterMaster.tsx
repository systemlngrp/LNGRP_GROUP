import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { COA_PARAMETERS } from "../lib/coaParameters";
import { coaSheetTemplates } from "../lib/coaSheetTemplates";
import { coaParameterForLabel } from "../lib/coaParameters";
import { coaRowLabel } from "../lib/coa";

// COA Parameter Master: each COA parameter, where its standard and its observation come from,
// and the PASS / FAIL rule. Observations are real readings (PDI / Boardline QC / Printing QC)
// or typed by QC; nothing is generated.
export function CoaParameterMaster() {
  const [search, setSearch] = useState("");
  // Which company templates use each parameter.
  const usedBy = useMemo(() => {
    const map = new Map<string, Set<string>>();
    Object.entries(coaSheetTemplates()).forEach(([tab, layout]) => {
      layout.parameterRows.forEach((row) => {
        const parameter = coaParameterForLabel(coaRowLabel(row));
        if (!parameter) return;
        if (!map.has(parameter.code)) map.set(parameter.code, new Set());
        map.get(parameter.code)!.add(tab);
      });
    });
    return map;
  }, []);
  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return COA_PARAMETERS.filter((parameter) => {
      const haystack = [parameter.code, parameter.name, parameter.standard, parameter.observationLabel, parameter.passRule, ...(usedBy.get(parameter.code) || [])].join(" ").toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [search, usedBy]);
  const sourceClass = (label: string) => /^Typed/.test(label) ? "bg-amber-50 text-amber-900" : /^Same as/.test(label) ? "bg-slate-50" : "bg-emerald-50 text-emerald-900";
  return <div className="space-y-4">
    <div className="border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase tracking-tight text-black">COA Parameter Master</h2>
      <p className="text-sm font-semibold text-slate-600">Observations come from real readings or are typed by QC. Each observation is checked against its standard (PASS / FAIL) on the COA Form.</p>
    </div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search parameter, source or company" aria-label="Search parameters" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none" /></div>
    <div className="text-xs font-bold text-slate-600">{rows.length} of {COA_PARAMETERS.length} parameters · <span className="text-emerald-800">green = real reading</span> · <span className="text-amber-800">amber = typed by QC</span></div>
    <div className="overflow-x-auto rounded border border-black bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-cyan-800 text-left text-white"><tr>
          <th className="p-2">Code</th><th className="p-2">Parameter</th><th className="p-2">Standard</th><th className="p-2">Observation comes from</th><th className="p-2">PASS rule</th><th className="p-2">Used by templates</th>
        </tr></thead>
        <tbody>{rows.map((parameter) => <tr key={parameter.code} className="border-t border-black align-top">
          <td className="p-2 font-mono text-xs font-bold">{parameter.code}</td>
          <td className="p-2 font-bold">{parameter.name}</td>
          <td className="p-2">{parameter.standard}</td>
          <td className={`p-2 font-semibold ${sourceClass(parameter.observationLabel)}`}>{parameter.observationLabel}</td>
          <td className="p-2">{parameter.passRule}</td>
          <td className="p-2 text-xs">{[...(usedBy.get(parameter.code) || [])].join(", ") || "-"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
