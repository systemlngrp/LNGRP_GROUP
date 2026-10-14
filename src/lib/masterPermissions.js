export function canManageMasterRecords(role) {
    const normalizedRole = String(role ?? "").trim().toLowerCase();
    return normalizedRole === "admin" || normalizedRole === "qc manager";
}
