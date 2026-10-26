export const PRINTING_SHIFT_MENU = "/reports/printing-shift";
export const DEFAULT_PRINTING_SHIFT_MESSAGE = `*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`;
const indiaDateParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function indiaNowParts(now) {
    const parts = Object.fromEntries(indiaDateParts.formatToParts(now).map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}
export function shiftEndAt(shiftDate, shift) {
    const midnightUtc = Date.parse(`${shiftDate}T00:00:00.000Z`);
    if (!Number.isFinite(midnightUtc))
        throw new Error("Invalid shift date.");
    return new Date(midnightUtc + (shift === "Day" ? 19 : 31) * 3_600_000 - 5.5 * 3_600_000);
}
export function shiftDueAt(shiftDate, shift) {
    return new Date(shiftEndAt(shiftDate, shift).getTime() + 30 * 60_000);
}
export function duePrintingShifts(activatedAt, now) {
    const due = [];
    const first = new Date(activatedAt.getTime() - 36 * 3_600_000);
    const start = indiaNowParts(first).date;
    const last = indiaNowParts(now).date;
    for (let day = Date.parse(`${start}T00:00:00Z`); day <= Date.parse(`${last}T00:00:00Z`); day += 86_400_000) {
        const shiftDate = new Date(day).toISOString().slice(0, 10);
        for (const shift of ["Day", "Night"]) {
            const end = shiftEndAt(shiftDate, shift);
            if (end.getTime() > activatedAt.getTime() && shiftDueAt(shiftDate, shift).getTime() <= now.getTime()) {
                due.push({ shiftDate, shift });
            }
        }
    }
    return due;
}
export function buildPrintingShiftSummary(rows) {
    const jobs = new Map();
    for (const row of rows) {
        const jobNo = String(row.jobNo ?? "").trim() || "Unknown";
        const name = String(row.itemName ?? "").trim() || "Unknown item";
        const qty = Number(row.qty ?? 0);
        if (!Number.isFinite(qty))
            continue;
        const current = jobs.get(jobNo);
        if (current) {
            current.qty += qty;
            if (current.itemName === "Unknown item" && name !== "Unknown item")
                current.itemName = name;
        }
        else
            jobs.set(jobNo, { jobNo, itemName: name, qty });
    }
    const sorted = [...jobs.values()].sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
    const totalQty = sorted.reduce((total, job) => total + job.qty, 0);
    return { jobs: sorted, totalQty, boxesPerHour: totalQty / 12 };
}
function amount(value, decimals = 0) {
    return value.toFixed(decimals);
}
export function renderPrintingShiftMessage(template, shiftDate, shift, rows) {
    const summary = buildPrintingShiftSummary(rows);
    const [year, month, day] = shiftDate.split("-");
    const values = {
        date: `${day}/${month}/${year}`,
        shiftHours: shift === "Day" ? "7 AM - 7 PM" : "7 PM - 7 AM",
        jobLines: summary.jobs.length ? summary.jobs.map((job, index) => `${index + 1}. ${job.jobNo} | ${job.itemName} | ${amount(job.qty, Number.isInteger(job.qty) ? 0 : 2)}`).join("\n") : "No printing output recorded.",
        totalQty: amount(summary.totalQty, Number.isInteger(summary.totalQty) ? 0 : 2),
        boxesPerHour: amount(summary.boxesPerHour, 2),
    };
    return template.replace(/\{\{\s*(date|shiftHours|jobLines|totalQty|boxesPerHour)\s*\}\}/g, (_, key) => values[key]);
}
