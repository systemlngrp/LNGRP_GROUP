import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWhatsappConfigPassword } from "./whatsappConfigPassword.js";

describe("WhatsApp configuration password", () => {
  it("preserves the stored password when an existing record is edited with Pass blank", () => {
    assert.deepEqual(resolveWhatsappConfigPassword("", "stored-secret"), {});
  });

  it("requires a real password for a new configuration", () => {
    assert.match(resolveWhatsappConfigPassword("", undefined).error || "", /required/);
    assert.deepEqual(resolveWhatsappConfigPassword("new-secret", undefined), { pass: "new-secret" });
  });

  it("rejects the display mask as a submitted password", () => {
    assert.match(resolveWhatsappConfigPassword("********", undefined).error || "", /masked value/);
    assert.match(resolveWhatsappConfigPassword("********", "stored-secret").error || "", /masked value/);
  });

  it("requires replacement when the stored password is already the display mask", () => {
    assert.match(resolveWhatsappConfigPassword("", "********").error || "", /must be replaced/);
    assert.deepEqual(resolveWhatsappConfigPassword("new-secret", "********"), { pass: "new-secret" });
  });
});
