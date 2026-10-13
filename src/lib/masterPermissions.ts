export function canManageMasterRecords(role: unknown): boolean {
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "qc manager";
}
