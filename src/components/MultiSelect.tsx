import React from "react";
import ReactSelect, { MultiValue } from "react-select";

interface OptionType {
  value: string;
  label: string;
  searchText?: string;
}

/** Searchable multi-select in the same style as <Select compact>. Empty selection = All. */
export function MultiSelect({ options, value, onChange, placeholder = "All", id }: {
  options: OptionType[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const selected = value
    .map((entry) => options.find((option) => option.value === entry) || { value: entry, label: entry })
    .filter(Boolean);
  return (
    <ReactSelect<OptionType, true>
      inputId={id}
      isMulti
      value={selected}
      onChange={(next: MultiValue<OptionType>) => onChange(next.map((option) => option.value))}
      options={options}
      filterOption={(candidate, inputValue) => {
        const query = inputValue.trim().toLowerCase();
        if (!query) return true;
        const option = candidate.data as OptionType;
        return `${option.searchText || option.label}`.toLowerCase().includes(query);
      }}
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      isClearable
      isSearchable
      placeholder={placeholder}
      noOptionsMessage={() => "No items found"}
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      menuPosition="fixed"
      menuPlacement="auto"
      formatOptionLabel={(option, meta) =>
        meta.context === "menu" ? (
          <span className="flex items-center gap-2">
            <input type="checkbox" readOnly tabIndex={-1} checked={value.includes(option.value)} className="h-3.5 w-3.5 accent-indigo-600" />
            <span>{option.label}</span>
          </span>
        ) : option.label
      }
      styles={{
        control: (base, state) => ({
          ...base,
          borderWidth: "2px",
          borderColor: state.isFocused ? "#4f46e5" : "#000000",
          boxShadow: state.isFocused ? "0 0 0 1px #4f46e5" : "none",
          "&:hover": { borderColor: state.isFocused ? "#4f46e5" : "#000000" },
          padding: "0px",
          borderRadius: "0.25rem",
          minHeight: "34px",
          backgroundColor: "#ffffff",
        }),
        valueContainer: (base) => ({ ...base, padding: "1px 6px", gap: "2px" }),
        multiValue: (base) => ({ ...base, backgroundColor: "#e0e7ff", border: "1px solid #4f46e5", margin: "1px" }),
        multiValueLabel: (base) => ({ ...base, color: "#1e1b4b", fontSize: "11px", fontWeight: 700, padding: "1px 4px" }),
        multiValueRemove: (base) => ({ ...base, color: "#4f46e5", ":hover": { backgroundColor: "#c7d2fe", color: "#1e1b4b" } }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#f0f0ff" : "white",
          color: "black",
          fontSize: "12px",
          fontWeight: state.isSelected ? 700 : 500,
          padding: "7px 9px",
          cursor: "pointer",
        }),
        menu: (base) => ({ ...base, zIndex: 9999, border: "2px solid black", boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        placeholder: (base) => ({ ...base, color: "#64748b", fontSize: "12px", fontWeight: 600 }),
        input: (base) => ({ ...base, color: "#000000", fontSize: "12px" }),
        dropdownIndicator: (base) => ({ ...base, padding: "6px" }),
        clearIndicator: (base) => ({ ...base, padding: "6px" }),
      }}
    />
  );
}
