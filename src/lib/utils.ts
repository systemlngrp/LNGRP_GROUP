import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const takeUpFactorMap: Record<string, number> = {
  A: 1.5,
  B: 1.35,
  C: 1.42,
  E: 1.26,
  "B+C": 1.38,
  "B+E": 1.3,
};

export function calculateTakeUpFactor(flute?: string): number | "" {
  if (!flute) return "";
  const normalized = flute.toUpperCase().trim().replace(/\s+/g, "");
  return takeUpFactorMap[normalized] ?? "";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatNumber(value: number, abbreviate = true): string {
  const val = Number(value);
  if (isNaN(val)) return '0';
  
  if (abbreviate) {
    if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  }
  
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2
  }).format(val);
}

/** Formats display-only dates without converting date-only values across timezones. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return "-";

  if (typeof value === "string") {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));
      if (localDate.getFullYear() === Number(year) && localDate.getMonth() === Number(month) - 1 && localDate.getDate() === Number(day)) return `${day}-${month}-${year}`;
      return "-";
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}
