export const SYSTEM_ROLES = ["Admin", "Employee", "Operator"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const DEFAULT_SYSTEM_ROLES: SystemRole[] = [...SYSTEM_ROLES];

export function normalizeSystemRoles(values: unknown): SystemRole[] {
  if (!Array.isArray(values)) return [];

  const allowed = new Set<string>(SYSTEM_ROLES);
  const unique = new Set<SystemRole>();
  values.forEach((value) => {
    const role = String(value || "").trim() as SystemRole;
    if (allowed.has(role)) unique.add(role);
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
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
