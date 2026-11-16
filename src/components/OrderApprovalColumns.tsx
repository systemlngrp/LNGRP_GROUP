import React from "react";
import type { Order } from "../types";
import { formatDate } from "../lib/serial";

// Why an order was (or was not) auto-approved, as the server recorded it when the
// rate/RAPC rule ran (server/orderApproval.ts). Shown at the end of the order tables.

export const ORDER_APPROVAL_COLUMN_COUNT = 5;

const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

const ref = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  // "INV/26-27/01 (2026-10-28)" -> show the date as dd-mm-yyyy
  const formatted = text.replace(/\((\d{4}-\d{2}-\d{2})\)/, (_m, d) => `(${formatDate(d)})`);
  return <div className="text-[11px] text-slate-500">{formatted}</div>;
};

export function OrderApprovalHeaders({ thClassName }: { thClassName: string }) {
  return (
    <>
      <th className={thClassName}>Approved By</th>
      <th className={thClassName}>Last Billing Rate</th>
      <th className={thClassName}>Benchmark (₹/kg)</th>
      <th className={thClassName}>Last RAPC</th>
      <th className={thClassName}>Approval Reason</th>
    </>
  );
}

export function OrderApprovalCells({ order, tdClassName }: { order: Order; tdClassName: string }) {
  const approvedBy = String(order.approvedEmail ?? "").trim();
  const approvedAt = String(order.approvedTimestamp ?? "").trim();
  return (
    <>
      <td className={tdClassName}>
        {approvedBy || "-"}
        {approvedAt ? <div className="text-[11px] text-slate-500">{formatDate(approvedAt.slice(0, 10))}</div> : null}
      </td>
      <td className={`${tdClassName} text-right`}>
        {num(order.approvalLastBillingRate) || "-"}
        {ref(order.approvalLastBillingRef)}
      </td>
      <td className={`${tdClassName} text-right`}>{num(order.approvalBenchmark) || "-"}</td>
      <td className={`${tdClassName} text-right`}>
        {num(order.approvalLastRapc) || "-"}
        {ref(order.approvalRapcRef)}
      </td>
      <td className={`${tdClassName} min-w-[220px] whitespace-normal break-words`}>{order.approvalReason || "-"}</td>
    </>
  );
}
