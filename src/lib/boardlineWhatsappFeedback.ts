type WhatsappDelivery = { status?: string; error?: string } | undefined;

export function boardlineWhatsappSaveMessage(delivery: WhatsappDelivery) {
  if (delivery?.status === "Sent") return "Board Line QC check saved and WhatsApp message sent successfully.";
  if (delivery?.status === "Already Sent") return "Board Line QC check saved. WhatsApp message was already sent.";
  if (delivery?.status === "Not Configured") return "Board Line QC check saved, but no active WhatsApp configuration was found.";
  if (delivery?.status === "Failed" && delivery.error === "WhatsApp sender returned 401.") {
    return "Board Line QC check saved, but WhatsApp authentication failed (401). Ask an administrator to update LoginID and Pass in WhatsApp Master. It will retry automatically.";
  }
  if (delivery?.status === "Failed") return "Board Line QC check saved, but WhatsApp message could not be sent. It will retry automatically.";
  if (delivery?.status === "In Progress") return "Board Line QC check saved. WhatsApp delivery is in progress.";
  return "Board Line QC check saved successfully.";
}
