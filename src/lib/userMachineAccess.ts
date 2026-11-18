import type { Machine } from "../types";
import { normalizeMachineName } from "./productionMachineNames";

type AccessUser = { id?: string | null; name?: string | null; role?: string | null } | null | undefined;

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
  }
  return [];
};

/** Is this user ticked on the machine (Machine Master operators / Users master machines)? */
export function isUserAssignedToMachine(machine: Machine, user: AccessUser) {
  if (!user) return false;
  const id = String(user.id || "");
  const name = norm(user.name);
  return (Boolean(id) && asList(machine.assignedOperatorIds).includes(id))
    || (Boolean(name) && asList(machine.assignedOperatorNames).some((entry) => norm(entry) === name));
}

/**
 * Machine names (normalized) a user may see in production screens, or null for all machines.
 * Admin sees all; a user with no machine ticked also sees all; otherwise only the ticked machines.
 */
export function getUserVisibleMachineNames(user: AccessUser, machines: Machine[]): Set<string> | null {
  if (!user || norm(user.role) === "admin") return null;
  const mine = machines.filter((machine) => isUserAssignedToMachine(machine, user));
  if (!mine.length) return null;
  return new Set(mine.map((machine) => normalizeMachineName(machine.name)));
}
