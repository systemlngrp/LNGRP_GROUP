/** Plain-language text for a WhatsApp send error ("WhatsApp sender returned 401." etc.). */
export function friendlyWhatsappError(error: unknown, entryLabel = "this report") {
  const text = String(error ?? "").trim();
  const code = Number(text.match(/returned (\d{3})/)?.[1] || 0);
  if (code === 401 || code === 403) return `WhatsApp login failed: the LoginID or Pass saved in WhatsApp Master for ${entryLabel} is wrong. Edit that entry, check the LoginID and type the Pass again. (${code})`;
  if (code === 404) return `WhatsApp sender could not find the group. Check the GroupId in WhatsApp Master for ${entryLabel}. (${code})`;
  if (code === 424) return `WhatsApp could not fetch the PDF or photo. Try again in a minute. (${code})`;
  if (code === 429) return `Too many WhatsApp messages at once. Try again in a minute. (${code})`;
  if (code >= 500) return `WhatsApp sender service is not responding right now. Try again later. (${code})`;
  if (/timed out/i.test(text)) return "WhatsApp sender did not answer in time. Try again.";
  return text || "WhatsApp message could not be sent.";
}
