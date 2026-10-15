export const dateKey = (value: unknown): string => {
  const raw = String(value ?? "").trim().slice(0, 10);
  const match = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    : raw.match(/^(\d{2})[-\/]?(\d{2})[-\/]?(\d{4})$/);
  if (!match) return "";
  const [year, month, day] = match[1].length === 4
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [Number(match[3]), Number(match[2]), Number(match[1])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
};

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const normalizeQcResult = (value: unknown): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["qc pass", "pass"].includes(normalized)) return "QC PASS";
  if (["qc fail", "fail", "qc hold", "hold"].includes(normalized)) return "QC FAIL";
  return String(value ?? "").trim();
};

export const jobDateCellClass = (value: unknown, now = new Date()): string => {
  const jobDate = dateKey(value);
  if (!jobDate) return "";
  const today = localDateKey(now);
  const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const background = jobDate < yesterday ? "bg-[#fff2cc]"
    : jobDate < today ? "bg-[#f4cccc]"
    : jobDate === today ? "bg-[#00ffff]"
    : "bg-[#cee1f2]";
  return `${background} text-slate-950 font-bold`;
};

export const jobNumberCellClass = (date: unknown, result: unknown, now = new Date()): string => {
  const normalizedResult = normalizeQcResult(result);
  if (["QC PASS", "QC FAIL"].includes(normalizedResult)) return "bg-[#006100] text-white font-bold";
  const jobDate = dateKey(date);
  if (jobDate && jobDate < localDateKey(now)) return "bg-[#ffff00] text-slate-950 font-bold";
  return jobDateCellClass(date, now);
};

export const qcResultCellClass = (result: unknown): string => ["QC PASS", "QC FAIL"].includes(normalizeQcResult(result)) ? "bg-[#006100] text-white font-bold" : "";

export const realizationCellClass = (value: unknown, target: unknown): string => {
  if (value == null || String(value).trim() === "" || target == null || String(target).trim() === "") return "";
  const realization = Number(value);
  const minimum = Number(target);
  if (!Number.isFinite(realization) || !Number.isFinite(minimum)) return "";
  if (realization < minimum) return "bg-[#ff0000] text-slate-950 font-bold";
  if (realization <= minimum + 6) return "bg-[#b6d7a8] text-slate-950 font-bold";
  return "bg-[#00ff00] text-slate-950 font-bold";
};
