import React from "react";
import { MandatoryLabel } from "./Mandatory";

type Props = {
  plannedQty: number | null;
  alreadyCompletedQty: number | null;
  qty: string;
  onQtyChange: (value: string) => void;
  /** Printing on FG jobs: corrugated / printed / printing-wastage totals (null while loading). */
  printingLimit?: { corrugated: number; printed: number; wastage: number; corrugationComplete: boolean } | null;
  /** Printing entry marked Complete: printed + wastage must equal corrugated. */
  printingComplete?: boolean;
  /** Printing wastage boxes typed in this entry. */
  wastageNow?: number;
};

const readOnlyBox = "border-2 border-black rounded bg-slate-100 p-2 text-sm font-bold text-black text-right";

/** Planned Job Qty and Already Completed are read-only; Completed Now is this entry's quantity. */
export function ProcessingQtyFields({ plannedQty, alreadyCompletedQty, qty, onQtyChange, printingLimit, wastageNow = 0, printingComplete = false }: Props) {
  const showCorrugated = printingLimit !== undefined;
  const corrugatedBalance = printingLimit
    ? printingLimit.corrugated - printingLimit.printed - printingLimit.wastage - Number(qty || 0) - wastageNow
    : null;
  const balance = plannedQty === null || alreadyCompletedQty === null
    ? null
    : plannedQty - alreadyCompletedQty - Number(qty || 0);
  return (
    <div className={`order-6 grid grid-cols-1 gap-3 md:col-span-2 ${showCorrugated ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
      <div className="flex flex-col space-y-1">
        <span className="font-bold text-black text-sm">Planned Job Quantity</span>
        <div className={readOnlyBox}>{plannedQty === null ? "-" : plannedQty.toLocaleString()}</div>
      </div>
      {showCorrugated ? (
        <div className="flex flex-col space-y-1">
          <span className="font-bold text-black text-sm">Total Corrugated Quantity</span>
          <div className={readOnlyBox}>{printingLimit ? printingLimit.corrugated.toLocaleString() : "-"}</div>
        </div>
      ) : null}
      <div className="flex flex-col space-y-1">
        <span className="font-bold text-black text-sm">Already Completed</span>
        <div className={readOnlyBox}>{alreadyCompletedQty === null ? "-" : alreadyCompletedQty.toLocaleString()}</div>
      </div>
      {showCorrugated ? (
        <div className="flex flex-col space-y-1">
          <span className="font-bold text-black text-sm">Printing Wastage So Far</span>
          <div className={readOnlyBox}>{printingLimit ? printingLimit.wastage.toLocaleString() : "-"}</div>
        </div>
      ) : null}
      <div className="flex flex-col space-y-1">
        <MandatoryLabel label="Completed Now" required className="font-bold text-black text-sm" />
        <input
          type="number"
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
          min="0"
          required
          className="border-2 border-black rounded p-2 text-black text-right focus:outline-none focus:border-indigo-600"
        />
      </div>
      {balance !== null ? (
        <div className={`text-[11px] font-bold ${showCorrugated ? "sm:col-span-5" : "sm:col-span-3"} ${balance < 0 ? "text-red-700" : "text-slate-600"}`}>
          {balance < 0
            ? `Total will exceed the planned quantity by ${Math.abs(balance).toLocaleString()}.`
            : `Balance after this entry: ${balance.toLocaleString()}`}
        </div>
      ) : null}
      {corrugatedBalance !== null ? (
        <div className={`text-[11px] font-bold ${showCorrugated ? "sm:col-span-5" : "sm:col-span-3"} ${corrugatedBalance < 0 || (printingComplete && (corrugatedBalance > 0 || (printingLimit && !printingLimit.corrugationComplete))) ? "text-red-700" : printingComplete ? "text-emerald-700" : "text-slate-600"}`}>
          {corrugatedBalance < 0
            ? `Printed + wastage will exceed corrugated by ${Math.abs(corrugatedBalance).toLocaleString()}. Save will be blocked.`
            : printingComplete && printingLimit && !printingLimit.corrugationComplete
              ? "Corrugation Liner is not Complete yet. Printing can only be saved as In Progress."
              : printingComplete && corrugatedBalance > 0
                ? `Unaccounted: ${corrugatedBalance.toLocaleString()} boxes. For Complete, printed + wastage must equal corrugated. Save will be blocked.`
                : printingComplete
                  ? "All corrugated boxes accounted for."
                  : `Corrugated balance after this entry (printed + wastage): ${corrugatedBalance.toLocaleString()}`}
        </div>
      ) : null}
    </div>
  );
}
