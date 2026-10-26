export const QC_SCORE_MENU = "/quality/qc-score";
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export function validQcScoreDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function dateKey(value) {
    const raw = String(value ?? "").trim();
    if (validQcScoreDate(raw))
        return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return "";
    const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
function score(performed, required) {
    return required > 0 ? Number(((performed / required) * 100).toFixed(2)) : null;
}
export function buildQcScoreForDate(date, processing, boardlineChecks, printingChecks) {
    const boardlineJobs = new Set();
    const printingJobs = new Set();
    for (const entry of processing) {
        if (dateKey(entry.date) !== date || !(Number(entry.qty) > 0))
            continue;
        const job = String(entry.productionId || entry.jobNo || "").trim().toLowerCase();
        if (!job)
            continue;
        const machine = String(entry.machineName || "").trim().toLowerCase();
        if (machine === "corrugation liner" || machine === "corrugation linear")
            boardlineJobs.add(job);
        if (machine === "printing")
            printingJobs.add(job);
    }
    const boardlineChecksPerformed = boardlineChecks.filter((check) => dateKey(check.timestamp) === date).length;
    const printingChecksPerformed = printingChecks.filter((check) => dateKey(check.timestamp) === date).length;
    const boardlineChecksRequired = boardlineJobs.size;
    const printingChecksRequired = printingJobs.size;
    const totalChecksRequired = boardlineChecksRequired + printingChecksRequired;
    const totalChecksPerformed = boardlineChecksPerformed + printingChecksPerformed;
    return {
        date,
        boardlineChecksRequired,
        boardlineChecksPerformed,
        boardlineScore: score(boardlineChecksPerformed, boardlineChecksRequired),
        printingChecksRequired,
        printingChecksPerformed,
        printingScore: score(printingChecksPerformed, printingChecksRequired),
        totalChecksRequired,
        totalChecksPerformed,
        totalScore: score(totalChecksPerformed, totalChecksRequired),
    };
}
export function renderQcScoreWhatsappTemplate(template, row) {
    const [year, month, day] = row.date.split("-");
    const percent = (value) => value == null ? "N/A" : `${value.toFixed(2)}%`;
    const values = {
        date: `${day}/${month}/${year}`,
        boardlineChecksRequired: String(row.boardlineChecksRequired),
        boardlineChecksPerformed: String(row.boardlineChecksPerformed),
        boardlineScore: percent(row.boardlineScore),
        printingChecksRequired: String(row.printingChecksRequired),
        printingChecksPerformed: String(row.printingChecksPerformed),
        printingScore: percent(row.printingScore),
        totalChecksRequired: String(row.totalChecksRequired),
        totalChecksPerformed: String(row.totalChecksPerformed),
        totalScore: percent(row.totalScore),
    };
    return template.replace(/\{\{\s*(date|boardlineChecksRequired|boardlineChecksPerformed|boardlineScore|printingChecksRequired|printingChecksPerformed|printingScore|totalChecksRequired|totalChecksPerformed|totalScore)\s*\}\}/g, (_, key) => values[key]);
}
