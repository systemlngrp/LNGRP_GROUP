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
  const normalizedResult = String(result ?? "").trim().toLowerCase();
  if (["qc pass", "pass"].includes(normalizedResult)) return "bg-[#b7e1cd] text-slate-950 font-bold";
  if (["qc hold", "hold", "qc fail", "fail"].includes(normalizedResult)) return "bg-[#f4cccc] text-slate-950 font-bold";
  const jobDate = dateKey(date);
  if (jobDate && jobDate < localDateKey(now)) return "bg-[#ffff00] text-slate-950 font-bold";
  return jobDateCellClass(date, now);
};
