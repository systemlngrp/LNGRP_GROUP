import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SYSTEM_ROLES, normalizeSystemRoles, parseSystemRoles } from "./userRoles";

test("normalizes custom roles, removes duplicates, and excludes TruckDriver", () => {
  assert.deepEqual(normalizeSystemRoles(["Operator", "admin", "Manager", "manager", "TruckDriver", "Unknown"]), ["Admin", "Manager", "Operator", "Unknown"]);
});

test("falls back to the default roles for missing, invalid, or empty settings", () => {
  assert.deepEqual(parseSystemRoles(undefined), DEFAULT_SYSTEM_ROLES);
  assert.deepEqual(parseSystemRoles("not-json"), DEFAULT_SYSTEM_ROLES);
  assert.deepEqual(parseSystemRoles(JSON.stringify([])), DEFAULT_SYSTEM_ROLES);
});

test("parses a configured role list", () => {
  assert.deepEqual(parseSystemRoles(JSON.stringify(["Employee", "Manager", "Admin"])), ["Admin", "Employee", "Manager"]);
});

test("rejects empty and overlong role names", () => {
  assert.deepEqual(normalizeSystemRoles(["", "This role name is definitely too long"]), []);
});
