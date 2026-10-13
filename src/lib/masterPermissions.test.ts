import assert from "node:assert/strict";
import { canManageMasterRecords } from "./masterPermissions";

assert.equal(canManageMasterRecords("Admin"), true);
assert.equal(canManageMasterRecords(" qc manager "), true);
assert.equal(canManageMasterRecords("Employee"), false);
assert.equal(canManageMasterRecords("QC Managerx"), false);
