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

export type WhatsappBoardlineRecord = {
  jobNo?: unknown;
  partyName?: unknown;
  itemName?: unknown;
  erp?: unknown;
  samplingPlanQty?: unknown;
  samplingCheckNo?: unknown;
  checkNo?: unknown;
  standard?: unknown;
  flapHeightFlapOperatorSide?: unknown;
  flapHeightFlapDriveSide?: unknown;
  cuttingSizeRequired?: unknown;
  cuttingSizeMm?: unknown;
  boardGsm?: unknown;
  typeOfFlute?: unknown;
  boardThickness?: unknown;
  moisture?: unknown;
  sheetWeightGrams?: unknown;
  boardlineRemarks?: unknown;
  qcPerson?: unknown;
  printingArtwork?: unknown;
};

export type WhatsappPrintingRecord = {
  jobNo?: unknown;
  partyName?: unknown;
  itemName?: unknown;
  erp?: unknown;
  samplingPlanQty?: unknown;
  samplingCheckNo?: unknown;
  checkNo?: unknown;
  standardBoxSize?: unknown;
  boxSizeAchieved?: unknown;
  csStandard?: unknown;
  bsStandard?: unknown;
  bsAchieved?: unknown;
  boardThicknessBefore?: unknown;
  boardThickness?: unknown;
  boxWeightGrams?: unknown;
  printingColor1Standard?: unknown;
  colour1Actual?: unknown;
  standardArtwork?: unknown;
  qcPerson?: unknown;
  operatorName?: unknown;
};

export type WhatsappSenderConfig = {
  loginId: string;
  pass: string;
  groupId: string;
  message: string;
};

export type WhatsappSendStage = "text" | "photo1" | "photo2";

export type WhatsappLoadingSlipRecord = {
  slipNo?: unknown;
  date?: unknown;
  customer?: unknown;
  companyName?: unknown;
  itemName?: unknown;
  erpCode?: unknown;
  truckNo?: unknown;
  totalQty?: unknown;
  loadingSource?: unknown;
  whatsappPdfUrl?: unknown;
};

export type WhatsappMrrRecord = {
  transactionNo?: unknown;
  date?: unknown;
  supplier?: unknown;
  invoiceNo?: unknown;
  invDate?: unknown;
  mrrType?: unknown;
  totalQty?: unknown;
  totalAmount?: unknown;
  reelCount?: unknown;
  whatsappPdfUrls?: unknown;
};

export type WhatsappReelReturnRecord = {
  returnNo?: unknown;
  date?: unknown;
  jobNo?: unknown;
  totalReels?: unknown;
  totalWeightKg?: unknown;
  remarks?: unknown;
  whatsappPdfUrl?: unknown;
};

export type WhatsappSendResult = {
  status: "Sent" | "Failed" | "Not Configured";
  error?: string;
  failedStage?: WhatsappSendStage;
  sentAt?: string;
};

