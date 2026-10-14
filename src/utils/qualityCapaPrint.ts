import type { QualityComplaint, Setting } from "../types";
import type { CapaLinkedDetails } from "../lib/capaReportLinks";
import { getOrganizationLogoUrl } from "../lib/pdfLogo";

type CapaData = NonNullable<QualityComplaint["capaData"]>;
type PrintContext = { setting?: Setting; linkedDetails?: CapaLinkedDetails };
const s = (value: unknown) => String(value ?? "").trim();
const escapeHtml = (value: unknown) => s(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
const printed = (value: unknown) => escapeHtml(value) || "&nbsp;";
const date = (value: unknown) => { const raw = s(value); const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : raw; };
const isPhotoLink = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) || /^[^/\s]+\.(?:jpe?g|png|gif|webp|bmp)$/i.test(s(value));
const photoHref = (value: unknown) => /^https?:\/\//i.test(s(value)) || /^\/uploads\//i.test(s(value)) ? s(value) : `/uploads/${encodeURIComponent(s(value))}`;

export function buildQualityCapaPrintHtml(complaint: QualityComplaint, storedData?: CapaData, context: PrintContext = {}) {
  const data = storedData || complaint.capaData || {};
  const template = data.questionTemplate || [];
  const title = (id: string, fallback: string) => template.find((q) => q.id === id)?.label || fallback;
  const linked = context.linkedDetails;
  const logo = getOrganizationLogoUrl(context.setting);
  const details = [
    ["Customer Name", complaint.partyName], ["Material Description", complaint.itemName],
    ["Delivery No. (Inv No)", data.deliveryNo ?? linked?.deliveryNo], ["Inv. Date", date(data.invoiceDate ?? linked?.invoiceDate)],
    ["% of Defects", data.defectPercentage], ["Type of Defect", data.defectDescription],
    ["Veh no", data.vehicleNo ?? linked?.vehicleNo], ["Date of Production", date(data.productionDate ?? linked?.productionDate)],
    ["Date of dispatch", date(data.dispatchDate ?? linked?.dispatchDate)],
  ];
  const detailRows = details.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${printed(value)}</td></tr>`).join("");
  const narrative = (label: string, value: unknown, section = false) => `<div class="report-block"><div class="${section ? "bar" : "label"}">${escapeHtml(label)}</div><div class="narrative">${printed(value)}</div></div>`;
  const action = (title: string, value: unknown, target: unknown) => `<div class="report-block"><div class="bar">${escapeHtml(title)}</div><div class="action-grid"><div class="narrative">${printed(value)}</div><div class="target"><div class="label">Target date</div><div>${printed(date(target))}</div></div></div></div>`;
  const signatures = [["Prepared By", data.preparedBy], ["HOD Quality", data.reviewedBy], ["HOD Production", data.hodProduction], ["Approved by - Plant Head", data.approvedBy]].map(([label, value]) => `<td><div class="signature-name">${printed(value)}</div><div class="signature-label">${escapeHtml(label)}</div></td>`).join("");
  const appendix = [["Firm", complaint.firmName], ["Nature of Complaint", complaint.natureOfComplaint], ["Job / LOT No.", complaint.lotNo], ["Quantity", complaint.quantity], ["Area of Issue", complaint.areaOfIssue], ["Concerned Person", complaint.concernedPersonName], ["Issue Details", complaint.issueDetails], ["Status of Last Action Plan", data.previousActionPlanStatus], ["CAPA Status", complaint.capaStatus], ["Responsible Person", data.responsiblePerson], ["Prepared Date", date(data.preparedDate)], ["Reviewed Date", date(data.reviewedDate)], ["Approved Date", date(data.approvedDate)], ["Completion Date", date(data.completionDate)]].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${printed(value)}</td></tr>`).join("");
  const photos = [complaint.photo1, complaint.photo2].filter(Boolean).map((value, index) => isPhotoLink(value) ? `<figure><figcaption>Photo ${index + 1}</figcaption><img src="${escapeHtml(photoHref(value))}" alt="Complaint photo ${index + 1}" /></figure>` : `<p>${printed(value)}</p>`).join("");
  const customBlocks = template.filter((q) => q.id.startsWith("custom_") && !q.removed).map((q) => narrative(q.label, data.customAnswers?.[q.id])).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>CAPA ${escapeHtml(complaint.capaNo || "Report")}</title><style>
    @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;font:11px Arial,sans-serif;color:#111;background:#fff}.sheet{max-width:190mm;margin:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:6px;vertical-align:middle}.header{display:grid;grid-template-columns:29mm 1fr;border:1px solid #111;min-height:25mm;background:#b7b7b7}.logo{border-right:1px solid #111;background:#fff;display:flex;align-items:center;justify-content:center;padding:2mm}.logo img{max-width:100%;max-height:22mm;object-fit:contain}.title{display:flex;align-items:center;justify-content:center;text-align:center;font-size:16px;font-weight:800;text-decoration:underline;padding:5mm}.identity th{background:#ececec;text-align:left;width:17%}.identity td{text-align:center;font-weight:700;width:16%}.details th{width:34%;background:#ececec;text-align:left}.details td{text-align:center;font-weight:700}.bar{background:#ae2307;color:#fff;text-align:center;font-weight:800;padding:7px;border:1px solid #111}.label{background:#f4cece;font-weight:700;padding:5px;border:1px solid #111}.report-block{break-inside:avoid}.narrative{border:1px solid #111;border-top:0;color:#102fce;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere;min-height:24mm;padding:9px 7px;line-height:1.35}.action-grid{display:grid;grid-template-columns:2fr 1fr}.action-grid .narrative{border-right:0;min-height:32mm}.target{border:1px solid #111;text-align:center;display:grid;grid-template-rows:auto 1fr;font-weight:700}.target .label{border:0;border-bottom:1px solid #111}.target>div:last-child{display:flex;align-items:center;justify-content:center;padding:7px}.verification{min-height:17mm}.signatures td{padding:0;text-align:center;width:25%}.signature-name{min-height:21mm;padding:7px;color:#102fce;font-weight:700;display:flex;align-items:flex-end;justify-content:center}.signature-label{border-top:1px solid #111;background:#ececec;font-weight:700;padding:5px 2px}.appendix{break-before:page;margin-top:12mm}.appendix h2{font-size:14px}.appendix th{width:34%;background:#ececec;text-align:left}.appendix td{white-space:pre-wrap;overflow-wrap:anywhere}figure{display:inline-block;vertical-align:top;width:46%;margin:8px 2% 8px 0;break-inside:avoid}figure img{max-width:100%;max-height:80mm;object-fit:contain}figcaption{font-weight:bold;margin-bottom:5px}@media screen{body{padding:12mm}.sheet{box-shadow:0 0 10px #bbb}}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.appendix{page-break-before:always}}
  </style></head><body><main class="sheet"><div class="header"><div class="logo">${logo ? `<img src="${escapeHtml(logo)}" alt="Organization logo">` : escapeHtml(context.setting?.organizationName || complaint.firmName)}</div><div class="title">CORRECTIVE AND PREVENTIVE ACTION REPORT</div></div><table class="identity"><tr><th>CAPA NO.</th><td>${printed(complaint.capaNo || "Pending")}</td><th>Date</th><td>${printed(date(complaint.dateOfComplaint))}</td><th>SAP CODE</th><td>${printed(complaint.erpCode)}</td></tr></table><table class="details">${detailRows}</table><div class="bar">ANALYSIS AND ACTION PLAN FOR ABOVE NCR</div>${narrative(title("rejectionDetails", "Details of Non Conformity:-"), data.rejectionDetails || data.immediateContainment || complaint.issueDetails)}${narrative(title("productionFailureRootCause", "Root cause analysis for Production Failure"), data.productionFailureRootCause || data.rootCauseAnalysis)}${narrative(title("detectionFailureRootCause", "Root cause analysis for Detection Failure"), data.detectionFailureRootCause)}${narrative(title("correctiveAction", "CORRECTIVE ACTION"), data.correctiveAction, true)}${action(title("productionPreventiveAction", "Preventive action for Production Failures / Transit Failures"), data.productionPreventiveAction || data.preventiveAction, data.productionTargetDate || data.targetDate || data.targetCompletionDate)}${action(title("detectionPreventiveAction", "Preventive action for Detection Failures"), data.detectionPreventiveAction, data.detectionTargetDate)}${customBlocks}<div class="label" style="text-align:center;background:#ddd">Details of Verification for effectiveness (by internal audit by QA/QC) :-</div><div class="narrative verification">${printed(data.effectivenessVerification || data.verificationRemarks)}</div><table class="signatures"><tr>${signatures}</tr></table><section class="appendix"><h2>Additional CAPA and complaint details</h2><table>${appendix}</table>${photos ? `<h2>Photos</h2>${photos}` : ""}</section></main></body></html>`;
}

const waitForPrintImages = async (win: Window) => { await Promise.all(Array.from(win.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); }))); };
export async function printQualityCapaReport(complaint: QualityComplaint, data?: CapaData, context: PrintContext = {}) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildQualityCapaPrintHtml(complaint, data, context));
  win.document.close();
  await waitForPrintImages(win);
  win.focus();
  win.print();
  return true;
}
