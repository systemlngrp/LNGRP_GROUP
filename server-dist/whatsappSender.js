export const WHATSAPP_COMPLAINT_MENU = "/quality/complaints/form";
export const MESSAGE_AUTO_SENDER_URL = "https://app.messageautosender.com/api/v1/message/create";
export const DEFAULT_QC_COMPLAINT_MESSAGE = `🚨 *QC Complaint Alert*

*Complaint Date:* {{dateOfComplaint}}
*Job / Lot No.:* {{lotNo}}
*Party:* {{partyName}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Nature:* {{natureOfComplaint}}
*Quantity:* {{quantity}}
*Area:* {{areaOfIssue}}
*Issue Details:* {{issueDetails}}
*Photos:* {{photo1}} {{photo2}}

Please review this complaint and take the necessary action.`;
const text = (value) => String(value ?? "").trim();
export function resolveWhatsappTemplate(template, complaint, appPublicUrl) {
    const values = {
        dateOfComplaint: text(complaint.dateOfComplaint),
        lotNo: text(complaint.lotNo),
        partyName: text(complaint.partyName),
        itemName: text(complaint.itemName),
        erpCode: text(complaint.erpCode),
        natureOfComplaint: text(complaint.natureOfComplaint),
        quantity: text(complaint.quantity),
        areaOfIssue: text(complaint.areaOfIssue),
        issueDetails: text(complaint.issueDetails),
        photo1: buildPhotoUrl(complaint.photo1, appPublicUrl),
        photo2: buildPhotoUrl(complaint.photo2, appPublicUrl),
    };
    return text(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] ?? "");
}
export function buildPhotoUrl(value, appPublicUrl) {
    const filename = text(value);
    if (!filename)
        return "";
    if (/^https?:\/\//i.test(filename))
        return filename;
    return `${text(appPublicUrl).replace(/\/$/, "")}/uploads/${encodeURIComponent(filename)}`;
}
export function buildWhatsappPayload(config, complaint, appPublicUrl) {
    const filePathUrl = [buildPhotoUrl(complaint.photo1, appPublicUrl), buildPhotoUrl(complaint.photo2, appPublicUrl)].filter(Boolean);
    return {
        recipientIds: [text(config.groupId)],
        message: [resolveWhatsappTemplate(config.message, complaint, appPublicUrl)],
        ...(filePathUrl.length ? { filePathUrl } : {}),
    };
}
function safeErrorMessage(value) {
    const message = text(value).replace(/authorization\s*:\s*basic\s+[^\s]+/gi, "authorization: [redacted]");
    return message.slice(0, 500) || "WhatsApp sender request failed.";
}
export async function sendWhatsappComplaintMessage(config, complaint, options = {}) {
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
            body: JSON.stringify(buildWhatsappPayload(config, complaint, options.appPublicUrl || process.env.APP_PUBLIC_URL || "https://system.lngr.in")),
            signal: controller.signal,
        });
        if (!response.ok) {
            const responseText = await response.text().catch(() => "");
            return { status: "Failed", error: `WhatsApp sender returned ${response.status}: ${safeErrorMessage(responseText || response.statusText)}` };
        }
        return { status: "Sent", sentAt: new Date().toISOString() };
    }
    catch (error) {
        const message = error instanceof Error && error.name === "AbortError" ? "WhatsApp sender request timed out." : safeErrorMessage(error instanceof Error ? error.message : error);
        return { status: "Failed", error: message };
    }
    finally {
        clearTimeout(timeout);
    }
}