export const WHATSAPP_COMPLAINT_MENU = "/quality/complaints/form";
export const WHATSAPP_BOARDLINE_MENU = "/quality/boardline-qc/form";
export const WHATSAPP_PRINTING_MENU = "/quality/printing-qc/form";
export const WHATSAPP_LOADING_MENU = "/loading/master";
export const WHATSAPP_MRR_MENU = "/material-in/master";
export const WHATSAPP_REEL_RETURN_MENU = "/material-movement/reel-return";
export const MESSAGE_AUTO_SENDER_URL = "https://app.messageautosender.com/api/v1/message/create";
export const DEFAULT_LOADING_SLIP_MESSAGE = `🚚 *LOADING SLIP*

*Slip No.:* {{slipNo}}
*Date:* {{date}}
*Customer:* {{customer}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Truck No.:* {{truckNo}}
*Total Quantity:* {{totalQty}}
*Loading Source:* {{loadingSource}}

📄 Loading Slip PDF attached.`;
export const DEFAULT_MRR_MESSAGE = `📦 *MATERIAL RECEIPT REPORT (MRR)*

*MRR No.:* {{transactionNo}}
*MRR Date:* {{date}}
*Supplier:* {{supplier}}
*Invoice No.:* {{invoiceNo}}
*Invoice Date:* {{invDate}}
*MRR Type:* {{mrrType}}
*Total Quantity:* {{totalQty}}
*Total Amount:* {{totalAmount}}
*Reel Count:* {{reelCount}}

📄 MRR PDF and applicable Reel Label PDFs are attached.`;
export const DEFAULT_REEL_RETURN_MESSAGE = `🔁 *REEL RETURN*

*Return No.:* {{returnNo}}
*Date:* {{date}}
*Job No.:* {{jobNo}}
*Total Reels:* {{totalReels}}
*Total Weight:* {{totalWeightKg}} KG
*Remarks:* {{remarks}}

📄 Reel Return PDF attached.`;
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
export const DEFAULT_BOARDLINE_QC_MESSAGE = `📋 *BOARDLINE QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP Code:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Size Details*
*Standard (Flap - Height - Flap):* {{standard}}
*Actual - Operator Side:* {{flapHeightFlapOperatorSide}}
*Actual - Drive Side:* {{flapHeightFlapDriveSide}}

*Cutting Size Required:* {{cuttingSizeRequired}}
*Cutting Size Achieved:* {{cuttingSizeMm}}

*Board Details*
*B.GSM:* {{boardGsm}}
*Type of Flute:* {{typeOfFlute}}
*Board Thickness:* {{boardThickness}}
*Moisture:* {{moisture}}
*Sheet Weight:* {{sheetWeightGrams}}

*BOARDLINE REMARKS*
{{boardlineRemarks}}

*QC Person:* {{qcPerson}}

*PRINTING ARTWORK*
{{printingArtwork}}`;
export const DEFAULT_PRINTING_QC_MESSAGE = `🖨️ *PRINTING QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Box Size Details*
*Standard Box Size (L x W x H):* {{standardBoxSize}}
*Box Size Achieved (L x W x H):* {{boxSizeAchieved}}

*CS / BS Details*
*CS (Standard):* {{csStandard}}
*BS (Standard):* {{bsStandard}}
*BS Achieved:* {{bsAchieved}}

*Board Details*
*Board Thickness (Before):* {{boardThicknessBefore}}
*Board Thickness:* {{boardThickness}}
*Box Weight (Grams):* {{boxWeightGrams}}

*Printing Colour Details*
*Printing Colour 1 (Standard):* {{printingColor1Standard}}
*Colour 1 (Actual):* {{colour1Actual}}

*STANDARD ARTWORK*
{{standardArtwork}}

*QC Person:* {{qcPerson}}
*Operator Name:* {{operatorName}}`;

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

export function resolveWhatsappBoardlineTemplate(template: string, record: WhatsappBoardlineRecord) {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, text(value)])
  );
  values.samplingCheckNo = text(record.samplingCheckNo) || text(record.checkNo);
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildWhatsappBoardlinePayload(config: WhatsappSenderConfig, record: WhatsappBoardlineRecord) {
  return {
    recipientIds: [text(config.groupId)],
    message: [resolveWhatsappBoardlineTemplate(config.message, record)],
  };
}

export function resolveWhatsappPrintingTemplate(template: string, record: WhatsappPrintingRecord) {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, text(value)])
  );
  values.samplingCheckNo = text(record.samplingCheckNo) || text(record.checkNo);
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildWhatsappPrintingPayload(config: WhatsappSenderConfig, record: WhatsappPrintingRecord) {
  return {
    recipientIds: [text(config.groupId)],
    message: [resolveWhatsappPrintingTemplate(config.message, record)],
  };
}

