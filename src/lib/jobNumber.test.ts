import { test } from "node:test";
import assert from "node:assert/strict";
import { displayJobNo, jobNoMatches } from "./jobNumber";

test("job numbers show the serial only", () => {
  assert.equal(displayJobNo("LNCB-2/JOB/26-27/11059"), "11059");
  assert.equal(displayJobNo("JOB/25-26/00123"), "123");
  assert.equal(displayJobNo("LNKI/JOB/26-27/11143"), "11143");
  assert.equal(displayJobNo("PHP/26-27/55"), "PHP/26-27/55");
  assert.equal(displayJobNo(""), "");
  assert.ok(jobNoMatches("LNCB-2/JOB/26-27/11059", "26-27/11059"));
  assert.ok(jobNoMatches("LNCB-2/JOB/26-27/11059", "11059"));
});
