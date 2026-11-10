import type { ReactNode } from "react";
import { Plus } from "lucide-react";

// Master pages: title on the left, a "+ Add …" button on the right. On phones
// the app's top bar shows that button as a + icon (mobilePageHeader), so the
// label must start with "Add".
export function MasterHeader({ title, addLabel, onAdd, children }: { title: ReactNode; addLabel?: string; onAdd?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase tracking-tight text-black">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            title={addLabel}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-black bg-indigo-600 px-3 text-xs font-black uppercase text-white hover:bg-indigo-700"
          >
            <Plus size={16} strokeWidth={3} /> {addLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
