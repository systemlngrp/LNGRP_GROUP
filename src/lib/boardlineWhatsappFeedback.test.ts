import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boardlineWhatsappSaveMessage } from "./boardlineWhatsappFeedback.js";

describe("Boardline WhatsApp save feedback", () => {
  it("explains a sanitized 401 without exposing credentials", () => {
    const message = boardlineWhatsappSaveMessage({ status: "Failed", error: "WhatsApp sender returned 401." });
    assert.match(message, /check saved/);
    assert.match(message, /authentication failed \(401\)/);
    assert.match(message, /update LoginID and Pass/);
  });

  it("keeps other failures retryable and acknowledges completed delivery", () => {
    assert.match(boardlineWhatsappSaveMessage({ status: "Failed", error: "WhatsApp sender returned 503." }), /retry automatically/);
    assert.match(boardlineWhatsappSaveMessage({ status: "Already Sent" }), /already sent/);
  });
});
