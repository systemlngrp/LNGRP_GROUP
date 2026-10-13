export const SYSTEM_ROLES = ["Admin", "Employee", "Operator"] as const;
export type SystemRole = string;
export const ROLE_NAME_MAX_LENGTH = 20;
export const RESERVED_ROLE = "TruckDriver";

export const DEFAULT_SYSTEM_ROLES: string[] = [...SYSTEM_ROLES];

export function normalizeSystemRoles(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const unique = new Map<string, string>();
  values.forEach((value) => {
    const rawRole = String(value || "").trim();
    const role = SYSTEM_ROLES.find((systemRole) => systemRole.toLowerCase() === rawRole.toLowerCase()) || rawRole;
    if (!role || role.length > ROLE_NAME_MAX_LENGTH || role.toLowerCase() === RESERVED_ROLE.toLowerCase()) return;
    const key = role.toLowerCase();
    if (!unique.has(key)) unique.set(key, role);
  });

  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function parseSystemRoles(raw: unknown): SystemRole[] {
  if (!raw) return [...DEFAULT_SYSTEM_ROLES];
  try {
    const parsed = JSON.parse(String(raw));
    const normalized = normalizeSystemRoles(parsed);
    return normalized.length > 0 ? normalized : [...DEFAULT_SYSTEM_ROLES];
  } catch {
    return [...DEFAULT_SYSTEM_ROLES];
  }
}
