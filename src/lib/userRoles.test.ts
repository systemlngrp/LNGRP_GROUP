import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SYSTEM_ROLES, normalizeSystemRoles, parseSystemRoles } from "./userRoles";

test("normalizes supported roles, removes duplicates, and excludes TruckDriver", () => {
  assert.deepEqual(normalizeSystemRoles(["Operator", "Admin", "Operator", "TruckDriver", "Unknown"]), ["Admin", "Operator"]);
});

test("falls back to the default roles for missing, invalid, or empty settings", () => {
  assert.deepEqual(parseSystemRoles(undefined), DEFAULT_SYSTEM_ROLES);
  assert.deepEqual(parseSystemRoles("not-json"), DEFAULT_SYSTEM_ROLES);
  assert.deepEqual(parseSystemRoles(JSON.stringify([])), DEFAULT_SYSTEM_ROLES);
});

test("parses a configured role list", () => {
  assert.deepEqual(parseSystemRoles(JSON.stringify(["Employee", "Admin"])), ["Admin", "Employee"]);
});
