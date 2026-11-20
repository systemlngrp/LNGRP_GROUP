/** Name of a user's shared Summary Sheet: "<full name>'s Dashboard" ("Atwar Rehman" -> "Atwar Rehman's Dashboard"). */
export function userDashboardName(user?: { name?: string | null; email?: string | null } | null) {
  const fullName = String(user?.name || "").trim().replace(/\s+/g, " ");
  const fromEmail = String(user?.email || "").split("@")[0].trim();
  const name = fullName || (fromEmail ? fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1) : "");
  return name ? `${name}'s Dashboard` : "Dashboard";
}
