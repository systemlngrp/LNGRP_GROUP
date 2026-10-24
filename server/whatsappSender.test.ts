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
    const payload = buildWhatsappPayload({ loginId: "login", pass: "secret", groupId: "group@g.us", message: "Job {{lotNo}}" }, { ...complaint, photo2: "f6c8c4a6-b851-4e01-8361-a9fe3e71cdb5.png" }, "https://system.lngr.in");
    assert.deepEqual(payload, {
      recipientIds: ["group@g.us"],
      message: ["Job JOB/001"],
      filePathUrl: [
        "https://system.lngr.in/uploads/photo%20one.jpg",
        "https://system.lngr.in/uploads/f6c8c4a6-b851-4e01-8361-a9fe3e71cdb5.png",
      ],
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

  it("falls back to text-only delivery when photo delivery returns 424", async () => {
    const requests: RequestInit[] = [];
    const result = await sendWhatsappComplaintMessage(
      { loginId: "login", pass: "secret", groupId: "group@g.us", message: "Complaint {{lotNo}}" },
      complaint,
      {
        endpoint: "https://sender.test/message",
        fetchImpl: async (_url, init) => {
          requests.push(init);
          return requests.length === 1 ? new Response("attachment failed", { status: 424 }) : new Response("{}", { status: 200 });
        },
      },
    );
    assert.equal(result.status, "Sent");
    assert.equal(result.warning, "WhatsApp message sent, but photo attachments could not be delivered.");
    assert.equal(requests.length, 2);
    assert.match(String(requests[0].body), /filePathUrl/);
    assert.doesNotMatch(String(requests[1].body), /filePathUrl/);
  });

  it("keeps delivery failed when the 424 fallback also fails", async () => {
    let calls = 0;
    const result = await sendWhatsappComplaintMessage(
      { loginId: "login", pass: "secret", groupId: "group@g.us", message: "Complaint" },
      complaint,
      {
        endpoint: "https://sender.test/message",
        fetchImpl: async () => {
          calls += 1;
          return new Response(calls === 1 ? "attachment failed" : "text failed", { status: 424 });
        },
      },
    );
    assert.equal(result.status, "Failed");
    assert.equal(calls, 2);
    assert.match(result.error || "", /424/);
  });
});
