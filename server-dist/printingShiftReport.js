export const PRINTING_SHIFT_MENU = "/reports/printing-shift";
/** Template before the machine-wise report (kept to update saved copies of it). */
export const PREVIOUS_PRINTING_SHIFT_MESSAGE = `*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`;
/** Machine-wise template before the send-date header (kept to update saved copies of it). */
export const PREVIOUS_MACHINE_PRINTING_SHIFT_MESSAGE = `*Printing Report ({{shiftHours}}) {{date}}*

{{machineLines}}

*Bobst Printer:* {{bobstQty}}
*Big Printer:* {{bigQty}}
*Small Printer:* {{smallQty}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`;
export const DEFAULT_PRINTING_SHIFT_MESSAGE = `*Printing Report – {{shift}} Shift {{sendDate}}*
({{shiftPeriod}})

{{machineLines}}

*Bobst Printer:* {{bobstQty}}
*Big Printer:* {{bigQty}}
*Small Printer:* {{smallQty}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`;
/** Printers of a Printing report, in message order. */
export const PRINTING_MACHINES = ["Bobst Printer", "Big Printer", "Small Printer"];
const NO_PRINTER = "Printer not selected";
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
/** A shift report is sent only on the day it falls due and within this time after it (no old dates later). */
export const PRINTING_SHIFT_SEND_WINDOW_MS = 3 * 3_600_000;
export function duePrintingShifts(activatedAt, now) {
    const due = [];
    const first = new Date(activatedAt.getTime() - 36 * 3_600_000);
    const start = indiaNowParts(first).date;
    const last = indiaNowParts(now).date;
    for (let day = Date.parse(`${start}T00:00:00Z`); day <= Date.parse(`${last}T00:00:00Z`); day += 86_400_000) {
        const shiftDate = new Date(day).toISOString().slice(0, 10);
        for (const shift of ["Day", "Night"]) {
            const end = shiftEndAt(shiftDate, shift);
            const dueAt = shiftDueAt(shiftDate, shift);
            // Only today's reports: due today (India time) and not more than 3 hours ago.
            // A send that kept failing is no longer retried for an older day.
            if (end.getTime() > activatedAt.getTime() &&
                dueAt.getTime() <= now.getTime() &&
                now.getTime() - dueAt.getTime() <= PRINTING_SHIFT_SEND_WINDOW_MS &&
                indiaNowParts(dueAt).date === indiaNowParts(now).date) {
                due.push({ shiftDate, shift });
            }
        }
    }
    return due;
}
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Date the report is sent (India): the shift date for Day, the next day for Night. */
export const printingShiftSendDate = (shiftDate, shift) => (shift === "Night" ? addDays(shiftDate, 1) : shiftDate);
/**
 * Only today's reports: last night's shift (sent 7:30 AM) and today's Day shift
 * (sent 7:30 PM), once due. Older shifts are never sent (a failed one retries
 * only until midnight).
 */
export function todaysDuePrintingShifts(activatedAt, now) {
    const today = indiaNowParts(now).date;
    const candidates = [
        { shiftDate: addDays(today, -1), shift: "Night" },
        { shiftDate: today, shift: "Day" },
    ];
    return candidates.filter(({ shiftDate, shift }) => shiftEndAt(shiftDate, shift).getTime() > activatedAt.getTime() && shiftDueAt(shiftDate, shift).getTime() <= now.getTime());
}
/** Last finished shift (WhatsApp Master "Send current"). */
export function latestFinishedPrintingShift(now) {
    const today = indiaNowParts(now).date;
    const candidates = [
        { shiftDate: today, shift: "Day" },
        { shiftDate: addDays(today, -1), shift: "Night" },
        { shiftDate: addDays(today, -1), shift: "Day" },
    ];
    return candidates.find(({ shiftDate, shift }) => shiftEndAt(shiftDate, shift).getTime() <= now.getTime()) || candidates[2];
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
const qtyText = (value) => amount(value, Number.isInteger(value) ? 0 : 2);
/** Output per printer (Bobst / Big / Small; reports saved before the printer was asked: "Printer not selected"). */
export function buildPrintingShiftByMachine(rows) {
    const groups = new Map();
    for (const row of rows) {
        const name = String(row.printingMachine ?? "").trim();
        const machine = PRINTING_MACHINES.includes(name) ? name : NO_PRINTER;
        groups.set(machine, [...(groups.get(machine) || []), row]);
    }
    return [...PRINTING_MACHINES, NO_PRINTER]
        .filter((machine) => groups.has(machine))
        .map((machine) => ({ machine, ...buildPrintingShiftSummary(groups.get(machine) || []) }));
}
export function renderPrintingShiftMessage(template, shiftDate, shift, rows) {
    const summary = buildPrintingShiftSummary(rows);
    const [year, month, day] = shiftDate.split("-");
    const ddmm = (date) => { const [y, m, d] = date.split("-"); return { short: `${d}/${m}`, full: `${d}/${m}/${y}` }; };
    const sendDate = printingShiftSendDate(shiftDate, shift);
    const values = {
        date: `${day}/${month}/${year}`,
        shiftHours: shift === "Day" ? "7 AM - 7 PM" : "7 PM - 7 AM",
        shift,
        // Sent date (today) in the header; the period shows which day's hours it covers.
        sendDate: ddmm(sendDate).full,
        shiftPeriod: shift === "Day" ? "7 AM – 7 PM" : `${ddmm(shiftDate).short} 7 PM – ${ddmm(sendDate).short} 7 AM`,
        jobLines: summary.jobs.length ? summary.jobs.map((job, index) => `${index + 1}. ${job.jobNo} | ${job.itemName} | ${qtyText(job.qty)}`).join("\n") : "No printing output recorded.",
        totalQty: qtyText(summary.totalQty),
        boxesPerHour: amount(summary.boxesPerHour, 2),
    };
    // Machine-wise: one block per printer with its jobs, total and boxes per hour.
    const byMachine = buildPrintingShiftByMachine(rows);
    values.machineLines = byMachine.length
        ? byMachine.map((group) => [
            `*🖨️ ${group.machine}* — ${qtyText(group.totalQty)} (${amount(group.boxesPerHour, 2)}/hr)`,
            ...group.jobs.map((job, index) => `${index + 1}. ${job.jobNo} | ${job.itemName} | ${qtyText(job.qty)}`),
        ].join("\n")).join("\n\n")
        : "No printing output recorded.";
    const machineQty = (machine) => qtyText(byMachine.find((group) => group.machine === machine)?.totalQty || 0);
    values.bobstQty = machineQty("Bobst Printer");
    values.bigQty = machineQty("Big Printer");
    values.smallQty = machineQty("Small Printer");
    return template.replace(/\{\{\s*(date|shiftHours|shift|sendDate|shiftPeriod|jobLines|machineLines|bobstQty|bigQty|smallQty|totalQty|boxesPerHour)\s*\}\}/g, (_, key) => values[key]);
}
