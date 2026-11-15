const toNumber = (value) => {
    if (value === null || value === undefined || value === "")
        return null;
    const num = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
    return Number.isFinite(num) ? num : null;
};
export function parseSalesTargetPayload(body) {
    const fields = ["targetPerDay", "revisedTargetPerDay", "achievedPerDay", "shortSales"];
    const values = {};
    for (const field of fields) {
        const num = toNumber(body[field]);
        if (num === null)
            return { error: `${field} must be a number.` };
        values[field] = Math.round(num * 100) / 100;
    }
    const reportDate = String(body.reportDate ?? "").trim().slice(0, 10);
    if (reportDate && !/^\d{4}-\d{2}-\d{2}$/.test(reportDate))
        return { error: "reportDate must be YYYY-MM-DD." };
    const source = String(body.source ?? "Sales Analysis").trim().slice(0, 80) || "Sales Analysis";
    return { ...values, reportDate, source };
}