export function resolveWhatsappLoadingSlipTemplate(template: string, record: WhatsappLoadingSlipRecord) {
  const values: Record<string, string> = {
    slipNo: text(record.slipNo),
    date: text(record.date),
    customer: text(record.customer) || text(record.companyName),
    itemName: text(record.itemName),
    erpCode: text(record.erpCode),
    truckNo: text(record.truckNo),
    totalQty: text(record.totalQty),
    loadingSource: text(record.loadingSource),
  };
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildWhatsappLoadingSlipPayload(config: WhatsappSenderConfig, record: WhatsappLoadingSlipRecord) {
  const pdfUrl = text(record.whatsappPdfUrl);
  return {
    recipientIds: [text(config.groupId)],
    message: [resolveWhatsappLoadingSlipTemplate(config.message, record)],
    ...(pdfUrl ? { filePathUrl: [pdfUrl] } : {}),
  };
}

export function resolveWhatsappMrrTemplate(template: string, record: WhatsappMrrRecord) {
  const values: Record<string, string> = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, text(value)]));
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildWhatsappMrrPayload(config: WhatsappSenderConfig, record: WhatsappMrrRecord) {
  const urls = Array.isArray(record.whatsappPdfUrls) ? record.whatsappPdfUrls.map(text).filter(Boolean) : [];
  return {
    recipientIds: [text(config.groupId)],
    message: [resolveWhatsappMrrTemplate(config.message, record)],
    ...(urls.length ? { filePathUrl: urls } : {}),
  };
}

export function resolveWhatsappReelReturnTemplate(template: string, record: WhatsappReelReturnRecord) {
  const values: Record<string, string> = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, text(value)]));
  return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildWhatsappReelReturnPayload(config: WhatsappSenderConfig, record: WhatsappReelReturnRecord) {
  const pdfUrl = text(record.whatsappPdfUrl);
  return {
    recipientIds: [text(config.groupId)],
    message: [resolveWhatsappReelReturnTemplate(config.message, record)],
    ...(pdfUrl ? { filePathUrl: [pdfUrl] } : {}),
  };
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

async function sendWhatsappPayload(
  config: WhatsappSenderConfig,
  payload: Record<string, unknown>,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WhatsappSendResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const authorization = Buffer.from(`${config.loginId}:${config.pass}`).toString("base64");
    const response = await fetchImpl(options.endpoint || MESSAGE_AUTO_SENDER_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authorization}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "Failed", error: `WhatsApp sender returned ${response.status}.` };
    return { status: "Sent", sentAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "WhatsApp sender request timed out." : safeErrorMessage(error instanceof Error ? error.message : error);
    return { status: "Failed", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function sendWhatsappBoardlineMessage(
  config: WhatsappSenderConfig,
  record: WhatsappBoardlineRecord,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, buildWhatsappBoardlinePayload(config, record), options);
}

export function sendWhatsappPrintingMessage(
  config: WhatsappSenderConfig,
  record: WhatsappPrintingRecord,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, buildWhatsappPrintingPayload(config, record), options);
}

export function sendWhatsappTextMessage(
  config: WhatsappSenderConfig,
  message: string,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, { recipientIds: [config.groupId], message: [message] }, options);
}

export function sendWhatsappLoadingSlipMessage(
  config: WhatsappSenderConfig,
  record: WhatsappLoadingSlipRecord,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, buildWhatsappLoadingSlipPayload(config, record), options);
}

export function sendWhatsappMrrMessage(
  config: WhatsappSenderConfig,
  record: WhatsappMrrRecord,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, buildWhatsappMrrPayload(config, record), options);
}

export function sendWhatsappReelReturnMessage(
  config: WhatsappSenderConfig,
  record: WhatsappReelReturnRecord,
  options: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return sendWhatsappPayload(config, buildWhatsappReelReturnPayload(config, record), options);
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
  return sendWhatsappPayload(config, buildWhatsappPayload(config, complaint, appPublicUrl, stage), options);
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
