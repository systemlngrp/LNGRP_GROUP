import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPhotoUrl, buildWhatsappBoardlinePayload, buildWhatsappPayload, buildWhatsappPrintingPayload, resolveWhatsappBoardlineTemplate, resolveWhatsappPrintingTemplate, resolveWhatsappTemplate, sendWhatsappBoardlineMessage, sendWhatsappComplaintMessage, sendWhatsappPrintingMessage } from "./whatsappSender.js";

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
    const message = resolveWhatsappTemplate("{{complaintNo}} {{partyName}} {{photo1}} {{photo2}}", complaint, "https://system.lngrp.in/");
    assert.equal(message, "QC-1792839256252-tolgrr Acme  ");
  });

  it("builds separate text and photo payloads", () => {
    assert.deepEqual(buildWhatsappPayload(config, complaint, "https://system.lngrp.in", "text"), {
      recipientIds: ["group@g.us"],
      message: ["No QC-1792839256252-tolgrr JOB/001 "],
    });
    assert.deepEqual(buildWhatsappPayload(config, complaint, "https://system.lngrp.in", "photo1"), {
      recipientIds: ["group@g.us"],
      message: [""],
      filePathUrl: ["https://system.lngrp.in/uploads/a6194171-dfbf-4267-a44f-0f138517d3d0.png"],
    });
    assert.equal(buildPhotoUrl(complaint.photo2, "https://system.lngrp.in"), "https://system.lngrp.in/uploads/76827876-7b77-4459-9d10-67b488a66ce6.png");
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

  it("resolves and sends the Boardline QC template", async () => {
    const boardline = {
      jobNo: "10626",
      partyName: "HOMTEK INDIA AGRO INDUSTRIES",
      itemName: "CHITTCHORE RICE BRAN OIL 700 GM",
      erp: "99970092",
      samplingPlanQty: 3,
      samplingCheckNo: "1 / 3",
      standard: "114 - 253 - 114",
      flapHeightFlapOperatorSide: "114-253-114",
      flapHeightFlapDriveSide: "114-253-114",
      cuttingSizeRequired: 1086,
      cuttingSizeMm: 1085,
      boardGsm: 442,
      typeOfFlute: "B",
      boardThickness: 3.15,
      moisture: "6.8-7.7%",
      sheetWeightGrams: 0,
      boardlineRemarks: "Ok",
      qcPerson: "Nabajyoti",
      printingArtwork: "https://drive.google.com/file/d/example/view",
    };
    const template = "Job {{jobNo}} {{partyName}} {{samplingCheckNo}} {{printingArtwork}}";
    const boardlineConfig = { ...config, message: template };
    const message = resolveWhatsappBoardlineTemplate(template, boardline);
    assert.match(message, /10626/);
    assert.match(message, /1 \/ 3/);
    assert.match(message, /drive.google.com/);
    assert.deepEqual(buildWhatsappBoardlinePayload(boardlineConfig, boardline), {
      recipientIds: ["group@g.us"],
      message: [message],
    });
    let request: RequestInit | undefined;
    const result = await sendWhatsappBoardlineMessage(boardlineConfig, boardline, {
      endpoint: "https://sender.test/message",
      fetchImpl: async (_url, init) => {
        request = init;
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(result.status, "Sent");
    assert.doesNotMatch(String(request?.body), /secret/);
  });

  it("returns a safe 401 failure and permits a later Boardline retry", async () => {
    let attempts = 0;
    const boardlineConfig = { ...config, message: "Job {{jobNo}}" };
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      return new Response("credential details should stay private", { status: attempts === 1 ? 401 : 200 });
    };
    const first = await sendWhatsappBoardlineMessage(boardlineConfig, { jobNo: "10626" }, { fetchImpl });
    const second = await sendWhatsappBoardlineMessage(boardlineConfig, { jobNo: "10626" }, { fetchImpl });
    assert.deepEqual(first, { status: "Failed", httpStatus: 401, error: "WhatsApp sender returned 401." });
    assert.equal(second.status, "Sent");
    assert.ok(second.sentAt);
    assert.equal(attempts, 2);
    assert.doesNotMatch(JSON.stringify([first, second]), /secret|credential details/);
  });

  it("resolves and sends the Printing QC template with artwork as text", async () => {
    const printing = {
      jobNo: "10612",
      partyName: "BRITANNIA INDUSTRIES LIMITED",
      itemName: "CBB 5PLY MARIE GOLD EAST 384G 2011199",
      erp: "99970074",
      samplingPlanQty: 3,
      samplingCheckNo: "1 / 3",
      standardBoxSize: "401 x 260 x 330",
      boxSizeAchieved: "400 x 257 x 334",
      csStandard: 244,
      bsStandard: 10.56,
      bsAchieved: 7.5,
      boardThicknessBefore: 7.08,
      boardThickness: 5.04,
      boxWeightGrams: 562,
      printingColor1Standard: "Black",
      colour1Actual: "BLACK",
      standardArtwork: "https://drive.google.com/file/d/example/view",
      qcPerson: "Sahil",
      operatorName: "Shah Alam",
    };
    const template = "{{jobNo}} {{partyName}} {{samplingCheckNo}} {{standardBoxSize}} {{standardArtwork}} {{operatorName}}";
    const printingConfig = { ...config, message: template };
    const message = resolveWhatsappPrintingTemplate(template, printing);
    assert.match(message, /10612/);
    assert.match(message, /1 \/ 3/);
    assert.match(message, /drive.google.com/);
    assert.deepEqual(buildWhatsappPrintingPayload(printingConfig, printing), {
      recipientIds: ["group@g.us"],
      message: [message],
    });
    let request: RequestInit | undefined;
    const result = await sendWhatsappPrintingMessage(printingConfig, printing, {
      endpoint: "https://sender.test/message",
      fetchImpl: async (_url, init) => {
        request = init;
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(result.status, "Sent");
    assert.doesNotMatch(String(request?.body), /filePathUrl/);
    assert.doesNotMatch(String(request?.body), /secret/);
  });
});
