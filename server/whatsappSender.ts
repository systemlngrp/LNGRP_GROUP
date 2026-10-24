export type WhatsappComplaintRecord = {
  id?: unknown;
  dateOfComplaint?: unknown;
  lotNo?: unknown;
  partyName?: unknown;
  itemName?: unknown;
  erpCode?: unknown;
  natureOfComplaint?: unknown;
  quantity?: unknown;
  areaOfIssue?: unknown;
  issueDetails?: unknown;
  photo1?: unknown;
  photo2?: unknown;
};

export type WhatsappSenderConfig = {
  loginId: string;
  pass: string;
  groupId: string;
  message: string;
};

export type WhatsappSendStage = "text" | "photo1" | "photo2";

export type WhatsappSendResult = {
  status: "Sent" | "Failed" | "Not Configured";
  error?: string;
  failedStage?: WhatsappSendStage;
  sentAt?: string;
};

export const WHATSAPP_COMPLAINT_MENU = "/quality/complaints/form";
export const MESSAGE_AUTO_SENDER_URL = "https://app.messageautosender.com/api/v1/message/create";
export const DEFAULT_QC_COMPLAINT_MESSAGE = `🚨 *QC Complaint Alert*

*Complaint No.:* {{complaintNo}}
*Complaint Date:* {{dateOfComplaint}}
*Job / Lot No.:* {{lotNo}}
*Party:* {{partyName}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Nature:* {{natureOfComplaint}}
*Quantity:* {{quantity}}
*Area:* {{areaOfIssue}}
*Issue Details:* {{issueDetails}}
*Photos:* Attached separately.

Please review this complaint and take the necessary action.`;

const text = (value: unknown) => String(value ?? "").trim();

export function resolveWhatsappTemplate(template: string, complaint: WhatsappComplaintRecord, appPublicUrl: string) {
  const values: Record<string, string> = {
    complaintNo: text(complaint.id),
    dateOfComplaint: text(complaint.dateOfComplaint),
    lotNo: text(complaint.lotNo),
    partyName: text(complaint.partyName),
    itemName: text(complaint.itemName),
    erpCode: text(complaint.erpCode),
    natureOfComplaint: text(complaint.natureOfComplaint),
    quantity: text(complaint.quantity),
    areaOfIssue: text(complaint.areaOfIssue),
    issueDetails: text(complaint.issueDetails),
    photo1: "",
    photo2: "",
  };
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildPhotoUrl(value: unknown, appPublicUrl: string) {
  const filename = text(value);
  if (!filename) return "";
  if (/^https?:\/\//i.test(filename)) return filename;
  return `${text(appPublicUrl).replace(/\/$/, "")}/uploads/${encodeURIComponent(filename)}`;
}

export function buildWhatsappPayload(config: WhatsappSenderConfig, complaint: WhatsappComplaintRecord, appPublicUrl: string, stage: WhatsappSendStage = "text") {
  const photoUrl = stage === "photo1"
    ? buildPhotoUrl(complaint.photo1, appPublicUrl)
    : stage === "photo2"
      ? buildPhotoUrl(complaint.photo2, appPublicUrl)
      : "";
  return {
    recipientIds: [text(config.groupId)],
    message: [stage === "text" ? resolveWhatsappTemplate(config.message, complaint, appPublicUrl) : ""],
    ...(photoUrl ? { filePathUrl: [photoUrl] } : {}),
  };
}

function safeErrorMessage(value: unknown) {
  const message = text(value).replace(/authorization\s*:\s*basic\s+[^\s]+/gi, "authorization: [redacted]");
  return message.slice(0, 500) || "WhatsApp sender request failed.";
}

export async function sendWhatsappComplaintStage(
  config: WhatsappSenderConfig,
  complaint: WhatsappComplaintRecord,
  stage: WhatsappSendStage,
  options: { appPublicUrl?: string; endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WhatsappSendResult> {
  const appPublicUrl = options.appPublicUrl || process.env.APP_PUBLIC_URL || "https://system.lngr.in";
  if (stage !== "text" && !buildPhotoUrl(stage === "photo1" ? complaint.photo1 : complaint.photo2, appPublicUrl)) {
    return { status: "Sent", sentAt: new Date().toISOString() };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const authorization = Buffer.from(`${config.loginId}:${config.pass}`).toString("base64");
    const endpoint = options.endpoint || MESSAGE_AUTO_SENDER_URL;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${authorization}`,
      },
      body: JSON.stringify(buildWhatsappPayload(config, complaint, appPublicUrl, stage)),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: "Failed", error: `WhatsApp sender returned ${response.status}.` };
    }
    return { status: "Sent", sentAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "WhatsApp sender request timed out." : safeErrorMessage(error instanceof Error ? error.message : error);
    return { status: "Failed", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsappComplaintMessage(
  config: WhatsappSenderConfig,
  complaint: WhatsappComplaintRecord,
  options: { appPublicUrl?: string; endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WhatsappSendResult> {
  for (const stage of ["text", "photo1", "photo2"] as WhatsappSendStage[]) {
    const result = await sendWhatsappComplaintStage(config, complaint, stage, options);
    if (result.status !== "Sent") return { ...result, failedStage: stage };
  }
  return { status: "Sent", sentAt: new Date().toISOString() };
}
