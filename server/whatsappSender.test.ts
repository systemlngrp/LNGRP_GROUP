import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWhatsappPayload, resolveWhatsappTemplate, sendWhatsappComplaintMessage } from "./whatsappSender.js";

const complaint = {
  dateOfComplaint: "2026-10-24",
  lotNo: "JOB/001",
  partyName: "Acme",
  itemName: "Box",
  erpCode: "ERP-1",
  natureOfComplaint: "Complaint",
  quantity: 25,
  areaOfIssue: "Printing",
  issueDetails: "Ink shade mismatch",
  photo1: "photo one.jpg",
};

describe("WhatsApp complaint sender", () => {
  it("resolves complaint placeholders and photo URLs", () => {
    const message = resolveWhatsappTemplate("{{partyName}} {{quantity}} {{photo1}} {{photo2}}", complaint, "https://system.lngr.in/");
    assert.equal(message, "Acme 25 https://system.lngr.in/uploads/photo%20one.jpg ");
  });

  it("builds the Message Auto Sender payload", () => {
    const payload = buildWhatsappPayload({ loginId: "login", pass: "secret", groupId: "group@g.us", message: "Job {{lotNo}}" }, complaint, "https://system.lngr.in");
    assert.deepEqual(payload, {
      recipientIds: ["group@g.us"],
      message: ["Job JOB/001"],
      filePathUrl: ["https://system.lngr.in/uploads/photo%20one.jpg"],
    });
  });

  it("sends with Basic Auth without exposing credentials in the result", async () => {
    let request: RequestInit | undefined;
    const result = await sendWhatsappComplaintMessage(
      { loginId: "login", pass: "secret", groupId: "group@g.us", message: "Hello" },
      complaint,
      {
        endpoint: "https://sender.test/message",
        fetchImpl: async (_url, init) => {
          request = init;
          return new Response("{}", { status: 200 });
        },
      },
    );
    assert.equal(result.status, "Sent");
    assert.equal((request?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("login:secret").toString("base64")}`);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
});
