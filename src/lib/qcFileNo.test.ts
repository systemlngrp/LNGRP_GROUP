import assert from "node:assert/strict";
import test from "node:test";
import { fileNoOptions } from "./qcFileNo";
import type { QcFileNoMaster } from "../types";

const row = (id: string, fileNo: string, active: QcFileNoMaster["active"]): QcFileNoMaster => ({ id, fileNo, active });

test("returns only active File No. values for new entries", () => {
  assert.deepEqual(fileNoOptions([
    row("active", "F-100", "Yes"),
    row("inactive", "F-200", "No"),
  ]), [{ value: "F-100", label: "F-100", searchText: "F-100" }]);
});

test("adds an inactive or missing current File No. as a legacy option", () => {
  const options = fileNoOptions([row("active", "F-100", "Yes"), row("inactive", "F-200", "No")], "F-200");
  assert.equal(options[0].label, "F-200 (Legacy)");
  assert.equal(options[0].value, "F-200");
});
