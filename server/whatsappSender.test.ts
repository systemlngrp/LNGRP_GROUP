import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPhotoUrl, buildWhatsappPayload, resolveWhatsappTemplate, sendWhatsappComplaintMessage } from "./whatsappSender.js";

const complaint = {
  id: "QC-1792839256252-tolgrr",
  dateOfComplaint: "2026-10-24",
  lotNo: "JOB/001",
  partyName: "Acme",
  itemName: "Box",
  erpCode: "ERP-1",
  natureOfComplaint: "Complaint",
  quantity: 25,
  areaOfIssue: "Printing",
  issueDetails: "Ink shade mismatch",
  photo1: "a6194171-dfbf-4267-a44f-0f138517d3d0.png",
  photo2: "76827876-7b77-4459-9d10-67b488a66ce6.png",
};

const config = { loginId: "login", pass: "secret", groupId: "group@g.us", message: "No {{complaintNo}} {{lotNo}} {{photo1}}" };

describe("WhatsApp complaint sender", () => {
  it("resolves the Complaint No. and never prints photo URLs in the message", () => {
    const message = resolveWhatsappTemplate("{{complaintNo}} {{partyName}} {{photo1}} {{photo2}}", complaint, "https://system.lngr.in/");
    assert.equal(message, "QC-1792839256252-tolgrr Acme  ");
  });

  it("builds separate text and photo payloads", () => {
    assert.deepEqual(buildWhatsappPayload(config, complaint, "https://system.lngr.in", "text"), {
      recipientIds: ["group@g.us"],
      message: ["No QC-1792839256252-tolgrr JOB/001 "],
    });
    assert.deepEqual(buildWhatsappPayload(config, complaint, "https://system.lngr.in", "photo1"), {
      recipientIds: ["group@g.us"],
      message: [""],
      filePathUrl: ["https://system.lngr.in/uploads/a6194171-dfbf-4267-a44f-0f138517d3d0.png"],
    });
    assert.equal(buildPhotoUrl(complaint.photo2, "https://system.lngr.in"), "https://system.lngr.in/uploads/76827876-7b77-4459-9d10-67b488a66ce6.png");
  });

  it("sends text, Photo 1, then Photo 2 in order without exposing credentials", async () => {
    const requests: RequestInit[] = [];
    const result = await sendWhatsappComplaintMessage(config, complaint, {
      endpoint: "https://sender.test/message",
      fetchImpl: async (_url, init) => {
        requests.push(init);
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(result.status, "Sent");
    assert.equal(requests.length, 3);
    assert.doesNotMatch(String(requests[0].body), /filePathUrl/);
    assert.match(String(requests[1].body), /a6194171-dfbf-4267-a44f-0f138517d3d0/);
    assert.match(String(requests[2].body), /76827876-7b77-4459-9d10-67b488a66ce6/);
    assert.equal((requests[0].headers as Record<string, string>).Authorization, `Basic ${Buffer.from("login:secret").toString("base64")}`);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });

  it("does not send photos when the text stage fails", async () => {
    let calls = 0;
    const result = await sendWhatsappComplaintMessage(config, complaint, {
      endpoint: "https://sender.test/message",
      fetchImpl: async () => {
        calls += 1;
        return new Response("text failed", { status: 500 });
      },
    });
    assert.equal(result.status, "Failed");
    assert.equal(result.failedStage, "text");
    assert.equal(calls, 1);
  });

  it("reports the failed photo stage after text succeeds", async () => {
    let calls = 0;
    const result = await sendWhatsappComplaintMessage(config, complaint, {
      endpoint: "https://sender.test/message",
      fetchImpl: async () => {
        calls += 1;
        return new Response(calls === 2 ? "photo failed" : "{}", { status: calls === 2 ? 424 : 200 });
      },
    });
    assert.equal(result.status, "Failed");
    assert.equal(result.failedStage, "photo1");
    assert.equal(calls, 2);
  });

  it("skips missing photos", async () => {
    const requests: RequestInit[] = [];
    const result = await sendWhatsappComplaintMessage(config, { ...complaint, photo1: "", photo2: "" }, {
      endpoint: "https://sender.test/message",
      fetchImpl: async (_url, init) => {
        requests.push(init);
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(result.status, "Sent");
    assert.equal(requests.length, 1);
  });
});
