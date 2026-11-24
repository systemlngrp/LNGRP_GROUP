import React from "react";
import { MandatoryLabel } from "./Mandatory";

type Props = {
  plannedQty: number | null;
  alreadyCompletedQty: number | null;
  qty: string;
  onQtyChange: (value: string) => void;
  /** Printing on FG jobs: total Corrugation Liner qty of the job (the printing limit). */
  corrugatedQty?: number | null;
};

const readOnlyBox = "border-2 border-black rounded bg-slate-100 p-2 text-sm font-bold text-black text-right";

/** Planned Job Qty and Already Completed are read-only; Completed Now is this entry's quantity. */
export function ProcessingQtyFields({ plannedQty, alreadyCompletedQty, qty, onQtyChange, corrugatedQty }: Props) {
  const showCorrugated = corrugatedQty !== undefined;
  const balance = plannedQty === null || alreadyCompletedQty === null
    ? null
    : plannedQty - alreadyCompletedQty - Number(qty || 0);
  return (
    <div className={`order-6 grid grid-cols-1 gap-3 md:col-span-2 ${showCorrugated ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      <div className="flex flex-col space-y-1">
        <span className="font-bold text-black text-sm">Planned Job Quantity</span>
        <div className={readOnlyBox}>{plannedQty === null ? "-" : plannedQty.toLocaleString()}</div>
      </div>
      {showCorrugated ? (
        <div className="flex flex-col space-y-1">
          <span className="font-bold text-black text-sm">Total Corrugated Quantity</span>
          <div className={readOnlyBox}>{corrugatedQty === null ? "-" : corrugatedQty.toLocaleString()}</div>
        </div>
      ) : null}
      <div className="flex flex-col space-y-1">
        <span className="font-bold text-black text-sm">Already Completed</span>
        <div className={readOnlyBox}>{alreadyCompletedQty === null ? "-" : alreadyCompletedQty.toLocaleString()}</div>
      </div>
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
        <div className={`text-[11px] font-bold ${showCorrugated ? "sm:col-span-4" : "sm:col-span-3"} ${balance < 0 ? "text-red-700" : "text-slate-600"}`}>
          {balance < 0
            ? `Total will exceed the planned quantity by ${Math.abs(balance).toLocaleString()}.`
            : `Balance after this entry: ${balance.toLocaleString()}`}
        </div>
      ) : null}
    </div>
  );
}
