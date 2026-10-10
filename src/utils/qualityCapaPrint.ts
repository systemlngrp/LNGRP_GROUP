import type { QualityComplaint } from "../types";

type CapaData = NonNullable<QualityComplaint["capaData"]>;

const s = (value: unknown) => String(value ?? "");
const isPhotoLink = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) || /^[^/\s]+\.(?:jpe?g|png|gif|webp|bmp)$/i.test(s(value));
const photoHref = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) ? s(value) : `/uploads/${encodeURIComponent(s(value))}`;
const escapeHtml = (value: unknown) => s(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);

const normalizeCapaData = (value?: CapaData): CapaData => ({
  ...(value || {}),
  rejectionDetails: value?.rejectionDetails || value?.immediateContainment || "",
  productionFailureRootCause: value?.productionFailureRootCause || value?.rootCauseAnalysis || "",
  productionPreventiveAction: value?.productionPreventiveAction || value?.preventiveAction || "",
  targetDate: value?.targetDate || value?.targetCompletionDate || "",
  responsiblePerson: value?.responsiblePerson || value?.preparedBy || "",
});

export const buildQualityCapaPrintHtml = (complaint: QualityComplaint, storedData?: CapaData) => {
  const data = normalizeCapaData(storedData);
  const rows: Array<[string, unknown]> = [
    ["CAPA No.", complaint.capaNo || "Pending"], ["Complaint Date", complaint.dateOfComplaint], ["Firm", complaint.firmName], ["Party Name", complaint.partyName], ["Item Name", complaint.itemName], ["ERP Code", complaint.erpCode], ["Nature", complaint.natureOfComplaint], ["LOT NO.", complaint.lotNo], ["Quantity", complaint.quantity], ["Issue Details", complaint.issueDetails],
    ["Type of Defect (SHORT DESCRIPTION)", data.defectDescription], ["% of Defects", data.defectPercentage], ["Details of Rejection", data.rejectionDetails], ["Status of Last Action Plan", data.previousActionPlanStatus], ["Root Cause - Production Failure", data.productionFailureRootCause], ["Root Cause - Detection Failure", data.detectionFailureRootCause], ["Corrective Action", data.correctiveAction], ["Preventive Action - Production Failures", data.productionPreventiveAction], ["Preventive Action - Detection Failures", data.detectionPreventiveAction], ["Target Date", data.targetDate], ["Responsible Person", data.responsiblePerson], ["Prepared By", data.preparedBy], ["Completion Date", data.completionDate], ["Reviewed By / Date", `${data.reviewedBy} / ${data.reviewedDate}`], ["Approved By / Date", `${data.approvedBy} / ${data.approvedDate}`],
  ];
  const photos = [complaint.photo1, complaint.photo2].filter(Boolean).map((photo, index) => isPhotoLink(photo) ? `<figure><figcaption>Photo ${index + 1}</figcaption><img src="${escapeHtml(photoHref(photo))}" alt="Photo ${index + 1}" /></figure>` : "").join("");
  return `<html><head><title>CAPA ${escapeHtml(complaint.capaNo || "Report")}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{text-align:center;background:#123b59;color:#fff;padding:16px}table{width:100%;border-collapse:collapse}td{border:1px solid #222;padding:9px;vertical-align:top;white-space:pre-wrap}td:first-child{font-weight:bold;width:34%;background:#eef3f7}figure{display:inline-block;vertical-align:top;width:46%;margin:10px 2% 10px 0}figcaption{font-weight:bold;margin-bottom:6px}figure img{display:block;max-width:100%;max-height:320px;object-fit:contain;border:1px solid #ccc}@media print{figure{break-inside:avoid}body{padding:0}}</style></head><body><h1>GENERATE CAPA REPORT</h1><table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>${photos ? `<h3>Photos</h3>${photos}` : ""}</body></html>`;
};

const waitForPrintImages = async (win: Window) => {
  await Promise.all(Array.from(win.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  })));
};

export async function printQualityCapaReport(complaint: QualityComplaint, capaData?: CapaData) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildQualityCapaPrintHtml(complaint, capaData));
  win.document.close();
  await waitForPrintImages(win);
  win.focus();
  win.print();
  return true;
}
