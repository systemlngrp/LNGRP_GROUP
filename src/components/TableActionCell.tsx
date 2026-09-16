import type { ReactNode } from "react";

interface TableActionCellProps {
  children: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

/** Keeps table actions in one stable horizontal row. Context actions come first; standard actions use data-action ordering. */
export function TableActionCell({ children, align = "right", className = "" }: TableActionCellProps) {
  const alignment = align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  return (
    <div className={`table-action-cell inline-flex min-w-max flex-nowrap items-center gap-2 whitespace-nowrap ${alignment} ${className}`}>
      {children}
    </div>
  );
}
