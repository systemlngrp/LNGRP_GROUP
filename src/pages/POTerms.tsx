import { useMemo, useState } from "react";
import { Save, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import type { MaterialGroup } from "../types";
import type { PoTerms } from "../lib/poTerms";

// PO Terms: terms & conditions printed at the end of the PO PDF, one set per Material Group.
// A PO takes the terms of its first item's material group.

export function POTerms() {
  const { user } = useAuth();
  const [groups, , groupsLoading] = useData<MaterialGroup>("material-groups", [], { firmScope: "all" });
  const [records, , termsLoading, api] = useData<PoTerms>("po-terms", [], { firmScope: "all" });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const byGroup = useMemo(() => new Map(records.map((record) => [String(record.materialGroupId || record.id), record])), [records]);
  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [...groups]
      // Reel first, then the other groups A-Z.
      .sort((a, b) => {
        const reel = (name: unknown) => (String(name || "").trim().toLowerCase() === "reel" ? 0 : 1);
        return reel(a.name) - reel(b.name) || String(a.name).localeCompare(String(b.name));
      })
      .filter((group) => words.every((word) => `${group.name} ${byGroup.get(group.id)?.terms || ""}`.toLowerCase().includes(word)));
  }, [byGroup, groups, search]);

  const textFor = (groupId: string) => drafts[groupId] ?? byGroup.get(groupId)?.terms ?? "";
  const changed = (groupId: string) => drafts[groupId] !== undefined && drafts[groupId] !== (byGroup.get(groupId)?.terms ?? "");

  const save = async (group: MaterialGroup) => {
    const existing = byGroup.get(group.id);
    const record: PoTerms = {
      id: existing?.id || group.id,
      materialGroupId: group.id,
      materialGroupName: group.name,
      terms: textFor(group.id).trim(),
      updatedBy: String(user?.name || user?.email || "System User"),
      updateTimestamp: new Date().toISOString(),
    };
    setBusyId(group.id);
    setMessage("");
    try {
      if (existing) await api.saveItem(record); else await api.addItem(record);
      setDrafts((current) => { const next = { ...current }; delete next[group.id]; return next; });
      setMessage(`PO Terms saved for ${group.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save PO Terms.");
    } finally {
      setBusyId("");
    }
  };

  const loading = groupsLoading || termsLoading;
  return (
    <div className="space-y-4 text-black">
      <div className="border-b-2 border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight">PO Terms</h2>
        <p className="text-sm font-semibold text-slate-600">Terms &amp; conditions for each Material Group. A PO shows the terms of its first item's group at the end of the PO PDF.</p>
      </div>
      {message ? <div className="rounded border-2 border-indigo-700 bg-indigo-50 p-3 text-sm font-bold">{message}</div> : null}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search material group or terms" className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-600" />
      </div>
      {loading && !groups.length ? <p className="font-semibold">Loading…</p> : null}
      {!loading && !groups.length ? <p className="rounded border-2 border-black bg-white p-4 font-semibold">No material groups yet. Add them in Material Group master first.</p> : null}
      <div className="space-y-3">
        {rows.map((group) => {
          const record = byGroup.get(group.id);
          return (
            <section key={group.id} className="rounded border-2 border-black bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black uppercase">{group.name}</h3>
                <span className="text-xs font-semibold text-slate-500">{record?.updateTimestamp ? `Last saved by ${record.updatedBy || "-"} on ${String(record.updateTimestamp).slice(0, 10).split("-").reverse().join("-")}` : "No terms yet"}</span>
              </div>
              <textarea
                value={textFor(group.id)}
                onChange={(event) => setDrafts((current) => ({ ...current, [group.id]: event.target.value }))}
                rows={Math.min(14, Math.max(4, textFor(group.id).split("\n").length + 1))}
                placeholder={"One term per line, e.g.\n1. Delivery within 7 days of PO.\n2. Payment 30 days from receipt of material."}
                className="w-full rounded border-2 border-black bg-yellow-50 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="mt-2 flex justify-end">
                <button type="button" disabled={!changed(group.id) || busyId === group.id} onClick={() => save(group)} className="inline-flex items-center gap-1 rounded border-2 border-black bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  <Save size={14} /> {busyId === group.id ? "Saving…" : "Save"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
