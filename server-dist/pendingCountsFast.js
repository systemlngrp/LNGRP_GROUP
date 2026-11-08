// Fast "Pending Material Return" count for the Home page.
//
// Same rules as PENDING_MATERIAL_RETURN_COUNT_SQL, worked out on the server
// from three plain reads instead of one query whose joins took about 20 s:
// - each reel line is linked to its job by job id, else by job number (the
//   highest job id for that number), else keeps its own id;
// - an issued reel counts while its job is not cancelled, it weighs more than
//   0.004 kg, it has a packing slip or reel number, and no return line of the
//   same job (over 0.004 kg) has the same packing slip or the same reel number;
// - the result is the number of different jobs with such a reel.
// Text compares like the database (case, accents, trailing spaces ignored).
import { ck } from "./npdStockFast.js";
/** MySQL TRIM(): removes leading and trailing spaces only. */
function trimSpaces(value) {
    if (value === null || value === undefined)
        return null;
    return String(value).replace(/^ +| +$/g, "");
}
function nullIfEmpty(value) {
    return value === null || ck(value) === "" ? null : value;
}
export function countPendingMaterialReturnJobs(input) {
    const productionsById = new Map();
    for (const production of input.productions) {
        const key = ck(production.id);
        if (key === null)
            continue;
        const list = productionsById.get(key);
        if (list)
            list.push(production);
        else
            productionsById.set(key, [production]);
    }
    // JOB_NO_TO_PRODUCTION_SQL: job number -> highest job id.
    const jobIdByJobNo = new Map();
    const addJobKey = (jobNo, id) => {
        const trimmed = trimSpaces(jobNo);
        if (trimmed === null || ck(trimmed) === "" || id === null || id === undefined)
            return;
        const key = ck(trimmed.toLowerCase());
        const current = jobIdByJobNo.get(key);
        if (current === undefined || (ck(String(id)) > ck(current)))
            jobIdByJobNo.set(key, String(id));
    };
    for (const production of input.productions) {
        addJobKey(production.transactionNo, production.id);
        addJobKey(production.jobCardNo, production.id);
    }
    const resolveJobIds = (line) => {
        const direct = productionsById.get(ck(trimSpaces(line.productionId)) ?? "\u0000") || [];
        if (direct.length)
            return direct.map((production) => production.id);
        const byJobNo = jobIdByJobNo.get(ck(trimSpaces(line.jobNo)?.toLowerCase() ?? null) ?? "\u0000");
        return [byJobNo ?? nullIfEmpty(trimSpaces(line.productionId))];
    };
    const returnedSlips = new Set();
    const returnedReels = new Set();
    for (const line of input.returnReels) {
        if (!(Number(line.weightKg || 0) > 0.004))
            continue;
        for (const jobId of resolveJobIds(line)) {
            const job = ck(jobId);
            if (job === null)
                continue;
            const slip = trimSpaces(line.packingSlipId);
            if (slip !== null && ck(slip) !== "")
                returnedSlips.add(`${job}\u0001${ck(slip.toLowerCase())}`);
            const reel = trimSpaces(line.ourReelNo);
            if (reel !== null && ck(reel) !== "")
                returnedReels.add(`${job}\u0001${ck(reel.toLowerCase())}`);
        }
    }
    const pendingJobs = new Set();
    for (const line of input.issueReels) {
        if (!(Number(line.weightKg || 0) > 0.004))
            continue;
        const slip = trimSpaces(line.packingSlipId);
        const reel = trimSpaces(line.ourReelNo);
        const hasSlip = slip !== null && ck(slip) !== "";
        const hasReel = reel !== null && ck(reel) !== "";
        if (!hasSlip && !hasReel)
            continue;
        for (const jobId of resolveJobIds(line)) {
            const job = ck(jobId);
            if (job === null)
                continue;
            for (const production of productionsById.get(job) || []) {
                if (ck(production.status ?? "") === "cancelled")
                    continue;
                if (ck(production.cancelTimestamp ?? "") !== "")
                    continue;
                if (slip !== null && returnedSlips.has(`${job}\u0001${ck(slip.toLowerCase())}`))
                    continue;
                if (reel !== null && returnedReels.has(`${job}\u0001${ck(reel.toLowerCase())}`))
                    continue;
                pendingJobs.add(job);
            }
        }
    }
    return pendingJobs.size;
}
