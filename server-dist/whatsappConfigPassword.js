export const WHATSAPP_PASSWORD_MASK = "********";
export function resolveWhatsappConfigPassword(submitted, stored) {
    const pass = typeof submitted === "string" ? submitted : "";
    if (pass.trim() === WHATSAPP_PASSWORD_MASK) {
        return { error: "Enter the real Pass; the masked value cannot be saved as a password." };
    }
    if (pass.trim())
        return { pass };
    if (stored === undefined)
        return { error: "Pass is required for a new WhatsApp configuration." };
    if (!stored || stored === WHATSAPP_PASSWORD_MASK) {
        return { error: "The stored Pass must be replaced. Enter the current Message Auto Sender password." };
    }
    return {};
}
