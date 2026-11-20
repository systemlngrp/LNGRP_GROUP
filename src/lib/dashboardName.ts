/** Name of a user's shared Summary Sheet: "<first name> Dashboard" ("Atwar Rehman" -> "Atwar Dashboard"). */
export function userDashboardName(user?: { name?: string | null; email?: string | null } | null) {
  const first = String(user?.name || "").trim().split(/\s+/)[0] || String(user?.email || "").split("@")[0].trim();
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  return name ? `${name} Dashboard` : "Dashboard";
}
