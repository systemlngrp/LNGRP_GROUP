import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/utils";

const PendingTallyEntry = lazy(() => import("./PendingTallyEntry").then((module) => ({ default: module.PendingTallyEntry })));
const PendingCreditNote = lazy(() => import("./PendingCreditNote").then((module) => ({ default: module.PendingCreditNote })));
const PendingDebitNote = lazy(() => import("./PendingDebitNote").then((module) => ({ default: module.PendingDebitNote })));

const TABS = [
  { key: "mrr", label: "Pending MRR Tally Posting", href: "/material-receipt/pending-tally", Component: PendingTallyEntry },
  { key: "credit-note", label: "Credit Note Tally Posting", href: "/material-receipt/pending-credit-note", Component: PendingCreditNote },
  { key: "debit-note", label: "Debit Note Tally Posting", href: "/material-receipt/pending-debit-note", Component: PendingDebitNote },
] as const;

/** Store › Material Receipt › Tally Posting: MRR, credit note and debit note postings in tabs. */
export function TallyPosting() {
  const { hasAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter((tab) => hasAccess(tab.href));
  const requested = searchParams.get("tab");
  const active = tabs.find((tab) => tab.key === requested) || tabs[0];

  if (!active) {
    return <p className="p-4 text-sm font-semibold text-slate-600">You do not have access to any Tally Posting tab.</p>;
  }
  const ActiveComponent = active.Component;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tally posting type">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active.key === tab.key}
            onClick={() => setSearchParams(tab.key === "mrr" ? {} : { tab: tab.key }, { replace: true })}
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border-2 px-3 py-2 text-sm font-bold transition",
              active.key === tab.key ? "border-indigo-700 bg-indigo-700 text-white" : "border-black bg-white text-black hover:bg-slate-50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="p-4 text-sm font-semibold text-slate-600">Loading…</div>}>
        <ActiveComponent key={active.key} />
      </Suspense>
    </div>
  );
}
