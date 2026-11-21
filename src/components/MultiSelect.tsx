import React, { useRef, useState } from "react";
import ReactSelect, { components, MenuListProps, MultiValue } from "react-select";

interface OptionType {
  value: string;
  label: string;
  searchText?: string;
}

const matchesSearch = (option: OptionType, inputValue: string) => {
  const query = inputValue.trim().toLowerCase();
  return !query || `${option.searchText || option.label}`.toLowerCase().includes(query);
};

// "Select all" / "Clear" links above the options. Select all takes the options shown
// (all of them, or the ones matching the typed search).
function MenuListWithActions(props: MenuListProps<OptionType, true>) {
  const { onSelectAll, onClearAll } = props.selectProps as unknown as { onSelectAll: (inputValue: string) => void; onClearAll: () => void };
  const keepOpen = (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-slate-50 px-2 py-1.5 text-[11px] font-black">
        <button type="button" onMouseDown={keepOpen} onClick={() => onSelectAll(props.selectProps.inputValue)} className="rounded px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-50">Select all</button>
        <button type="button" onMouseDown={keepOpen} onClick={onClearAll} className="rounded px-1.5 py-0.5 text-slate-700 hover:bg-slate-200">Clear</button>
      </div>
      <components.MenuList {...props}>{props.children}</components.MenuList>
    </>
  );
}

/**
 * Searchable multi-select in the same style as <Select compact>. Empty selection = All.
 * While the list is open, ticks are kept here and applied once when it closes, so the
 * page reloads once instead of after every tick. Removing a chip or ✕ applies at once.
 */
export function MultiSelect({ options, value, onChange, placeholder = "All", id }: {
  options: OptionType[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string[] | null>(null); // ticks while the list is open
  const draftRef = useRef<string[] | null>(null);
  const setDraftValues = (next: string[] | null) => { draftRef.current = next; setDraft(next); };
  const current = draft ?? value;
  const selected = current
    .map((entry) => options.find((option) => option.value === entry) || { value: entry, label: entry })
    .filter(Boolean);
  const sameValues = (a: string[], b: string[]) => a.length === b.length && a.every((entry, index) => entry === b[index]);
  const extraProps = {
    onSelectAll: (inputValue: string) => {
      const base = draftRef.current ?? value;
      const shown = options.filter((option) => matchesSearch(option, inputValue)).map((option) => option.value);
      setDraftValues([...base, ...shown.filter((entry) => !base.includes(entry))]);
    },
    onClearAll: () => setDraftValues([]),
  };
  return (
    <ReactSelect<OptionType, true>
      {...(extraProps as object)}
      inputId={id}
      isMulti
      value={selected}
      onChange={(next: MultiValue<OptionType>) => {
        const values = next.map((option) => option.value);
        if (draftRef.current !== null) setDraftValues(values);
        else onChange(values);
      }}
      onMenuOpen={() => setDraftValues(value)}
      onMenuClose={() => {
        const pending = draftRef.current;
        setDraftValues(null);
        if (pending && !sameValues(pending, value)) onChange(pending);
      }}
      components={{ MenuList: MenuListWithActions }}
      options={options}
      filterOption={(candidate, inputValue) => matchesSearch(candidate.data as OptionType, inputValue)}
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
            <input type="checkbox" readOnly tabIndex={-1} checked={current.includes(option.value)} className="h-3.5 w-3.5 accent-indigo-600" />
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
