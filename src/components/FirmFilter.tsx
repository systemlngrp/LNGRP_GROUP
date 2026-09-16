import React, { useMemo } from "react";
import { useData } from "../hooks/useData";
import { Firm } from "../types";
import { getFirmOptions } from "../lib/firmDisplay";
import { Select } from "./Select";

interface FirmFilterProps {
  value: string;
  onChange: (firmId: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

/** Searchable Firm Master selector. Its value is always an authoritative firm ID. */
export function FirmFilter({
  value,
  onChange,
  label = "Firm",
  placeholder = "All Firms",
  compact = true,
  className = "min-w-[180px]",
}: FirmFilterProps) {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const options = useMemo(() => getFirmOptions(firms), [firms]);

  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-black uppercase">{label}</label>
      <Select compact={compact} value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </div>
  );
}
