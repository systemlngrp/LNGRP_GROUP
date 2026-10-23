import React, { useMemo } from "react";
import { useData } from "../hooks/useData";
import { Firm } from "../types";
import { getFirmOptions } from "../lib/firmDisplay";
import { Select } from "./Select";

interface FirmFilterNoLabelProps {
  value: string;
  onChange: (firmId: string) => void;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

/** Searchable firm selector without a visual label above the control. */
export function FirmFilterNoLabel({
  value,
  onChange,
  placeholder = "Firms",
  compact = true,
  className = "min-w-[180px]",
}: FirmFilterNoLabelProps) {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const options = useMemo(() => getFirmOptions(firms), [firms]);

  return (
    <div className={className}>
      <Select compact={compact} value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </div>
  );
}
