import type { QcReportKey } from "./qcColumnLayout";

export async function saveQcColumnLayout(report: QcReportKey, columns: number[]): Promise<void> {
  const token = localStorage.getItem("authToken") || "";
  const response = await fetch(`/api/qc-report-columns/${report}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ columns }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Unable to save columns.");
  }
}
