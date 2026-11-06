// src/lib/productionMaterialUsage.ts
function hasWorkflowValue(value) {
  if (value === null || value === void 0) return false;
  const asString = String(value).trim();
  if (!asString) return false;
  const asNumber = Number(asString);
  return Number.isFinite(asNumber) ? asNumber > 0 : true;
}
function hasPaperNotRequiredBypass(production) {
  return Boolean(production.paperNotRequired) && String(production.paperNotRequiredReason || "").trim().length > 0;
}
function normalizeMaterialText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function isCorrugatedSheetMaterial(material) {
  const normalizedName = normalizeMaterialText(material?.name);
  return normalizedName.includes("corrugated sheet");
}
function buildProductionMaterialUsageMap(materialIssues, materialIssueLines, materialReturns, materialReturnLines, materialIssueReelLines = [], materialReturnReelLines = [], productions = []) {
  const productionIds = new Set(productions.map((production) => production.id));
  const productionIdByJobNo = /* @__PURE__ */ new Map();
  productions.forEach((production) => {
    for (const value of [production.transactionNo, production.jobCardNo]) {
      const jobNo = String(value || "").trim().toLowerCase();
      if (jobNo && !productionIdByJobNo.has(jobNo)) productionIdByJobNo.set(jobNo, production.id);
    }
  });
  const resolveProductionId = (productionId, jobNo) => {
    const id = String(productionId || "").trim();
    if (id && (productions.length === 0 || productionIds.has(id))) return id;
    return productionIdByJobNo.get(String(jobNo || "").trim().toLowerCase());
  };
  const issueProductionMap = new Map(
    materialIssues.filter((issue) => issue.issueType === "Job").map((issue) => [issue.id, resolveProductionId(issue.productionId, issue.jobNo)]).filter((entry) => Boolean(entry[1]))
  );
  const returnProductionMap = new Map(
    materialReturns.filter((entry) => entry.returnType === "Job").map((entry) => [entry.id, resolveProductionId(entry.productionId, entry.jobNo)]).filter((entry) => Boolean(entry[1]))
  );
  const totals = /* @__PURE__ */ new Map();
  const existingIssueLineIds = new Set(materialIssueLines.map((line) => line.id));
  const existingReturnLineIds = new Set(materialReturnLines.map((line) => line.id));
  materialIssueLines.forEach((line) => {
    const productionId = issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.qty || 0));
  });
  materialReturnLines.forEach((line) => {
    const productionId = returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.qty || 0));
  });
  materialIssueReelLines.forEach((line) => {
    if (existingIssueLineIds.has(line.materialIssueLineId)) return;
    const productionId = resolveProductionId(line.productionId, line.jobNo) || issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.weightKg || 0));
  });
  materialReturnReelLines.forEach((line) => {
    if (existingReturnLineIds.has(line.materialReturnLineId)) return;
    const productionId = resolveProductionId(line.productionId, line.jobNo) || returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.weightKg || 0));
  });
  totals.forEach((value, key) => {
    totals.set(key, Math.max(0, Number(value.toFixed(5))));
  });
  return totals;
}
function buildProductionCorrugatedSheetUsageMap(materials, materialIssues, materialIssueLines, materialReturns, materialReturnLines) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const issueProductionMap = new Map(
    materialIssues.filter((issue) => issue.issueType === "Job" && issue.productionId).map((issue) => [issue.id, issue.productionId])
  );
  const returnProductionMap = new Map(
    materialReturns.filter((entry) => entry.returnType === "Job" && entry.productionId).map((entry) => [entry.id, entry.productionId])
  );
  const totals = /* @__PURE__ */ new Map();
  materialIssueLines.forEach((line) => {
    const material = materialMap.get(line.materialId);
    if (!isCorrugatedSheetMaterial(material)) return;
    const productionId = issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.qty || 0));
  });
  materialReturnLines.forEach((line) => {
    const material = materialMap.get(line.materialId);
    if (!isCorrugatedSheetMaterial(material)) return;
    const productionId = returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.qty || 0));
  });
  totals.forEach((value, key) => {
    totals.set(key, Math.max(0, Number(value.toFixed(5))));
  });
  return totals;
}
function hasProductionCorrugatedSheetUsage(production, usageMap) {
  return Number(usageMap?.get(production.id) || 0) > 0;
}
function getProductionActualPaperUsed(production, usageMap) {
  if (usageMap?.has(production.id)) {
    return usageMap.get(production.id) || 0;
  }
  return Number(production.actualPaperUsed || 0);
}

// src/lib/productionMachineNames.ts
var MACHINE_NAME_MAP = {
  "Corrugation Finger": "Corrugation Paper",
  "Corrugation Linear": "Corrugation Liner",
  "Sloting": "Slotting",
  "Slotter": "Slotting",
  "Stithing": "Stitching"
};
function normalizeMachineName(name) {
  const trimmed = String(name || "").trim();
  return MACHINE_NAME_MAP[trimmed] || trimmed;
}

// src/lib/productionProcessingSummary.ts
var PROCESSING_MACHINE_COLUMNS = [
  { key: "paper", label: "Paper", machineNames: ["Corrugation Paper"] },
  { key: "liner", label: "Liner", machineNames: ["Corrugation Liner"] },
  { key: "printing", label: "Printing", machineNames: ["Printing"] },
  { key: "pasting", label: "Pasting", machineNames: ["Pasting"] },
  { key: "stitching", label: "Stitching", machineNames: ["Stitching"] },
  { key: "punching", label: "Punching", machineNames: ["Punching", "Rotary", "Slotting"] },
  { key: "gluing", label: "Gluing", machineNames: ["Gluing"] }
];

// src/lib/utils.ts
function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string") {
    const dateOnly2 = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (dateOnly2) {
      const [, year, month, day] = dateOnly2;
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));
      if (localDate.getFullYear() === Number(year) && localDate.getMonth() === Number(month) - 1 && localDate.getDate() === Number(day)) return `${day}-${month}-${year}`;
      return "-";
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

// src/lib/serial.ts
function formatDate2(dateStr) {
  return formatDate(dateStr);
}

// src/lib/productionStageFilters.ts
function isProductionPendingPH(production) {
  return false;
}
function isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage = false) {
  return hasWorkflowValue(actualPaperUsed) || hasCorrugatedSheetUsage || hasPaperNotRequiredBypass(production);
}
function isProductionPendingConsumption(production, actualPaperUsed = production.actualPaperUsed, hasCorrugatedSheetUsage = false) {
  return !production.cancelTimestamp && !production.tallyTimestamp && !isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage);
}
function isProductionReadyForTally(production, actualPaperUsed = production.actualPaperUsed, hasCorrugatedSheetUsage = false) {
  return !production.cancelTimestamp && !production.tallyTimestamp && isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage) && hasWorkflowValue(production.prodFromFFG);
}

// src/lib/materialNumbering.ts
var DEFAULT_NUMBER_START = 1;
function normalizeStartNumber(value, fallback = DEFAULT_NUMBER_START) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function extractNumericSequence(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function getNextNumber(values, configuredStart) {
  const start = normalizeStartNumber(configuredStart);
  const highest = values.reduce((max, value) => Math.max(max, extractNumericSequence(value)), 0);
  return Math.max(start, highest + 1);
}
function formatOurReelNo(value) {
  return String(Math.max(1, Math.floor(Number(value) || 1))).padStart(5, "0");
}

// src/lib/materialMovement.ts
function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}
var REEL_BALANCE_TOLERANCE_KG = 4e-3;
var OPENING_REEL_MATERIAL_IN_ID = "OPENING";
function normalizeReference(value) {
  return String(value || "").trim().toLowerCase();
}
function reelBalanceKey(productionId, line) {
  const reelIdentity = String(line.packingSlipId || line.ourReelNo || "").trim();
  return productionId && reelIdentity ? `${productionId}::${reelIdentity}` : "";
}
function reelIdentityKeys(productionId, line) {
  if (!productionId) return [];
  const packingSlipId = normalizeReference(line.packingSlipId);
  const reelNo = normalizeReference(line.ourReelNo);
  return [
    packingSlipId ? `${productionId}::slip::${packingSlipId}` : "",
    reelNo ? `${productionId}::reel::${reelNo}` : ""
  ].filter(Boolean);
}
function isOpeningReelPackingSlip(slip) {
  return normalizeReference(slip.materialInId) === normalizeReference(OPENING_REEL_MATERIAL_IN_ID);
}
function isActiveReelMaterial(material) {
  return Boolean(
    material && normalizeReference(material.type) === "reel" && normalizeReference(material.active || "Yes") !== "no"
  );
}
function buildProductionResolver(productions = []) {
  const productionIds = new Set(productions.map((production) => String(production.id || "").trim()).filter(Boolean));
  const productionIdByJobNo = /* @__PURE__ */ new Map();
  productions.forEach((production) => {
    const id = String(production.id || "").trim();
    if (!id) return;
    [production.transactionNo, production.jobCardNo].forEach((jobNo) => {
      const normalizedJobNo = normalizeReference(jobNo);
      if (normalizedJobNo) productionIdByJobNo.set(normalizedJobNo, id);
    });
  });
  return (line) => {
    const directId = String(line.productionId || "").trim();
    if (directId && (productionIds.size === 0 || productionIds.has(directId))) return directId;
    return productionIdByJobNo.get(normalizeReference(line.jobNo)) || directId;
  };
}
function buildReturnedReelKeys(returnReelLines, resolveProductionId) {
  const keys = /* @__PURE__ */ new Set();
  returnReelLines.forEach((line) => {
    if (Number(line.weightKg || 0) <= REEL_BALANCE_TOLERANCE_KG) return;
    reelIdentityKeys(resolveProductionId(line), line).forEach((key) => keys.add(key));
  });
  return keys;
}
function getAllReturnableReelLines(issueReelLines, returnReelLines, productions = []) {
  const resolveProductionId = buildProductionResolver(productions);
  const returnedReelKeys = buildReturnedReelKeys(returnReelLines, resolveProductionId);
  const latestIssueLineByJobAndSlip = /* @__PURE__ */ new Map();
  issueReelLines.forEach((line) => {
    const productionId = resolveProductionId(line);
    const key = reelBalanceKey(productionId, line);
    if (!key || reelIdentityKeys(productionId, line).some((identity) => returnedReelKeys.has(identity))) return;
    latestIssueLineByJobAndSlip.set(key, { ...line, productionId });
  });
  return Array.from(latestIssueLineByJobAndSlip.values()).flatMap((line) => {
    const issuedWeight = round2(Number(line.weightKg || 0));
    return issuedWeight > REEL_BALANCE_TOLERANCE_KG ? [{ ...line, weightKg: issuedWeight }] : [];
  });
}

// src/lib/reelStock.ts
function round22(value) {
  return Number(Number(value || 0).toFixed(2));
}
function getAgeDays(dateStr) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 0;
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / (1e3 * 60 * 60 * 24)));
}
function getLineRate(line, material) {
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}
function isOpeningMrrNo(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "opening";
}
function buildReelStockRows({
  materials,
  materialIn,
  packingSlips,
  issueReelLines,
  returnReelLines,
  firms = [],
  unitOneFirm = null,
  suppliers = [],
  includeMaterialIn = () => true,
  includeIssueLine = () => true,
  includeReturnLine = () => true,
  ourReelNoStartNumber = 1
}) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.filter(includeMaterialIn).map((entry) => [entry.id, entry]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const firmMap = new Map(firms.map((firm) => [firm.id, firm]));
  const filteredIssueLines = issueReelLines.filter(includeIssueLine);
  const filteredReturnLines = returnReelLines.filter(includeReturnLine);
  const issueLinesByPackingSlipId = /* @__PURE__ */ new Map();
  filteredIssueLines.forEach((line) => {
    const key = String(line.packingSlipId || "");
    if (!key) return;
    const rows = issueLinesByPackingSlipId.get(key) || [];
    rows.push(line);
    issueLinesByPackingSlipId.set(key, rows);
  });
  const returnLinesByPackingSlipId = /* @__PURE__ */ new Map();
  filteredReturnLines.forEach((line) => {
    const key = String(line.packingSlipId || "");
    if (!key) return;
    const rows = returnLinesByPackingSlipId.get(key) || [];
    rows.push(line);
    returnLinesByPackingSlipId.set(key, rows);
  });
  const getRelatedLines = (map, keys) => {
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    keys.forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(...map.get(key) || []);
    });
    return rows;
  };
  const firstOpeningReelNo = getNextNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);
  const explicitOpeningMaterialIds = new Set(
    packingSlips.filter(isOpeningReelPackingSlip).map((slip) => slip.materialId)
  );
  const openingRows = materials.filter((material) => isActiveReelMaterial(material) && Number(material.openingQty || 0) > 0 && !explicitOpeningMaterialIds.has(material.id)).map((material, index) => {
    const openingQty = round22(Number(material.openingQty || 0));
    const openingRate = round22(Number(material.openingRate || 0));
    const relatedIssueLines = getRelatedLines(issueLinesByPackingSlipId, [material.id, `opening-${material.id}`]);
    const relatedReturnLines = getRelatedLines(returnLinesByPackingSlipId, [material.id, `opening-${material.id}`]);
    const issuedWeight = round22(relatedIssueLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
    const returnedWeight = round22(relatedReturnLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
    const netIssuedWeight = round22(issuedWeight - returnedWeight);
    const availableWeight = round22(Math.max(0, openingQty + returnedWeight - issuedWeight));
    return {
      slipId: material.id,
      materialId: material.id,
      mrrDate: "2026-06-06",
      mrrNo: "Opening",
      ourReelNo: formatOurReelNo(firstOpeningReelNo + index),
      erp: String(material.erpCode || ""),
      itemName: String(material.name || ""),
      firmId: String(unitOneFirm?.id || material.firmId || ""),
      firmName: String(unitOneFirm?.firmName || firmMap.get(String(material.firmId || ""))?.firmName || "Unassigned"),
      supplierName: "-",
      gsm: Number(material.gsm || 0),
      size: Number(material.size || 0),
      bf: Number(material.bf || 0),
      issuedWeight,
      returnedWeight,
      netIssuedWeight,
      availableWeight,
      mrrQty: 0,
      openingQty,
      rate: availableWeight > 0 ? openingRate : 0,
      valuation: availableWeight > 0 ? round22(availableWeight * openingRate) : 0,
      ageDays: 0,
      isOpening: true
    };
  });
  const mrrRows = packingSlips.filter((slip) => {
    const material = materialMap.get(slip.materialId);
    return isActiveReelMaterial(material) && (materialInMap.has(slip.materialInId) || isOpeningReelPackingSlip(slip));
  }).map((slip) => {
    const material = materialMap.get(slip.materialId);
    const receipt = materialInMap.get(slip.materialInId);
    const firmId = String(unitOneFirm?.id || slip.firmId || receipt?.firmId || "").trim();
    const supplier = isOpeningReelPackingSlip(slip) ? supplierMap.get(String(slip.supplierId || "")) : receipt ? supplierMap.get(receipt.supplierId) : void 0;
    const receiptLine = receipt?.lines.find((line) => line.id === slip.materialLineId) || receipt?.lines.find((line) => line.itemId === slip.materialId);
    const relatedIssueLines = getRelatedLines(issueLinesByPackingSlipId, [slip.id]);
    const relatedReturnLines = getRelatedLines(returnLinesByPackingSlipId, [slip.id]);
    const issuedWeight = relatedIssueLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0);
    const returnedWeight = relatedReturnLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0);
    const reelQty = round22(Number(slip.weightKg || 0));
    const netIssuedWeight = round22(issuedWeight - returnedWeight);
    const availableWeight = round22(Math.max(0, reelQty + returnedWeight - issuedWeight));
    const mrrNo = isOpeningReelPackingSlip(slip) ? "Opening" : receipt?.transactionNo || "";
    const isOpening = isOpeningReelPackingSlip(slip) || isOpeningMrrNo(mrrNo);
    const rate = availableWeight > 0 ? round22(isOpeningReelPackingSlip(slip) ? Number(slip.openingRate || material?.openingRate || 0) : getLineRate(receiptLine, material)) : 0;
    return {
      slipId: slip.id,
      materialId: slip.materialId,
      mrrDate: isOpening ? "" : receipt?.date || "",
      mrrNo,
      ourReelNo: slip.ourReelNo || "",
      erp: String(material?.erpCode || ""),
      itemName: String(material?.name || ""),
      firmId,
      firmName: String(unitOneFirm?.firmName || firmMap.get(firmId)?.firmName || "Unassigned"),
      supplierName: isOpeningReelPackingSlip(slip) ? supplier?.name || "-" : supplier?.name || "",
      gsm: Number(material?.gsm || 0),
      size: Number(material?.size || 0),
      bf: Number(material?.bf || 0),
      issuedWeight: round22(issuedWeight),
      returnedWeight: round22(returnedWeight),
      netIssuedWeight,
      availableWeight,
      mrrQty: isOpening ? 0 : reelQty,
      openingQty: isOpening ? reelQty : 0,
      rate,
      valuation: availableWeight > 0 ? round22(availableWeight * rate) : 0,
      ageDays: getAgeDays(receipt?.date),
      isOpening
    };
  }).sort((a, b) => {
    const dateDiff = new Date(b.mrrDate || 0).getTime() - new Date(a.mrrDate || 0).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.ourReelNo.localeCompare(b.ourReelNo);
  });
  return [...openingRows, ...mrrRows];
}

// src/lib/wastageCalculations.ts
var nonNegative = (value) => {
  const numberValue2 = Number(value || 0);
  return Number.isFinite(numberValue2) && numberValue2 >= 0 ? numberValue2 : 0;
};
var normalizeMachineName2 = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function getKgPerBox(production) {
  const paperWeight = nonNegative(production?.totalPaperWeight);
  const plannedQty = nonNegative(production?.qty) || nonNegative(production?.plannedQty);
  return paperWeight > 0 && plannedQty > 0 ? paperWeight / plannedQty : 0;
}
function getProductionWastageTotals(production, processingRows = []) {
  const kgPerBox = getKgPerBox(production);
  let corrugationKg = 0;
  let printingKg = 0;
  let printingBoxes = 0;
  let fullCorrugationQty = 0;
  processingRows.filter((row) => row.productionId === production.id && (row.completionStatus || "Full") === "Full").forEach((row) => {
    const machine = normalizeMachineName2(row.machineName);
    if (machine === "corrugation liner") {
      fullCorrugationQty += nonNegative(row.qty);
      corrugationKg += nonNegative(row.warpageKg) + nonNegative(row.delaminationKg) + nonNegative(row.misalignmentKg) + nonNegative(row.twoPlyPaperKg) + nonNegative(row.sheerCutterKg);
    }
    if (machine === "printing") {
      printingBoxes += nonNegative(row.slotting) + nonNegative(row.misprinting) + nonNegative(row.jobSetting);
    }
  });
  const noHisabKg = Math.max(
    nonNegative(production.actualPaperUsed) - (kgPerBox * fullCorrugationQty + corrugationKg),
    0
  );
  printingKg = printingBoxes * kgPerBox;
  return {
    corrugationKg,
    sheetPlantWastageKg: corrugationKg,
    printingKg,
    pWastageBoxes: printingBoxes,
    pWastageKg: printingKg,
    noHisabKg,
    cWastagePercent: getWastagePercent(corrugationKg + noHisabKg, nonNegative(production.actualPaperUsed)),
    totalWastagePercent: getWastagePercent(corrugationKg + noHisabKg + printingKg, nonNegative(production.actualPaperUsed)),
    totalCWastageKg: corrugationKg + noHisabKg + printingKg,
    totalWastageKg: corrugationKg + printingKg + noHisabKg
  };
}
function getWastagePercent(totalWastageKg, actualPaperUsedKg) {
  const actual = nonNegative(actualPaperUsedKg);
  return actual > 0 ? nonNegative(totalWastageKg) / actual * 100 : 0;
}

// src/lib/operationDashboard.ts
function makeCard(card) {
  return { status: "ready", ...card };
}
function parseAppDate(dateStr) {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/").map(Number);
    return new Date(year, month - 1, day);
  }
  const datePartMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (datePartMatch) {
    const [, year, month, day] = datePartMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeDateValue(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function getLocalDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatDisplayDate(value) {
  const parsed = parseAppDate(value);
  if (!parsed) return "-";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}
function getSafeRange(dateRange) {
  const from = parseAppDate(dateRange.from);
  const to = parseAppDate(dateRange.to);
  if (!from || !to) return null;
  const fromTime = normalizeDateValue(from);
  const toTime = normalizeDateValue(to);
  return fromTime <= toTime ? { fromTime, toTime, fromDate: from, toDate: to } : { fromTime: toTime, toTime: fromTime, fromDate: to, toDate: from };
}
function isDateWithinRange(dateStr, safeRange) {
  const parsed = parseAppDate(dateStr);
  if (!parsed) return false;
  if (!safeRange) return true;
  const target = normalizeDateValue(parsed);
  return target >= safeRange.fromTime && target <= safeRange.toTime;
}
function isSameAppDate(dateStr, compareValue) {
  const parsed = parseAppDate(dateStr);
  const compareDate = parseAppDate(compareValue);
  if (!parsed || !compareDate) return false;
  return normalizeDateValue(parsed) === normalizeDateValue(compareDate);
}
function getRangeLabel(dateRange) {
  if (!dateRange.from && !dateRange.to) return "All Dates";
  return `${formatDisplayDate(dateRange.from)} to ${formatDisplayDate(dateRange.to)}`;
}
function getShiftedRange(dateRange, dayOffset) {
  const safeRange = getSafeRange(dateRange);
  if (!safeRange) return dateRange;
  const from = new Date(safeRange.fromDate);
  const to = new Date(safeRange.toDate);
  from.setDate(from.getDate() + dayOffset);
  to.setDate(to.getDate() + dayOffset);
  return {
    from: getLocalDateInputValue(from),
    to: getLocalDateInputValue(to)
  };
}
function getRangeSpanDays(dateRange) {
  const safeRange = getSafeRange(dateRange);
  if (!safeRange) return 0;
  return Math.round((safeRange.toTime - safeRange.fromTime) / 864e5) + 1;
}
function getPlanPaper(production) {
  return Number(production.totalPaperWeight || 0);
}
function sumProductionQty(rows) {
  return rows.filter((entry) => entry.status !== "Cancelled" && !entry.cancelTimestamp).reduce((sum, entry) => sum + Number(entry.prodFromFFG || entry.qty || 0), 0);
}
function sumProductionMeter(rows) {
  return rows.filter((entry) => entry.status !== "Cancelled" && !entry.cancelTimestamp).reduce((sum, entry) => sum + Number(entry.productionInMeter || 0), 0);
}
function sumPlanValue(rows, orders) {
  return rows.reduce((sum, schedule) => {
    const order = orders.find((row) => row.id === schedule.orderId);
    return sum + Number(schedule.qty || 0) * Number(order?.rate || 0);
  }, 0);
}
function sumProductionPlanQty(rows) {
  return rows.reduce((sum, production) => sum + Number(production.qty || 0), 0);
}
function sumProductionPlanValue(rows, schedules, orders) {
  return rows.reduce((sum, production) => {
    const schedule = schedules.find((entry) => entry.id === production.scheduleId);
    const order = orders.find((entry) => entry.id === schedule?.orderId);
    const rate = Number(production.rate || order?.rate || 0);
    return sum + Number(production.qty || 0) * rate;
  }, 0);
}
function getPendingPlanningRows(rows, dispatchPlans) {
  return rows.filter((schedule) => {
    const plannedQty = dispatchPlans.filter((plan) => plan.scheduleId === schedule.id).reduce((sum, plan) => sum + Number(plan.plannedQty || 0), 0);
    const balanceQty = Number(schedule.qty || 0) - Number(schedule.canceledQty || 0) - plannedQty;
    return balanceQty > 0;
  });
}
function sumPendingPlanningValue(rows, dispatchPlans, orders) {
  return getPendingPlanningRows(rows, dispatchPlans).reduce((sum, schedule) => {
    const plannedQty = dispatchPlans.filter((plan) => plan.scheduleId === schedule.id).reduce((innerSum, plan) => innerSum + Number(plan.plannedQty || 0), 0);
    const balanceQty = Math.max(0, Number(schedule.qty || 0) - Number(schedule.canceledQty || 0) - plannedQty);
    const order = orders.find((row) => row.id === schedule.orderId);
    return sum + balanceQty * Number(order?.rate || 0);
  }, 0);
}
function sumLoadingQty(rows) {
  return rows.filter((slip) => slip.status !== "Cancelled").reduce(
    (sum, slip) => sum + slip.lines.reduce((lineSum, line) => lineSum + Number(line.loadedQty || 0), 0) + Number(slip.extraItemsQty || 0),
    0
  );
}
function sumDispatchPlanQty(rows) {
  return rows.reduce((sum, plan) => sum + Number(plan.plannedQty || 0), 0);
}
function sumDispatchLoadedQty(rows) {
  return rows.reduce((sum, plan) => sum + Number(plan.loadedQty || 0), 0);
}
function getActualPaperUsed(rows, usageMap) {
  return rows.filter((entry) => entry.status !== "Cancelled" && !entry.cancelTimestamp).reduce((sum, entry) => sum + Number(getProductionActualPaperUsed(entry, usageMap) || 0), 0);
}
function getPlanPaperTotal(rows) {
  return rows.filter((entry) => entry.status !== "Cancelled" && !entry.cancelTimestamp).reduce((sum, entry) => sum + getPlanPaper(entry), 0);
}
function getComparisonCards(dateRange, invoices, productions) {
  const spanDays = getRangeSpanDays(dateRange);
  const previousRange = getShiftedRange(dateRange, -spanDays);
  const nextRange = getShiftedRange(dateRange, spanDays);
  return {
    previousRange,
    nextRange,
    comparisonLabel: getRangeLabel(previousRange),
    nextLabel: getRangeLabel(nextRange),
    previousSale: (rows) => rows.reduce((sum, invoice) => sum + Number(invoice.totalAfterGst || 0), 0),
    previousProduction: (rows) => sumProductionQty(rows)
  };
}
function getProcessingTotals(rows) {
  const totals = {
    paper: 0,
    liner: 0,
    printing: 0,
    pasting: 0,
    stitching: 0,
    punching: 0,
    gluing: 0
  };
  rows.forEach((row) => {
    const machineColumn = PROCESSING_MACHINE_COLUMNS.find(
      (column) => column.machineNames.includes(row.machineName)
    );
    if (!machineColumn) return;
    totals[machineColumn.key] += Number(row.qty || 0);
  });
  return totals;
}
function getFgStockTotal(items) {
  return items.filter((item) => item.itemType === "FG").reduce((sum, item) => sum + Number(item.balance || 0), 0);
}
function getReelStockTotals(materials, materialIn, packingSlips, issueReelLines, returnReelLines) {
  const rows = buildReelStockRows({
    materials,
    materialIn,
    packingSlips,
    issueReelLines,
    returnReelLines
  });
  return rows.reduce(
    (acc, row) => {
      acc.availableWeight += row.availableWeight;
      if (row.availableWeight > 0) acc.noOfReels += 1;
      return acc;
    },
    { availableWeight: 0, noOfReels: 0 }
  );
}
function buildOperationDashboardSummary(args) {
  const safeRange = getSafeRange(args.dateRange);
  const rangeLabel = getRangeLabel(args.dateRange);
  const today = getLocalDateInputValue(/* @__PURE__ */ new Date());
  const tomorrowDate = /* @__PURE__ */ new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = getLocalDateInputValue(tomorrowDate);
  const { previousRange, nextRange, comparisonLabel, nextLabel } = getComparisonCards(
    args.dateRange,
    args.invoices,
    args.productions
  );
  const previousSafeRange = getSafeRange(previousRange);
  const nextSafeRange = getSafeRange(nextRange);
  const filteredProductions = safeRange ? args.productions.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.productions;
  const previousProductions = previousSafeRange ? args.productions.filter((entry) => isDateWithinRange(entry.date, previousSafeRange)) : [];
  const filteredSchedules = safeRange ? args.schedules.filter((entry) => isDateWithinRange(entry.scheduledDate, safeRange)) : args.schedules;
  const todayProductions = args.productions.filter((entry) => isSameAppDate(entry.date, today));
  const tomorrowProductions = args.productions.filter((entry) => isSameAppDate(entry.date, tomorrow));
  const nextSchedules = nextSafeRange ? args.schedules.filter((entry) => isDateWithinRange(entry.scheduledDate, nextSafeRange)) : [];
  const filteredDispatchPlans = safeRange ? args.dispatchPlans.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.dispatchPlans;
  const filteredLoadingSlips = safeRange ? args.loadingSlips.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.loadingSlips;
  const filteredInvoices = safeRange ? args.invoices.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.invoices;
  const todayInvoices = args.invoices.filter((entry) => isSameAppDate(entry.date, today));
  const previousInvoices = previousSafeRange ? args.invoices.filter((entry) => isDateWithinRange(entry.date, previousSafeRange)) : [];
  const filteredProcessing = safeRange ? args.processing.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.processing;
  const filteredMaterialIssues = safeRange ? args.materialIssues.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.materialIssues;
  const filteredMaterialReturns = safeRange ? args.materialReturns.filter((entry) => isDateWithinRange(entry.date, safeRange)) : args.materialReturns;
  const usageMap = buildProductionMaterialUsageMap(
    filteredMaterialIssues,
    args.materialIssueLines,
    filteredMaterialReturns,
    args.materialReturnLines,
    args.issueReelLines,
    args.returnReelLines
  );
  const corrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(
    args.materials,
    filteredMaterialIssues,
    args.materialIssueLines,
    filteredMaterialReturns,
    args.materialReturnLines
  );
  const totalProduction = sumProductionQty(filteredProductions);
  const previousProduction = sumProductionQty(previousProductions);
  const totalProductionMeter = sumProductionMeter(filteredProductions);
  const totalPlanValue = sumPlanValue(filteredSchedules, args.orders);
  const todayPlanQty = sumProductionPlanQty(todayProductions);
  const todayPlanValue = sumProductionPlanValue(todayProductions, args.schedules, args.orders);
  const tomorrowPlanQty = sumProductionPlanQty(tomorrowProductions);
  const tomorrowPlanValue = sumProductionPlanValue(tomorrowProductions, args.schedules, args.orders);
  const nextPlanValue = sumPlanValue(nextSchedules, args.orders);
  const totalActualPaperUsed = getActualPaperUsed(filteredProductions, usageMap);
  const totalScrapSoldQty = Number(args.scrapSoldQty || 0);
  const totalWastageKg = filteredProductions.reduce(
    (sum, production) => sum + getProductionWastageTotals(production, filteredProcessing).totalWastageKg,
    0
  );
  const totalWastage = getWastagePercent(totalWastageKg, totalActualPaperUsed);
  const totalPlanPaper = getPlanPaperTotal(filteredProductions);
  const totalSale = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAfterGst || 0), 0);
  const todaySalesValue = todayInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAfterGst || 0), 0);
  const previousSale = previousInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAfterGst || 0), 0);
  const pendingPlanningRows = getPendingPlanningRows(filteredSchedules, args.dispatchPlans);
  const pendingPlanningValue = sumPendingPlanningValue(filteredSchedules, args.dispatchPlans, args.orders);
  const dispatchPlannedQty = sumDispatchPlanQty(filteredDispatchPlans);
  const dispatchLoadedQty = sumDispatchLoadedQty(filteredDispatchPlans);
  const loadingSlipQty = sumLoadingQty(filteredLoadingSlips);
  const processingTotals = getProcessingTotals(filteredProcessing);
  const fgStockTotal = getFgStockTotal(args.items);
  const reelStockTotals = getReelStockTotals(
    args.materials,
    args.materialIn,
    args.packingSlips,
    args.issueReelLines,
    args.returnReelLines
  );
  const activeJobs = filteredProductions.filter((row) => row.status !== "Cancelled" && !row.cancelTimestamp).length;
  const cancelledJobs = filteredProductions.filter((row) => row.status === "Cancelled" || !!row.cancelTimestamp).length;
  const pendingTallyJobs = filteredProductions.filter(
    (row) => isProductionReadyForTally(row, getProductionActualPaperUsed(row, usageMap), hasProductionCorrugatedSheetUsage(row, corrugatedSheetUsageMap))
  ).length;
  const pendingConsumptionJobs = filteredProductions.filter((row) => row.status === "Pending Consumption").length;
  const wipQty = Math.max(0, totalProduction - loadingSlipQty);
  const groups = [
    {
      id: "production",
      title: "Operation",
      cards: [
        makeCard({ id: "production", label: "Production", value: totalProduction, format: "number" }),
        makeCard({ id: "linearMeter", label: "Linear Meter", value: totalProductionMeter, format: "number" }),
        makeCard({ id: "actualPaperUsed", label: "Actual Paper Used", value: totalActualPaperUsed, format: "number", decimals: 2 }),
        makeCard({ id: "scrapSoldQty", label: "Total Scrap Sold", value: totalScrapSoldQty, format: "number", decimals: 2 }),
        makeCard({ id: "wastage", label: "Total Wastage", value: totalWastage, format: "percent" }),
        makeCard({ id: "planPaper", label: "Plan Paper", value: totalPlanPaper, format: "number" }),
        makeCard({ id: "activeJobs", label: "Active Jobs", value: activeJobs, format: "number" }),
        makeCard({ id: "pendingTally", label: "Pending Tally Jobs", value: pendingTallyJobs, format: "number" })
      ]
    },
    {
      id: "dispatch",
      title: "Dispatch",
      cards: [
        makeCard({ id: "dispatchPlannedQty", label: "Dispatch Planned Qty", value: dispatchPlannedQty, format: "number" }),
        makeCard({ id: "dispatchLoadedQty", label: "Dispatch Loaded Qty", value: dispatchLoadedQty, format: "number" }),
        makeCard({ id: "loadingQty", label: "Loading Slip Qty", value: loadingSlipQty, format: "number" }),
        makeCard({ id: "pendingPlanningValue", label: "Pending Dispatch Value", value: pendingPlanningValue, format: "currency" })
      ]
    },
    {
      id: "sales",
      title: "Sales",
      cards: [
        makeCard({ id: "totalSales", label: "Total Sales", value: totalSale, format: "currency" }),
        makeCard({ id: "todaySalesValue", label: "Today Sales Value", value: todaySalesValue, format: "currency" }),
        makeCard({ id: "invoiceCount", label: "Invoices", value: filteredInvoices.length, format: "number" })
      ]
    }
  ];
  return {
    rangeLabel,
    comparisonLabel,
    groups
  };
}

// src/lib/materialIssueClassification.ts
var normalized = (value) => String(value || "").trim().toLowerCase();
function isAutoProductionInterFirmIssue(issue) {
  return normalized(issue.interFirmFlow) === "yes" && normalized(issue.autoGenerated) === "yes" && normalized(issue.sourceTransactionType) === "production processing";
}
function isDailyConsumableIssue(issue) {
  const type = normalized(issue.issueType);
  return type === "general" || type === "without job" || type === "withoutjob" || type === "without_job";
}
function isPendingDailyConsumableTally(issue) {
  const tallyStatus = normalized(issue.tallyPostingStatus);
  return isDailyConsumableIssue(issue) && !String(issue.tallyTimestamp || "").trim() && tallyStatus !== "not applicable" && tallyStatus !== "cancelled" && !isAutoProductionInterFirmIssue(issue);
}

// src/lib/dailyConsumables.ts
var dateOnly = (value) => String(value || "").slice(0, 10);
function isDailyConsumableIssue2(issueType) {
  const type = String(issueType || "").trim().toLowerCase();
  return type === "general" || type === "without job" || type === "withoutjob" || type === "without_job";
}
function addDay(date) {
  const value = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
function getPendingDailyConsumables(firms, productions, issues, today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
  const firstJobByFirm = /* @__PURE__ */ new Map();
  for (const production of productions) {
    const firmId = String(production.firmId || production.orderFirmId || "").trim();
    const date = dateOnly(production.date);
    if (!firmId || !date) continue;
    const existing = firstJobByFirm.get(firmId);
    if (!existing || date < existing) firstJobByFirm.set(firmId, date);
  }
  const completed = new Set(
    issues.filter((issue) => isDailyConsumableIssue2(issue.issueType) && !isAutoProductionInterFirmIssue(issue)).map((issue) => {
      const firmId = String(issue.firmId || "").trim();
      const date = dateOnly(issue.date);
      return firmId && date ? `${firmId}:${date}` : "";
    }).filter(Boolean)
  );
  const pending = [];
  for (const firm of firms) {
    const firmId = String(firm.id || "").trim();
    const firstJobDate = firstJobByFirm.get(firmId);
    if (!firmId || !firstJobDate) continue;
    for (let date = firstJobDate; date <= today; date = addDay(date)) {
      if (!completed.has(`${firmId}:${date}`)) pending.push({ firmId, firmName: firm.firmName || firmId, date });
    }
  }
  return pending.sort((a, b) => b.date.localeCompare(a.date) || a.firmName.localeCompare(b.firmName));
}

// src/lib/gatePassState.ts
function round23(value) {
  return Number(Number(value || 0).toFixed(2));
}
function isReturnableGatePass(gatePass) {
  return (gatePass.gatePassType || "Non-Returnable") === "Returnable";
}
function getReturnableReceiptLines(materialIn, gatePassId, excludeMaterialInId) {
  return materialIn.filter((entry) => entry.id !== excludeMaterialInId).filter((entry) => entry.mrrType === "Service Return" && entry.sourceGatePassId === gatePassId).flatMap((entry) => entry.lines || []);
}
function getReturnedQtyForGatePassLine(materialIn, gatePassId, gatePassLineId, excludeMaterialInId) {
  return round23(
    getReturnableReceiptLines(materialIn, gatePassId, excludeMaterialInId).filter((line) => line.sourceGatePassLineId === gatePassLineId).reduce((sum, line) => sum + Number(line.actualQty ?? line.qty ?? 0), 0)
  );
}
function getGatePassLinesWithReturns(gatePass, materialIn, excludeMaterialInId) {
  return (gatePass.lines || []).map((line) => {
    const returnedQty = isReturnableGatePass(gatePass) ? getReturnedQtyForGatePassLine(materialIn, gatePass.id, line.id, excludeMaterialInId) : 0;
    const pendingQty = round23(Number(line.qty || 0) - returnedQty);
    return {
      ...line,
      returnedQty,
      pendingQty: pendingQty > 0 ? pendingQty : 0
    };
  });
}
function deriveGatePassState(gatePass, materialIn) {
  if (!isReturnableGatePass(gatePass)) return "Closed";
  if (gatePass.clearOffReason && gatePass.clearedOffAt) return "Cleared Off";
  const lines = getGatePassLinesWithReturns(gatePass, materialIn);
  const totalQty = round23(lines.reduce((sum, line) => sum + Number(line.qty || 0), 0));
  const returnedQty = round23(lines.reduce((sum, line) => sum + Number(line.returnedQty || 0), 0));
  if (returnedQty <= 0) return "Open";
  if (returnedQty >= totalQty) return "Closed";
  return "Partially Returned";
}
function hasSavedReturnableReceiptGateEntry(gatePass, gateEntries) {
  const gatePassId = String(gatePass.id || "").trim();
  if (!gatePassId) return false;
  return gateEntries.some((entry) => {
    const purpose = String(entry.purpose || "").trim();
    const sourceGatePassId = String(entry.sourceGatePassId || "").trim();
    return purpose === "Returnable Receipt" && sourceGatePassId === gatePassId;
  });
}

// src/lib/gateEntryState.ts
function hasGateEntryMrr(entry) {
  return Boolean(
    String(entry?.mrrId || "").trim() || String(entry?.mrrNo || "").trim() || String(entry?.mrrDate || "").trim()
  );
}
function isGateEntryCancelled(entry) {
  return String(entry?.status || "").trim().toLowerCase() === "cancelled" || Boolean(String(entry?.cancelledAt || "").trim());
}
function canCreateMrrForGateEntry(entry) {
  return Boolean(entry) && !isGateEntryCancelled(entry) && !hasGateEntryMrr(entry);
}

// src/lib/mandatoryMachines.ts
function parseMandatoryMachinesByType(setting) {
  const raw = setting?.mandatoryMachinesByType;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed);
    const normalized2 = {};
    for (const [typeName, value] of entries) {
      if (!typeName || typeof typeName !== "string") continue;
      const list = Array.isArray(value) ? value : [];
      const machines = list.map((v) => normalizeMachineName(String(v || "")).trim()).filter(Boolean);
      const key = typeName.trim();
      if (!key) continue;
      normalized2[key] = Array.from(new Set(machines));
    }
    return normalized2;
  } catch {
    return {};
  }
}
function getRequiredMachinesForType(mapping, typeName) {
  const key = String(typeName || "").trim();
  if (!key) return [];
  const exact = mapping[key];
  if (exact) return exact;
  const matchingKey = Object.keys(mapping).find((candidate) => candidate.toUpperCase() === key.toUpperCase());
  return matchingKey ? mapping[matchingKey] : [];
}

// src/lib/productionType.ts
function resolveProductionProcessingRoute(production, phpJobs, plateJobs) {
  const phpId = String(production.phpScheduledJobId || "").trim();
  const plateId = String(production.plateScheduledJobId || "").trim();
  const sourceJob = phpId ? phpJobs.find((job) => String(job.id) === phpId) : plateId ? plateJobs.find((job) => String(job.id) === plateId) : void 0;
  if (!sourceJob) return production;
  return {
    ...production,
    itemSource: phpId ? "PHP" : "PLATE",
    methodology: sourceJob.methodology || production.methodology
  };
}
function getProductionEffectiveType(production, item) {
  if (String(production?.phpScheduledJobId || "").trim()) return "PHP";
  if (String(production?.plateScheduledJobId || "").trim()) return "PLATE";
  const source = String(production?.itemSource || "FG").trim().toUpperCase();
  if (source === "PHP") return "PHP";
  if (source === "PLATE") return "PLATE";
  return String(item?.boxType || item?.raw?.boxType || item?.raw?.typeName || "").trim();
}
function getRequiredMachinesForProduction(production, item, mapping, machines) {
  const source = getProductionEffectiveType(production, item);
  if (source === "PHP" || source === "PLATE") {
    const linkedSourceJobId = String(production.phpScheduledJobId || production.plateScheduledJobId || "").trim();
    if (!linkedSourceJobId) return [];
    const methodology = String(production.methodology || "").trim().toUpperCase();
    if (methodology === "CORRUGATION") {
      return [
        normalizeMachineName("Corrugation Liner"),
        normalizeMachineName("Printing")
      ];
    }
    return [];
  }
  if (!source) {
    return [
      normalizeMachineName("Corrugation Liner"),
      normalizeMachineName("Printing")
    ];
  }
  return getRequiredMachinesForType(mapping, getProductionEffectiveType(production, item));
}

// src/lib/productionProcessingProgress.ts
function isProcessingStepFull(entry) {
  return !entry.completionStatus || entry.completionStatus === "Full";
}
function isMachineStepFull(processing, productionId, machineName) {
  const normalizedName = normalizeMachineName(machineName);
  return processing.some(
    (entry) => entry.productionId === productionId && normalizeMachineName(entry.machineName) === normalizedName && isProcessingStepFull(entry)
  );
}
function isCorrugationLinerComplete(processing, productionId) {
  return Boolean(productionId) && processing.some(
    (entry) => entry.productionId === productionId && normalizeMachineName(entry.machineName) === "Corrugation Liner" && isProcessingStepFull(entry)
  );
}
function getCurrentProcessingMachine(processing, productionId, requiredMachines) {
  const orderedMachines = Array.from(
    new Set(requiredMachines.map((machineName) => normalizeMachineName(machineName)).filter(Boolean))
  );
  return orderedMachines.find(
    (machineName) => !isMachineStepFull(processing, productionId, machineName)
  ) || "";
}

// src/lib/productionScheduleQty.ts
function buildLinkedScheduleMap(rows) {
  const map = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const jobId = String(row.id || "").trim();
    const scheduleId = String(row.scheduleId || "").trim();
    if (!jobId || !scheduleId) return;
    map.set(jobId, scheduleId);
  });
  return map;
}
function hasFilledFfgValue(production) {
  const value = Number(production.prodFromFFG);
  return Number.isFinite(value) && value > 0;
}
function buildScheduleConsumptionByScheduleId(productions, phpJobs = [], plateJobs = []) {
  const map = /* @__PURE__ */ new Map();
  const phpScheduleByJobId = buildLinkedScheduleMap(phpJobs);
  const plateScheduleByJobId = buildLinkedScheduleMap(plateJobs);
  productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp).forEach((production) => {
    const directScheduleId = String(production.scheduleId || "").trim();
    const phpLinkedScheduleId = String(
      phpScheduleByJobId.get(String(production.phpScheduledJobId || "").trim()) || ""
    ).trim();
    const plateLinkedScheduleId = String(
      plateScheduleByJobId.get(String(production.plateScheduledJobId || "").trim()) || ""
    ).trim();
    const effectiveScheduleId = directScheduleId || phpLinkedScheduleId || plateLinkedScheduleId;
    if (!effectiveScheduleId) return;
    const current = map.get(effectiveScheduleId) || {
      plannedQty: 0,
      actualProducedQty: 0,
      plannedWithoutFfgQty: 0,
      effectiveConsumedQty: 0
    };
    if (hasFilledFfgValue(production)) {
      current.actualProducedQty += Number(production.prodFromFFG || 0);
    } else {
      current.plannedWithoutFfgQty += Number(production.qty || 0);
    }
    current.plannedQty = current.actualProducedQty + current.plannedWithoutFfgQty;
    current.effectiveConsumedQty = current.actualProducedQty + current.plannedWithoutFfgQty;
    map.set(effectiveScheduleId, current);
  });
  return map;
}

// src/lib/indentTotals.ts
function getIndentLineOrderedQty(line) {
  return Number(line.orderedQty || 0);
}
function getIndentLineCancelledQty(line) {
  return Number(line.cancelledQty || 0);
}
function getIndentLineBalanceQty(line) {
  return Math.max(0, Number(line.qty || 0) - getIndentLineOrderedQty(line) - getIndentLineCancelledQty(line));
}
function normalizeIndentLine(line) {
  const orderedQty = getIndentLineOrderedQty(line);
  const cancelledQty = getIndentLineCancelledQty(line);
  return {
    ...line,
    orderedQty,
    cancelledQty,
    balanceQty: getIndentLineBalanceQty(line)
  };
}
function summarizeIndentLines(lines) {
  const normalizedLines = lines.map(normalizeIndentLine);
  const totalIndentQty = normalizedLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const totalOrderedQty = normalizedLines.reduce((sum, line) => sum + Number(line.orderedQty || 0), 0);
  const totalCancelledQty = normalizedLines.reduce((sum, line) => sum + Number(line.cancelledQty || 0), 0);
  const totalBalanceQty = normalizedLines.reduce((sum, line) => sum + Number(line.balanceQty || 0), 0);
  return {
    normalizedLines,
    totalIndentQty,
    totalOrderedQty,
    totalCancelledQty,
    totalBalanceQty
  };
}
function withIndentTotals(indent, lines) {
  const totals = summarizeIndentLines(lines);
  return {
    ...indent,
    totalIndentQty: totals.totalIndentQty,
    totalOrderedQty: totals.totalOrderedQty,
    totalCancelledQty: totals.totalCancelledQty,
    totalBalanceQty: totals.totalBalanceQty
  };
}

// src/lib/reelTransfer.ts
var DEFAULT_REEL_TRANSFER_WINDOW_HOURS = 12;
var normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
function positiveFinite(value) {
  const numberValue2 = Number(value || 0);
  return Number.isFinite(numberValue2) && numberValue2 > 0 ? numberValue2 : 0;
}
function getValidTime(primary, fallback) {
  const primaryTime = new Date(String(primary || "")).getTime();
  if (Number.isFinite(primaryTime) && primaryTime > 0) return primaryTime;
  const fallbackTime = new Date(String(fallback || "")).getTime();
  return Number.isFinite(fallbackTime) && fallbackTime > 0 ? fallbackTime : 0;
}
function getCorrugationFullTime(processing, productionId) {
  const times = processing.filter((row) => row.productionId === productionId && normalize(row.machineName) === "corrugation liner" && normalize(row.completionStatus) === "full").map((row) => getValidTime(row.updateTimestamp, row.date)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  return times[0] || 0;
}
function buildReelTransferContext(production, processing, issueReels, returnReels, issueLines, productions, windowHours, now = Date.now()) {
  const fullTime = getCorrugationFullTime(processing, production.id);
  const expiresAt = fullTime + windowHours * 60 * 60 * 1e3;
  const belongsToJob = (row) => row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo);
  const sourceIssues = issueReels.filter(belongsToJob);
  const sourceReturns = returnReels.filter(belongsToJob);
  const issuedBySlip = /* @__PURE__ */ new Map();
  const latestIssueBySlip = /* @__PURE__ */ new Map();
  const returnedSlipIds = new Set(
    sourceReturns.filter((row) => Number(row.weightKg || 0) > 4e-3).map((row) => String(row.packingSlipId || "").trim()).filter(Boolean)
  );
  const returnedReelNos = new Set(
    sourceReturns.filter((row) => Number(row.weightKg || 0) > 4e-3).map((row) => normalize(row.ourReelNo)).filter(Boolean)
  );
  sourceIssues.forEach((row) => {
    const slipId = String(row.packingSlipId || "").trim();
    if (!slipId) return;
    issuedBySlip.set(slipId, (issuedBySlip.get(slipId) || 0) + Number(row.weightKg || 0));
    latestIssueBySlip.set(slipId, row);
  });
  const lineById = new Map(issueLines.map((line) => [line.id, line]));
  const reels = Array.from(issuedBySlip.entries()).flatMap(([packingSlipId, issuedWeightKg]) => {
    const issue = latestIssueBySlip.get(packingSlipId);
    if (!issue || issuedWeightKg <= 0) return [];
    if (returnedSlipIds.has(packingSlipId) || returnedReelNos.has(normalize(issue.ourReelNo))) return [];
    const availableWeightKg = round2(issuedWeightKg);
    const line = lineById.get(issue.materialIssueLineId);
    const rate = Number(line?.rate || line?.lastPurchaseRate || line?.openingRate || 0);
    return [{ ...issue, packingSlipId, weightKg: availableWeightKg, originalIssuedWeightKg: round2(issuedWeightKg), rate }];
  });
  const totalIssuedKg = sourceIssues.reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const totalReturnedKg = sourceReturns.reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const planQty = positiveFinite(production.qty) || positiveFinite(production.plannedQty);
  const requiredKg = positiveFinite(production.totalPaperWeight);
  const corrugationQty = processing.filter((row) => row.productionId === production.id && normalize(row.machineName) === "corrugation liner" && getValidTime(row.updateTimestamp, row.date) <= fullTime).reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const consumedKg = planQty > 0 ? corrugationQty * requiredKg / planQty : 0;
  const notionalLeftKg = Math.max(0, totalIssuedKg - totalReturnedKg - consumedKg);
  const outstandingOriginalIssuedKg = reels.reduce((sum, reel) => sum + Number(reel.originalIssuedWeightKg || 0), 0);
  const reelsWithNotionalTransfer = reels.map((reel) => {
    const proportionalNotionalWeight = outstandingOriginalIssuedKg > 0 ? notionalLeftKg * Number(reel.originalIssuedWeightKg || 0) / outstandingOriginalIssuedKg : 0;
    const transferWeightKg = round2(Math.min(reel.weightKg, proportionalNotionalWeight));
    return { ...reel, transferWeightKg, amount: round2(transferWeightKg * reel.rate) };
  });
  let status = "eligible";
  if (!fullTime) status = "corrugation_incomplete";
  else if (now > expiresAt) status = "window_expired";
  else if (!reels.length) status = "no_reel_balance";
  else if (planQty <= 0) status = "plan_quantity_missing";
  else if (requiredKg <= 0) status = "job_weight_missing";
  else if (notionalLeftKg <= 4e-3) status = "no_unused_weight";
  const formatKg = (value) => `${round2(value).toFixed(2)} KG`;
  const reasonByStatus = {
    eligible: "Eligible",
    corrugation_incomplete: "Transfer unavailable: Corrugation Liner must be completed as Full before reel balance can be transferred.",
    window_expired: `Transfer unavailable: the ${windowHours}-hour transfer window has expired since Corrugation Liner was completed.`,
    no_reel_balance: `Transfer unavailable: no remaining issued reel balance is available after returns (issued ${formatKg(totalIssuedKg)}, returned ${formatKg(totalReturnedKg)}).`,
    plan_quantity_missing: `Transfer unavailable: production/planned quantity is missing or zero (current value ${round2(planQty)}).`,
    job_weight_missing: `Transfer unavailable: required paper weight (totalPaperWeight) is missing or zero (current value ${formatKg(requiredKg)}).`,
    no_unused_weight: `Transfer unavailable: no unused reel weight remains after Corrugation (issued ${formatKg(totalIssuedKg)}, returned ${formatKg(totalReturnedKg)}, Corrugation consumed ${formatKg(consumedKg)}, remaining ${formatKg(notionalLeftKg)}).`
  };
  return {
    fullTime,
    expiresAt,
    eligible: status === "eligible",
    status,
    reason: reasonByStatus[status],
    totalIssuedKg: round2(totalIssuedKg),
    totalReturnedKg: round2(totalReturnedKg),
    planQty: round2(planQty),
    requiredKg: round2(requiredKg),
    corrugationQty: round2(corrugationQty),
    consumedKg: round2(consumedKg),
    notionalLeftKg: round2(notionalLeftKg),
    outstandingReelCount: reels.length,
    reels: reelsWithNotionalTransfer
  };
}

// src/lib/orderItems.ts
function normalizeOrderItemSource(value) {
  const normalized2 = String(value || "").trim().toUpperCase();
  if (normalized2 === "PHP") return "PHP";
  if (normalized2 === "PLATE") return "PLATE";
  if (normalized2 === "MATERIAL") return "MATERIAL";
  return "FG";
}
function getOrderItemCompositeKey(source, itemId) {
  return `${normalizeOrderItemSource(source)}::${String(itemId || "").trim()}`;
}
var toFiniteNumber = (value) => {
  const numberValue2 = Number(value);
  return Number.isFinite(numberValue2) ? numberValue2 : void 0;
};
function normalizeOrderCatalogItem(row, source) {
  const normalizedSource = normalizeOrderItemSource(source);
  const id = String(
    row?.id || row?.npdId || row?.itemId || row?.materialId || row?.erpItemCode || row?.masterItemNameErpCode || ""
  ).trim();
  if (!id) return null;
  const name = String(
    row?.name || row?.itemName || row?.masterItemNameErpCode || row?.erpItemCode || row?.erp || row?.erpCode || ""
  ).trim();
  const erp = String(
    row?.erp ?? row?.erpCode ?? row?.erpItemCode ?? row?.masterItemNameErpCode ?? ""
  ).trim();
  const companyName = String(
    row?.customerName || row?.customer || row?.companyName || row?.company || ""
  ).trim();
  return {
    id,
    source: normalizedSource,
    name: name || erp || id,
    erp,
    companyName,
    rate: toFiniteNumber(row?.rate),
    gstRate: toFiniteNumber(row?.gstRate),
    uom: String(row?.uom || "").trim() || void 0,
    boxType: String(row?.boxType || "").trim() || void 0,
    raw: row
  };
}
function normalizeOrderRecord(order) {
  return {
    ...order,
    itemSource: normalizeOrderItemSource(order?.itemSource)
  };
}

// src/lib/pendingLoadingEligibility.ts
var normalizeKey = (value) => String(value ?? "").trim().toLowerCase();
var normalizeText = (value) => String(value ?? "").trim();
function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}
function addKey(keys, value) {
  const key = normalizeKey(value);
  if (key) keys.add(key);
}
function itemKeys(item, order) {
  const keys = /* @__PURE__ */ new Set();
  const raw = item?.raw || {};
  [
    item?.id,
    item?.erp,
    raw.id,
    raw.itemId,
    raw.npdId,
    raw.phpId,
    raw.plateId,
    raw.materialId,
    raw.erp,
    raw.erpCode,
    raw.erpItemCode,
    raw.masterItemNameErpCode,
    order?.itemId,
    order?.npdId,
    order?.erpCode
  ].forEach((value) => addKey(keys, value));
  return keys;
}
function productionItemKeys(production) {
  const keys = /* @__PURE__ */ new Set();
  [production.itemId, production.npdId, production.erpCode, production.masterErp].forEach((value) => addKey(keys, value));
  return keys;
}
function getJobFirmId(production) {
  return firstText(
    production.orderFirmId,
    production.sourceFirmId,
    production.destinationFirmId,
    production.firmId
  );
}
function isTruthyMarker(value) {
  return ["yes", "true", "1", "posted", "tallied", "completed", "closed"].includes(normalizeKey(value));
}
function isClosedOrTallied(production) {
  const status = normalizeKey(production.status);
  return ["cancelled", "canceled", "completed", "closed", "tallied"].includes(status) || Boolean(normalizeText(production.cancelTimestamp)) || Boolean(normalizeText(production.tallyTimestamp)) || Boolean(normalizeText(production.closeDate)) || normalizeKey(production.closeBy) === "yes" || isTruthyMarker(production.tallyPostingStatus);
}
function loadedQtyByJobId(slips) {
  const loaded = /* @__PURE__ */ new Map();
  slips.forEach((slip) => {
    if (["cancelled", "canceled"].includes(normalizeKey(slip.status))) return;
    (slip.lines || []).forEach((line) => {
      (line.allocations || []).forEach((allocation) => {
        if (normalizeKey(allocation.sourceType) !== "job") return;
        const jobId = normalizeKey("jobId" in allocation ? allocation.jobId : "");
        if (!jobId) return;
        const quantity = Number("qty" in allocation ? allocation.qty || 0 : 0);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        loaded.set(jobId, (loaded.get(jobId) || 0) + quantity);
      });
    });
  });
  return loaded;
}
function getDispatchPlanPendingQty(plan) {
  const pending = Number(plan.plannedQty || 0) - Number(plan.loadedQty || 0) - Number(plan.canceledQty || 0);
  return Number.isFinite(pending) ? Math.max(
    0,
    pending
  ) : 0;
}
function getLoadingJobNumber(production) {
  return firstText(production.transactionNo, production.jobCardNo);
}
function eligibleLoadingJobs(itemSource, itemId, firmId, productions, phpJobs, plateJobs, alreadyLoaded, itemAliases = []) {
  const source = normalizeOrderItemSource(itemSource);
  const sourceJobs = source === "PHP" ? phpJobs : source === "PLATE" ? plateJobs : productions;
  const targetItemKeys = /* @__PURE__ */ new Set();
  [itemId, ...itemAliases].forEach((value) => addKey(targetItemKeys, value));
  const targetFirm = normalizeKey(firmId);
  if (targetItemKeys.size === 0) return [];
  return sourceJobs.filter((production) => {
    const matchesItem = Array.from(productionItemKeys(production)).some((key) => targetItemKeys.has(key));
    if (!matchesItem) return false;
    const jobFirm = normalizeKey(getJobFirmId(production));
    if (targetFirm && jobFirm && targetFirm !== jobFirm) return false;
    if (!targetFirm && jobFirm) return false;
    if (isClosedOrTallied(production)) return false;
    const productionQty = Number(
      source === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0
    );
    return Number.isFinite(productionQty) && productionQty > 0;
  }).map((production) => {
    const productionQty = Number(
      source === "FG" ? production.prodFromFFG || 0 : production.productionOutputQty || 0
    );
    const loaded = alreadyLoaded.get(normalizeKey(production.id)) || 0;
    return {
      jobId: production.id,
      jobNo: getLoadingJobNumber(production),
      productionQty,
      alreadyLoaded: loaded,
      yetToLoad: Math.max(0, productionQty - loaded)
    };
  }).filter((job) => Boolean(job.jobNo) && job.yetToLoad > 0).sort(
    (a, b) => b.jobNo.localeCompare(a.jobNo, void 0, { numeric: true, sensitivity: "base" })
  ).slice(0, 3);
}
function resolveFirmId(plan, schedule, order, firms = []) {
  const raw = firstText(plan.orderFirmId, plan.firmId, schedule?.firmId, order?.firmId);
  const firm = firms.find((row) => normalizeKey(row.id) === normalizeKey(raw));
  return normalizeText(firm?.id || raw);
}
function getPendingLoadingPlanProjections(args) {
  const orderById = new Map(args.orders.map((order) => [normalizeKey(order.id), order]));
  const scheduleById = new Map(args.schedules.map((schedule) => [normalizeKey(schedule.id), schedule]));
  const companyById = new Map((args.companies || []).map((company) => [normalizeKey(company.id), company]));
  const loaded = loadedQtyByJobId(args.loadingSlips);
  return args.plans.flatMap((plan) => {
    const pendingQty = getDispatchPlanPendingQty(plan);
    if (pendingQty <= 0) return [];
    const order = orderById.get(normalizeKey(plan.orderId));
    const schedule = scheduleById.get(normalizeKey(plan.scheduleId));
    const itemFromOrder = args.resolveOrderItem?.(order);
    const source = normalizeOrderItemSource(order?.itemSource || itemFromOrder?.source);
    const item = itemFromOrder || args.findItemAcrossSources?.(
      firstText(order?.itemId, order?.npdId),
      source,
      firstText(order?.erpCode)
    );
    const firmId = resolveFirmId(plan, schedule, order, args.firms);
    const eligibleJobs = eligibleLoadingJobs(
      source,
      item?.id || firstText(order?.itemId, order?.npdId),
      firmId,
      args.productions,
      args.phpJobs,
      args.plateJobs,
      loaded,
      Array.from(itemKeys(item, order))
    );
    return [{
      plan,
      order,
      schedule,
      item,
      company: companyById.get(normalizeKey(order?.companyId)),
      firmId,
      itemSource: source,
      pendingQty,
      eligibleJobs
    }];
  });
}
function countEligibleLoadingPlans(args) {
  return getPendingLoadingPlanProjections(args).length;
}

// src/lib/pendingTaskCounts.ts
var isPendingPH = (status) => !status || status === "Pending PH";
function parseLocalYmd(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}
function normalizeErpCode(value) {
  return String(value || "").trim().toLowerCase();
}
function toOptionalNumber(value) {
  const numberValue2 = Number(value);
  return Number.isFinite(numberValue2) && numberValue2 > 0 ? numberValue2 : void 0;
}
function groupBy(rows, getKey) {
  const groups = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const key = getKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });
  return groups;
}
function firstBy(rows, getKey) {
  const index = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!index.has(key)) index.set(key, row);
  });
  return index;
}
function indexItemsByErp(items) {
  const index = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    const raw = item.raw || {};
    [item.erp, raw.erpItemCode, raw.masterItemNameErpCode].forEach((value) => {
      const key = normalizeErpCode(value);
      if (!index.has(key)) index.set(key, item);
    });
  });
  return index;
}
function findItemByErpIndexed(index, erpCode) {
  const normalizedErp = normalizeErpCode(erpCode);
  if (!normalizedErp) return void 0;
  return index.get(normalizedErp);
}
function getSetsPerBox(item) {
  return toOptionalNumber(item?.raw?.numberOfSetsPerBox);
}
function getScheduledQty(schedule) {
  return Math.max(Number(schedule.qty || 0) - Number(schedule.canceledQty || 0), 0);
}
function getPendingProductionPlanCount(schedules, productions, phpJobs, plateJobs) {
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() + 2);
  cutoffDate.setHours(23, 59, 59, 999);
  const consumptionByScheduleId = buildScheduleConsumptionByScheduleId(productions, phpJobs, plateJobs);
  const getPendingProductionQty = (schedule) => Math.max(
    Number(schedule.qty || 0) - Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0) - Number(schedule.canceledQty || 0),
    0
  );
  return schedules.filter((schedule) => {
    if (getPendingProductionQty(schedule) <= 0) return false;
    const scheduledDate = parseLocalYmd(schedule.scheduledDate);
    if (!scheduledDate) return false;
    return scheduledDate.getTime() <= cutoffDate.getTime();
  }).length;
}
function getPendingLinkedPlanningCount(source, schedules, orders, fgProductions, phpJobs, plateJobs, resolveOrderItem, itemsBySource = {}) {
  const sourceItems = itemsBySource[source] || [];
  const jobRows = source === "PHP" ? phpJobs : plateJobs;
  const plannedQtyByScheduleId = /* @__PURE__ */ new Map();
  jobRows.forEach((row) => {
    if (!row.scheduleId) return;
    if (row.status === "Cancelled" || row.cancelTimestamp) return;
    const effectiveQty = Math.max(0, Number(row.plannedQty || row.qty || 0));
    if (effectiveQty <= 0) return;
    plannedQtyByScheduleId.set(row.scheduleId, (plannedQtyByScheduleId.get(row.scheduleId) || 0) + effectiveQty);
  });
  const orderById = firstBy(orders, (order) => order.id);
  const sourceItemById = firstBy(sourceItems, (item) => item.id);
  const sourceItemByErp = indexItemsByErp(sourceItems);
  return schedules.filter((schedule) => {
    const order = orderById.get(schedule.orderId);
    const fgItem = resolveOrderItem?.(order);
    const scheduledQty = getScheduledQty(schedule);
    const isDirectSourceOrder = order?.itemSource === source;
    const scheduleErp = String(order?.erpCode || fgItem?.erp || "").trim();
    const linkedItem = isDirectSourceOrder ? sourceItemById.get(String(order?.itemId || "").trim()) : findItemByErpIndexed(sourceItemByErp, scheduleErp);
    const setsPerBox = getSetsPerBox(linkedItem);
    const requiredQty = isDirectSourceOrder ? scheduledQty : linkedItem && setsPerBox ? Number((scheduledQty * setsPerBox).toFixed(2)) : 0;
    const alreadyPlannedQty = Number(plannedQtyByScheduleId.get(schedule.id) || 0);
    const remainingQty = Math.max(0, Number((requiredQty - alreadyPlannedQty).toFixed(2)));
    if (scheduledQty <= 0 || !linkedItem || remainingQty <= 0) return false;
    return isDirectSourceOrder || Boolean(setsPerBox);
  }).length;
}
function getPendingPhpPlateProductionCount(phpJobs, plateJobs) {
  return [...phpJobs, ...plateJobs].filter((job) => job.status !== "Cancelled").filter((job) => String(job.scheduledDate || "").trim() && String(job.shift || "").trim() && String(job.sequence || "").trim()).filter((job) => !String(job.jobCompletionTimeOutput || "").trim() || !(Number(job.productionOutputQty || 0) > 0)).length;
}
function getPendingMachineProcessingCount(productions, machines = [], processing = [], settings = [], findItemAcrossSources, user, machineNameFilter) {
  if (machines.length === 0) return 0;
  const normalizedMachineNameFilter = machineNameFilter ? normalizeMachineName(machineNameFilter) : "";
  const mandatoryMachinesMapping = parseMandatoryMachinesByType(settings[0]);
  const isMachineAssignedToOperator = (machine) => {
    if (user?.role !== "Operator") return true;
    const assignedIds = Array.isArray(machine.assignedOperatorIds) ? machine.assignedOperatorIds : [];
    const assignedNames = Array.isArray(machine.assignedOperatorNames) ? machine.assignedOperatorNames : [];
    const normalizedUserName = String(user.name || "").trim().toLowerCase();
    return assignedIds.includes(String(user.id || "")) || assignedNames.some((name) => String(name || "").trim().toLowerCase() === normalizedUserName);
  };
  const visibleMachineIds = new Set(machines.filter(isMachineAssignedToOperator).map((machine) => machine.id));
  const processingByProductionId = groupBy(processing, (row) => row.productionId);
  return productions.filter((p) => p.status !== "Completed" && p.status !== "Cancelled" && !p.cancelTimestamp && !p.tallyTimestamp).reduce((count, production) => {
    const processing2 = processingByProductionId.get(production.id) || [];
    const item = findItemAcrossSources?.(String(production.itemId || "").trim(), production.itemSource, production.erpCode);
    const requiredMachines = Array.from(
      new Set(
        getRequiredMachinesForProduction(production, item, mandatoryMachinesMapping, machines).map((machineName) => normalizeMachineName(machineName)).filter(Boolean)
      )
    );
    const currentMachineName = getCurrentProcessingMachine(processing2, production.id, requiredMachines);
    const pendingForProduction = requiredMachines.filter((machineName) => {
      const normalizedRequiredMachine = normalizeMachineName(machineName);
      if (normalizedRequiredMachine !== currentMachineName) return false;
      if (normalizedMachineNameFilter && normalizedRequiredMachine !== normalizedMachineNameFilter) return false;
      const machine = machines.find((m) => normalizeMachineName(m.name) === normalizedRequiredMachine);
      if (!machine || !visibleMachineIds.has(machine.id)) return false;
      const reportedForThisMachine = processing2.filter((row) => row.productionId === production.id && normalizeMachineName(row.machineName) === normalizedRequiredMachine).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const pending = Math.max(0, Number(production.qty || 0) - reportedForThisMachine);
      return !isMachineStepFull(processing2, production.id, normalizedRequiredMachine) && (pending > 0 || reportedForThisMachine > 0);
    }).length;
    return count + pendingForProduction;
  }, 0);
}
function getPendingReturnableGatePassCount(gatePasses = [], gateEntries, materialIn) {
  return gatePasses.filter((gatePass) => isReturnableGatePass(gatePass)).filter((gatePass) => !hasSavedReturnableReceiptGateEntry(gatePass, gateEntries)).filter((gatePass) => {
    const state = deriveGatePassState(gatePass, materialIn);
    return state === "Open" || state === "Partially Returned";
  }).length;
}
function buildPendingTaskCounts(args) {
  const firms = Array.isArray(args.firms) ? args.firms : [];
  const purchaseOrderLines = args.purchaseOrderLines || [];
  const receivedQtyByPoLineId = /* @__PURE__ */ new Map();
  args.materialIn.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      if (!line?.poLineId) return;
      receivedQtyByPoLineId.set(
        line.poLineId,
        Number(receivedQtyByPoLineId.get(line.poLineId) || 0) + Number(line.actualQty || line.qty || 0)
      );
    });
  });
  const getPoLineCancelledQty = (line) => Math.max(0, Number(line.cancelledQty || 0));
  const getPoLinePendingQty = (line) => Math.max(0, Number(line.qty || 0) - Number(receivedQtyByPoLineId.get(line.id) || 0) - getPoLineCancelledQty(line));
  const indentLinesByIndentId = groupBy(args.indentLines, (line) => line.indentId);
  const normalizedIndents = args.indents.map(
    (indent) => withIndentTotals(indent, indentLinesByIndentId.get(indent.id) || [])
  );
  const approvedIndentIds = new Set(
    normalizedIndents.filter((indent) => indent.status === "Approved").map((indent) => indent.id)
  );
  const orderById = firstBy(args.orders, (order) => order.id);
  const npdItemById = firstBy(args.npdItems, (item) => item.id);
  const activeProductionIds = new Set(
    args.productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp).map((production) => production.id)
  );
  const processingByProductionId = groupBy(args.processing || [], (row) => row.productionId);
  const plannedQtyByScheduleId = /* @__PURE__ */ new Map();
  args.dispatchPlans.forEach((plan) => {
    plannedQtyByScheduleId.set(plan.scheduleId, (plannedQtyByScheduleId.get(plan.scheduleId) || 0) + Number(plan.plannedQty || 0));
  });
  const upcomingConsumptionByScheduleId = buildScheduleConsumptionByScheduleId(args.productions, args.phpJobMaster, args.plateJobMaster);
  const productionUsageMap = buildProductionMaterialUsageMap(
    args.materialIssues,
    args.materialIssueLines,
    args.materialReturns,
    args.materialReturnLines,
    args.materialIssueReelLines,
    args.materialReturnReelLines
  );
  const productionCorrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(
    args.materials,
    args.materialIssues,
    args.materialIssueLines,
    args.materialReturns,
    args.materialReturnLines
  );
  const pendingConsumptionTallyCount = args.materialIssues.filter(isPendingDailyConsumableTally).length;
  const pendingPhpLoadingTallyCount = args.phpLoadingSlips.filter(
    (slip) => String(slip.phpConsumptionTransactionNo || "").trim() !== "" && String(slip.tallyTimestamp || "").trim() === "" && String(slip.status || "Active").trim().toLowerCase() !== "cancelled"
  ).length;
  const pendingPlateLoadingTallyCount = args.plateLoadingSlips.filter(
    (slip) => String(slip.plateConsumptionTransactionNo || "").trim() !== "" && String(slip.tallyTimestamp || "").trim() === "" && String(slip.status || "Active").trim().toLowerCase() !== "cancelled"
  ).length;
  const linkedPhpIds = new Set(args.productions.map((production) => String(production.phpScheduledJobId || "").trim()).filter(Boolean));
  const linkedPlateIds = new Set(args.productions.map((production) => String(production.plateScheduledJobId || "").trim()).filter(Boolean));
  const processingCandidates = [
    ...args.productions.map((production) => resolveProductionProcessingRoute(production, args.phpJobMaster, args.plateJobMaster)),
    ...args.phpJobMaster.filter((job) => !linkedPhpIds.has(String(job.id))).map((job) => ({ ...job, itemSource: "PHP" })),
    ...args.plateJobMaster.filter((job) => !linkedPlateIds.has(String(job.id))).map((job) => ({ ...job, itemSource: "PLATE" }))
  ];
  return {
    "/material-receipt/approvals": args.materialIn.filter((m) => ["Pending PH", "Pending Accounts", "Pending MD"].includes(m.status)).length,
    "/material-receipt/pending-ph-approval": args.materialIn.filter((m) => m.status === "Pending PH").length,
    "/material-receipt/pending-accounts-approval": args.materialIn.filter((m) => m.status === "Pending Accounts").length,
    "/material-receipt/pending-md-approval": args.materialIn.filter((m) => m.status === "Pending MD").length,
    "/material-receipt/pending-tally": args.materialIn.filter((m) => m.status === "Pending Tally" && String(m.mrrType || "").trim().toLowerCase() !== "rejection in").length,
    "/production/pending": getPendingProductionPlanCount(args.schedules, args.productions, args.phpJobMaster, args.plateJobMaster),
    "/production/pending-npd": args.schedules.filter((schedule) => {
      const order = orderById.get(schedule.orderId);
      if (!order || order.status === "Cancelled") return false;
      const item = npdItemById.get(String(order.itemId || "").trim());
      if (!item) return false;
      const boxType = String(item.boxType || "").trim();
      const rapcValue = String(item.rapc ?? "").trim();
      return !boxType && !rapcValue;
    }).length,
    "/production/pending-consumption": args.productions.filter(
      (p) => isProductionPendingConsumption(p, getProductionActualPaperUsed(p, productionUsageMap), hasProductionCorrugatedSheetUsage(p, productionCorrugatedSheetUsageMap))
    ).length,
    "/production/pending-material-return": new Set(
      getAllReturnableReelLines(args.materialIssueReelLines, args.materialReturnReelLines, args.productions).filter((line) => activeProductionIds.has(line.productionId) && isCorrugationLinerComplete(args.processing || [], line.productionId)).map((line) => line.productionId)
    ).size,
    "/production/pending-job-transfer": (() => {
      const windowHours = Number(args.settings?.[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);
      const now = Date.now();
      return args.productions.filter((production) => {
        if (production.status === "Cancelled" || production.cancelTimestamp) return false;
        const fullTime = getCorrugationFullTime(processingByProductionId.get(production.id) || [], production.id);
        if (!fullTime || now > fullTime + windowHours * 60 * 60 * 1e3) return false;
        return buildReelTransferContext(
          production,
          args.processing || [],
          args.materialIssueReelLines,
          args.materialReturnReelLines,
          args.materialIssueLines,
          args.productions,
          windowHours,
          now
        ).eligible;
      }).length;
    })(),
    "/production/pending-tally": args.productions.filter(
      (p) => isProductionReadyForTally(p, getProductionActualPaperUsed(p, productionUsageMap), hasProductionCorrugatedSheetUsage(p, productionCorrugatedSheetUsageMap))
    ).length,
    "/production/pending-job-closure": args.pendingJobClosureCount || 0,
    "/production/pending-machine-processing": getPendingMachineProcessingCount(
      processingCandidates,
      args.machines,
      args.processing,
      args.settings,
      args.findItemAcrossSources,
      args.user
    ),
    "/production/pending-printing": getPendingMachineProcessingCount(
      processingCandidates,
      args.machines,
      args.processing,
      args.settings,
      args.findItemAcrossSources,
      args.user,
      "Printing"
    ),
    "/production/php/pending-planning": getPendingLinkedPlanningCount(
      "PHP",
      args.schedules,
      args.orders,
      args.productions,
      args.phpJobMaster,
      args.plateJobMaster,
      args.resolveOrderItem,
      args.itemsBySource
    ),
    "/production/plate/pending-planning": getPendingLinkedPlanningCount(
      "PLATE",
      args.schedules,
      args.orders,
      args.productions,
      args.phpJobMaster,
      args.plateJobMaster,
      args.resolveOrderItem,
      args.itemsBySource
    ),
    "/production/php-plate/pending-production": getPendingPhpPlateProductionCount(args.phpJobMaster, args.plateJobMaster),
    "/indent/pending": normalizedIndents.filter((i) => i.status === "Pending").length,
    "/purchase-orders/pending-indent-lines": args.indentLines.filter(
      (line) => approvedIndentIds.has(line.indentId) && Number(line.qty || 0) - Number(line.cancelledQty || 0) - Number(line.orderedQty || 0) > 0
    ).length,
    "/purchase-orders/pending-approval": args.purchaseOrders.filter((po) => po.status === "Pending Approval").length,
    "/purchase-orders/item-not-received": purchaseOrderLines.filter((line) => getPoLinePendingQty(line) > 0).length,
    "/purchase-orders/item-cancelled": purchaseOrderLines.filter((line) => getPoLineCancelledQty(line) > 0).length,
    "/material-receipt/pending-mrr": args.gateEntries.filter(canCreateMrrForGateEntry).length,
    "/material-receipt/pending-debit-note": args.materialIn.filter((m) => m.debitNote && !m.tallyTimestamp).length,
    "/material-receipt/pending-credit-note": args.materialIn.filter((m) => m.mrrType === "Rejection In" && !m.creditTallyTimestamp).length,
    "/material-movement/pending-non-job-issue": getPendingDailyConsumables(firms, args.productions, args.materialIssues).length,
    "/material-movement/pending-consumption-tally": pendingConsumptionTallyCount,
    "/loading/php/pending-tally": pendingPhpLoadingTallyCount,
    "/loading/plate/pending-tally": pendingPlateLoadingTallyCount,
    "/samples/pending": args.sampleRequests.filter((s) => !s.jobCardNo && !s.cancelTimestamp).length,
    "/orders/pending-ph": args.orders.filter((o) => isPendingPH(o.status)).length,
    "/orders/pending-scheduling": args.orders.filter((o) => o.status === "Pending Scheduling").length,
    "/dispatch/pending-planning": args.schedules.filter((schedule) => {
      if (!schedule?.scheduledDate) return false;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);
      const schedDate = new Date(schedule.scheduledDate);
      const alreadyPlanned = plannedQtyByScheduleId.get(schedule.id) || 0;
      const balance = Number(schedule.qty || 0) - alreadyPlanned;
      return !Number.isNaN(schedDate.getTime()) && schedDate <= tomorrow && balance > 0;
    }).length,
    "/loading/pending": countEligibleLoadingPlans({
      plans: args.dispatchPlans,
      orders: args.orders,
      schedules: args.schedules,
      productions: args.productions,
      phpJobs: args.phpJobMaster,
      plateJobs: args.plateJobMaster,
      loadingSlips: args.loadingSlips,
      resolveOrderItem: args.resolveOrderItem,
      findItemAcrossSources: args.findItemAcrossSources
    }),
    "/billing/pending": args.loadingSlips.filter((slip) => !slip.invoiceId && slip.status !== "Cancelled").length,
    "/billing/pending-tally": args.invoices.filter((invoice) => !invoice.tallyTimestamp).length,
    "/gate-pass/pending-returnable": getPendingReturnableGatePassCount(args.gatePasses, args.gateEntries, args.materialIn),
    "/orders/upcoming": args.schedules.filter((schedule) => {
      if (!schedule?.scheduledDate) return false;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const cutoffDate = new Date(today);
      cutoffDate.setDate(cutoffDate.getDate() + 2);
      cutoffDate.setHours(23, 59, 59, 999);
      const consumptionByScheduleId = upcomingConsumptionByScheduleId;
      const getPendingProductionQty = (row) => Math.max(
        Number(row.qty || 0) - Number(consumptionByScheduleId.get(row.id)?.effectiveConsumedQty || 0) - Number(row.canceledQty || 0),
        0
      );
      const scheduledDate = parseLocalYmd(schedule.scheduledDate);
      if (!scheduledDate) return false;
      return scheduledDate.getTime() > cutoffDate.getTime() && getPendingProductionQty(schedule) > 0;
    }).length,
    "/plant-head": args.materialIn.filter((m) => isPendingPH(m.status)).length + args.productions.filter(isProductionPendingPH).length + args.orders.filter((o) => isPendingPH(o.status)).length + (args.consumptions || []).filter((c) => isPendingPH(c.status)).length
  };
}

// src/lib/wastageReport.ts
var num = (v) => Number.isFinite(Number(v || 0)) ? Number(v || 0) : 0;
var dateTime = (v) => {
  const s = String(v || "").slice(0, 10);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? (/* @__PURE__ */ new Date(`${s}T00:00:00`)).getTime() : new Date(String(v || "")).getTime();
  return Number.isFinite(t) ? t : null;
};
function buildScrapInvoiceRows({ invoices, lineItems, companies, filters, findItem, findItemAcrossSources }) {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const from = filters?.fromDate ? dateTime(filters.fromDate) : null;
  const to = filters?.toDate ? dateTime(filters.toDate) : null;
  const companyId = String(filters?.companyId || "");
  const needle = String(filters?.searchTerm || "").toLowerCase();
  return lineItems.map((line) => {
    const invoice = invoiceMap.get(line.invoiceId);
    if (!invoice) return null;
    const source = normalizeOrderItemSource(line.itemSource);
    const item = findItem(source, line.itemId) || (line.npdId ? findItem("FG", line.npdId) : void 0) || findItemAcrossSources(line.itemId, source);
    const itemName = String(item?.name || "Unknown");
    if (!itemName.toLowerCase().includes("scrap")) return null;
    const row = { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo || "-", invoiceDate: invoice.date, companyId: invoice.companyId, companyName: companyMap.get(invoice.companyId)?.name || "Unknown Company", erp: String(item?.erp || ""), itemName, qty: num(line.qty), rate: num(line.rate), taxableAmount: num(line.amount), cgst: num(line.cgst), sgst: num(line.sgst), igst: num(line.igst), totalAmount: num(line.amount) + num(line.cgst) + num(line.sgst) + num(line.igst) };
    const t = dateTime(row.invoiceDate);
    const textValue = row.invoiceNo + " " + row.companyName + " " + row.erp + " " + row.itemName;
    if (from !== null && (t === null || t < from) || to !== null && (t === null || t > to) || companyId && row.companyId !== companyId || needle && !textValue.toLowerCase().includes(needle)) return null;
    return row;
  }).filter((r) => Boolean(r));
}
function summarizeScrapInvoiceRows(rows) {
  const ids = new Set(rows.map((r) => r.invoiceId));
  return { totalQty: rows.reduce((s, r) => s + r.qty, 0), taxableAmount: rows.reduce((s, r) => s + r.taxableAmount, 0), gstValue: rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0), totalAmount: rows.reduce((s, r) => s + r.totalAmount, 0), invoiceCount: ids.size };
}

// src/lib/orderItemCatalog.ts
var getLookupKeys = (source, row) => {
  const normalizedSource = normalizeOrderItemSource(source);
  const keys = [
    row?.id,
    row?.itemId,
    row?.npdId,
    row?.phpId,
    row?.plateId,
    row?.materialId,
    row?.raw?.id,
    row?.raw?.itemId,
    row?.raw?.npdId,
    row?.raw?.phpId,
    row?.raw?.plateId,
    row?.raw?.materialId
  ];
  return [...new Set(keys.map((value) => String(value || "").trim()).filter(Boolean))].map(
    (value) => getOrderItemCompositeKey(normalizedSource, value)
  );
};
function createOrderItemCatalog({ fgRows, phpRows, plateRows, materialRows }) {
  const itemsBySource = {
    FG: fgRows.map((row) => normalizeOrderCatalogItem(row, "FG")).filter(Boolean),
    PHP: phpRows.map((row) => normalizeOrderCatalogItem(row, "PHP")).filter(Boolean),
    PLATE: plateRows.map((row) => normalizeOrderCatalogItem(row, "PLATE")).filter(Boolean),
    MATERIAL: materialRows.map((row) => normalizeOrderCatalogItem(row, "MATERIAL")).filter(Boolean)
  };
  const itemMap = (() => {
    const map = /* @__PURE__ */ new Map();
    Object.keys(itemsBySource).forEach((source) => {
      itemsBySource[source].forEach((item) => {
        getLookupKeys(source, item).forEach((key) => {
          if (!map.has(key)) {
            map.set(key, item);
          }
        });
      });
    });
    return map;
  })();
  const findItem = (source, itemId) => {
    const normalizedSource = normalizeOrderItemSource(source);
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) return void 0;
    return itemMap.get(getOrderItemCompositeKey(normalizedSource, normalizedItemId));
  };
  const findItemAcrossSources = (itemId, preferredSource, erpCode) => {
    const normalizedItemId = String(itemId || "").trim();
    const normalizedErp = String(erpCode || "").trim().toLowerCase();
    const orderedSources = [preferredSource, "FG", "PHP", "PLATE", "MATERIAL"].map((source) => normalizeOrderItemSource(source)).filter((source, index, arr) => arr.indexOf(source) === index);
    if (normalizedItemId) {
      for (const source of orderedSources) {
        const match = findItem(source, normalizedItemId);
        if (match) return match;
      }
    }
    if (normalizedErp) {
      for (const source of orderedSources) {
        const match = (itemsBySource[source] || []).find((item) => {
          const raw = item.raw || {};
          return [item.erp, raw.erpCode, raw.erpItemCode, raw.masterItemNameErpCode].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).includes(normalizedErp);
        });
        if (match) return match;
      }
    }
    return void 0;
  };
  const resolveOrderItem = (order) => {
    if (!order) return void 0;
    const normalizedOrder = normalizeOrderRecord(order);
    const lookupCandidates = [
      normalizedOrder.itemId,
      normalizedOrder.itemSource === "FG" ? normalizedOrder.npdId : ""
    ];
    for (const candidate of lookupCandidates) {
      const match = findItem(normalizedOrder.itemSource, String(candidate || ""));
      if (match) return match;
    }
    return void 0;
  };
  return {
    fgItems: itemsBySource.FG,
    phpItems: itemsBySource.PHP,
    plateItems: itemsBySource.PLATE,
    materialItems: itemsBySource.MATERIAL,
    allItems: Object.values(itemsBySource).flat().sort(
      (left, right) => `${left.source} ${left.name}`.localeCompare(`${right.source} ${right.name}`, void 0, { sensitivity: "base" })
    ),
    itemsBySource,
    itemMap,
    findItem,
    findItemAcrossSources,
    resolveOrderItem
  };
}

// src/lib/productionCalculations.ts
var numberValue = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
function calculateProductionReel(input) {
  const breadth = numberValue(input.breadth);
  const height = numberValue(input.height);
  const ups = numberValue(input.ups);
  const idToOd = numberValue(input.idToOd);
  return breadth === 0 ? height * ups : (breadth + height) * ups + (idToOd * ups + 16);
}

// src/lib/internalUps.ts
function calculateInternalUps(rapcForSingleBox) {
  const rapcValue = Number(rapcForSingleBox);
  if (!Number.isFinite(rapcValue) || rapcValue <= 0) return void 0;
  return Math.floor(1320 / rapcValue);
}
function round24(value) {
  return Math.round(value * 100) / 100;
}
function positiveNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}
function calculateProductionRapc(input) {
  const breadth = positiveNumber(input.breadth);
  const height = positiveNumber(input.height);
  const ups = positiveNumber(input.ups);
  if (ups <= 0) return void 0;
  const ply = Number(input.ply || 0);
  const idToOd = ply === 3 ? 6 : ply === 5 ? 10 : 0;
  const rapc = calculateProductionReel({ breadth, height, ups, idToOd });
  return Number.isFinite(rapc) && rapc > 0 ? round24(rapc) : void 0;
}
function calculateInternalRapc(item) {
  const savedInternalUps = Number(item.internalUps);
  const internalUps = Number.isFinite(savedInternalUps) && savedInternalUps > 0 ? savedInternalUps : calculateInternalUps(item.rapcForSingleBox);
  return calculateProductionRapc({ ...item, ups: internalUps });
}

// src/lib/collectionLoader.ts
var MAX_CONCURRENT_REQUESTS = 4;
var queue = [];
var activeRequests = 0;
var sidebarReleased = false;
var completedNpdLoads = /* @__PURE__ */ new Map();
var completedLoads = /* @__PURE__ */ new Map();
var DERIVED_ENTITIES = /* @__PURE__ */ new Set([
  "npd",
  "items",
  "npd_firm_wise",
  "npd_catalog",
  "materials",
  "invoice_line_items",
  "production_processing"
]);
function normalizeEntityName(name) {
  return String(name || "").trim().toLowerCase().replace(/^\/?api\//, "").replace(/[-/]/g, "_");
}
function realtimeChangeAffects(changed, entities, derived = false) {
  if (!changed.length || changed.includes("*")) return true;
  const names = entities.map(normalizeEntityName);
  if (derived || names.some((name) => DERIVED_ENTITIES.has(name))) return true;
  const changedNames = new Set(changed.map(normalizeEntityName));
  return names.some((name) => changedNames.has(name));
}
function clearCollectionCache(changed = ["*"]) {
  sharedLoads.forEach((task) => {
    task.invalidated = true;
  });
  if (!changed.length || changed.includes("*")) {
    completedLoads.clear();
    completedNpdLoads.clear();
    return;
  }
  for (const [key, entry] of completedLoads) {
    if (realtimeChangeAffects(changed, Array.from(entry.tables), entry.derived)) completedLoads.delete(key);
  }
  completedNpdLoads.clear();
}
if (typeof window !== "undefined" && !window.__lngrpCollectionCacheHooks) {
  window.__lngrpCollectionCacheHooks = true;
  window.addEventListener("app-realtime-data-changed", (event) => {
    clearCollectionCache(event.detail?.entities || ["*"]);
  });
  window.addEventListener("active-firm-changed", () => clearCollectionCache());
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (/\/api\//.test(url) && !/\/api\/(?:get-pending-job-closure|realtime\/)/.test(url)) clearCollectionCache();
      }
    } catch {
      clearCollectionCache();
    }
    return originalFetch(input, init);
  };
}
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    sidebarReleased = true;
    pumpQueue();
  }, 5e3);
}
function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length) {
    const index = queue.findIndex((entry2) => entry2.priority === "page");
    if (index < 0 && !sidebarReleased) return;
    const [entry] = queue.splice(index < 0 ? 0 : index, 1);
    if (entry.signal.aborted) {
      entry.reject(new DOMException("Request cancelled", "AbortError"));
      continue;
    }
    activeRequests += 1;
    entry.run();
  }
}
var sharedLoads = /* @__PURE__ */ new Map();

// src/lib/npdItems.ts
function normalizeConsumableValue(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  const normalized2 = String(raw || "").trim().toLowerCase();
  if (!normalized2) return false;
  const truthy = /* @__PURE__ */ new Set(["1", "true", "yes", "y", "on"]);
  return truthy.has(normalized2);
}
function getNpdItemDisplayName(item) {
  return String(item?.name || item?.itemName || item?.erp || "").trim();
}
function normalizeNpdItem(row) {
  const resolvedId = String(row?.id || row?.npdId || row?.itemId || "").trim();
  return {
    ...row,
    id: resolvedId,
    consumable: normalizeConsumableValue(row?.consumable),
    internalUps: calculateInternalUps(row?.rapcForSingleBox),
    internalRapc: row?.internalRapc ?? calculateInternalRapc(row),
    itemId: resolvedId,
    npdId: resolvedId,
    name: getNpdItemDisplayName(row)
  };
}

// src/lib/operationDashboardCompute.ts
var PROCESSING_MACHINE_CARD_ORDER = [
  "Corrugation Paper",
  "Corrugation Liner",
  "Printing",
  "Pasting",
  "Rotary",
  "Slotting",
  "Stitching",
  "Punching",
  "Gluing"
];
function firstById(rows, getKey) {
  const index = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const key = getKey(row);
    if (!index.has(key)) index.set(key, row);
  });
  return index;
}
function computeOperationDashboard(lists, options) {
  const {
    productions,
    firms,
    phpJobMaster,
    plateJobMaster,
    materials,
    materialIn,
    packingSlips,
    schedules,
    orders,
    companies,
    gateEntries,
    dispatchPlans,
    processing,
    loadingSlips,
    materialIssues,
    materialIssueLines,
    issueReelLines,
    materialReturns,
    materialReturnLines,
    returnReelLines,
    invoices,
    invoiceLineItems,
    consumptions,
    sampleRequests,
    indents,
    indentLines,
    purchaseOrders,
    phpLoadingSlips,
    plateLoadingSlips,
    gatePasses,
    machines,
    settings
  } = lists;
  const { dateRange, closedJobFilter } = options;
  const npdItems = lists.npdFirmWiseRows.map(normalizeNpdItem);
  const { resolveOrderItem, findItem, findItemAcrossSources, itemsBySource } = createOrderItemCatalog({
    fgRows: lists.catalogFgRows,
    phpRows: lists.catalogPhpRows,
    plateRows: lists.catalogPlateRows,
    materialRows: lists.catalogMaterialRows
  });
  const safeRange = (() => getSafeRange(dateRange))();
  const filteredProductions = (() => safeRange ? productions.filter((entry) => isDateWithinRange(entry.date, safeRange)) : productions)();
  const processingTotalsMap = (() => {
    const map = /* @__PURE__ */ new Map();
    processing.forEach((row) => {
      const totals = map.get(row.productionId) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      const machineColumn = PROCESSING_MACHINE_COLUMNS.find(
        (col) => col.machineNames.includes(row.machineName)
      );
      if (machineColumn) totals[machineColumn.key] += Number(row.qty || 0);
      map.set(row.productionId, totals);
    });
    return map;
  })();
  const loadedQtyByProductionId = (() => {
    const map = /* @__PURE__ */ new Map();
    const getJobAllocations = (line) => Array.isArray(line.allocations) ? line.allocations.filter((allocation) => allocation.sourceType === "job") : [];
    loadingSlips.filter((slip) => slip.status !== "Cancelled").forEach((slip) => {
      slip.lines.forEach((line) => {
        getJobAllocations(line).forEach((allocation) => {
          map.set(allocation.jobId, (map.get(allocation.jobId) || 0) + Number(allocation.qty || 0));
        });
      });
    });
    return map;
  })();
  const erpLeastGsmMap = (() => {
    const map = /* @__PURE__ */ new Map();
    productions.forEach((p) => {
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      const erp = String(p.erpCode || "").trim();
      const gsm = Number(p.gsm || 0);
      if (erp && gsm > 0) {
        if (!map.has(erp) || gsm < map.get(erp)) map.set(erp, gsm);
      }
    });
    return map;
  })();
  const filteredMaterialIssues = (() => safeRange ? materialIssues.filter((entry) => isDateWithinRange(entry.date, safeRange)) : materialIssues)();
  const filteredMaterialReturns = (() => safeRange ? materialReturns.filter((entry) => isDateWithinRange(entry.date, safeRange)) : materialReturns)();
  const productionUsageMap = (() => {
    return buildProductionMaterialUsageMap(
      filteredMaterialIssues,
      materialIssueLines,
      filteredMaterialReturns,
      materialReturnLines,
      issueReelLines,
      returnReelLines
    );
  })();
  const scrapInvoiceSummary = (() => {
    const scrapRows = buildScrapInvoiceRows({
      invoices,
      lineItems: invoiceLineItems,
      companies,
      filters: { fromDate: dateRange.from, toDate: dateRange.to },
      findItem,
      findItemAcrossSources
    });
    return summarizeScrapInvoiceRows(scrapRows);
  })();
  const scheduleById = firstById(schedules, (s) => s.id);
  const orderById = firstById(orders, (o) => o.id);
  const companyById = firstById(companies, (c) => c.id);
  const npdItemById = firstById(npdItems, (i) => i.id);
  const rows = (() => {
    const sorted = filteredProductions.map((p) => {
      const schedule = scheduleById.get(p.scheduleId);
      const order = orderById.get(schedule?.orderId);
      const company = companyById.get(order?.companyId);
      const item = npdItemById.get(p.itemId);
      const processingTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      const loadedQty = Number(loadedQtyByProductionId.get(p.id) || 0);
      const erp = String(p.erpCode || "").trim();
      const leastGsm = erp ? erpLeastGsmMap.get(erp) ?? null : null;
      const actualPaperUsed = getProductionActualPaperUsed(p, productionUsageMap);
      return {
        srNo: 0,
        production: p,
        item,
        schedule,
        order,
        company,
        processingTotals,
        loadedQty,
        leastGsm,
        actualPaperUsed
      };
    }).filter((row) => {
      const isClosedJob = Boolean(row.production.closeDate || row.production.closeBy || row.production.status === "Completed");
      if (closedJobFilter === "yes" && !isClosedJob) return false;
      if (closedJobFilter === "no" && isClosedJob) return false;
      return true;
    }).sort((a, b) => b.production.transactionNo.localeCompare(a.production.transactionNo, void 0, { numeric: true, sensitivity: "base" }));
    return sorted.map((row, idx) => ({ ...row, srNo: idx + 1 }));
  })();
  const summary = (() => buildOperationDashboardSummary({
    dateRange,
    productions,
    schedules,
    orders,
    dispatchPlans,
    loadingSlips,
    invoices,
    scrapSoldQty: scrapInvoiceSummary.totalQty,
    items: npdItems,
    materials,
    materialIn,
    packingSlips,
    processing,
    materialIssues,
    materialIssueLines,
    issueReelLines,
    materialReturns,
    materialReturnLines,
    returnReelLines
  }))();
  const pendingCounts = buildPendingTaskCounts({
    firms,
    materialIn,
    productions,
    phpJobMaster,
    plateJobMaster,
    materials,
    orders,
    npdItems,
    consumptions,
    materialIssues,
    materialIssueLines,
    materialIssueReelLines: issueReelLines,
    materialReturns,
    materialReturnLines,
    materialReturnReelLines: returnReelLines,
    sampleRequests,
    indents,
    indentLines,
    purchaseOrders,
    gateEntries,
    schedules,
    dispatchPlans,
    loadingSlips,
    phpLoadingSlips,
    plateLoadingSlips,
    invoices,
    gatePasses,
    machines,
    processing,
    settings,
    pendingJobClosureCount: 0,
    resolveOrderItem,
    findItemAcrossSources,
    itemsBySource
  });
  const processingMachineCards = (() => {
    const machineMap = /* @__PURE__ */ new Map();
    processing.filter((entry) => safeRange ? isDateWithinRange(entry.date, safeRange) : true).forEach((entry) => {
      const machineName = normalizeMachineName(entry.machineName || "").trim();
      if (!machineName) return;
      const current = machineMap.get(machineName) || { qty: 0, entries: 0 };
      current.qty += Number(entry.qty || 0);
      current.entries += 1;
      machineMap.set(machineName, current);
    });
    const cards = PROCESSING_MACHINE_CARD_ORDER.map((machineName) => {
      const totals = machineMap.get(machineName) || { qty: 0, entries: 0 };
      return {
        id: `processing-${machineName.toLowerCase().replace(/\s+/g, "-")}`,
        label: machineName,
        value: totals.qty,
        format: "number",
        note: `${totals.entries} entr${totals.entries === 1 ? "y" : "ies"}`,
        status: "ready"
      };
    });
    machineMap.forEach((totals, machineName) => {
      if (PROCESSING_MACHINE_CARD_ORDER.includes(machineName)) return;
      cards.push({
        id: `processing-${machineName.toLowerCase().replace(/\s+/g, "-")}`,
        label: machineName,
        value: totals.qty,
        format: "number",
        note: `${totals.entries} entr${totals.entries === 1 ? "y" : "ies"}`,
        status: "ready"
      });
    });
    return cards;
  })();
  const exportRows = options.includeExportRows ? (() => {
    return rows.map((r) => ({
      "Sr. No.": r.srNo,
      "Job No.": r.production.transactionNo || "-",
      "Order No.": r.order?.orderNo || "-",
      "ERP Code": r.production.erpCode || "-",
      Company: r.company?.name || "-",
      "Plan Date": formatDate2(r.production.date),
      "Item Name": r.item?.name || "-",
      Sample: r.item?.isSample ? "Yes" : "-",
      Type: r.item?.boxType || "-",
      "Planned Qty": `${r.production.qty ?? "-"} ${r.production.uom || ""}`.trim(),
      UPS: r.production.ups || r.item?.ups || "-",
      "Loaded Qty": r.loadedQty,
      Paper: r.processingTotals.paper,
      Liner: r.processingTotals.liner,
      Print: r.processingTotals.printing,
      Paste: r.processingTotals.pasting,
      Stitch: r.processingTotals.stitching,
      Punch: r.processingTotals.punching,
      Glue: r.processingTotals.gluing,
      L: r.production.length ?? "-",
      B: r.production.breadth ?? "-",
      H: r.production.height ?? "-",
      "L (OD)": r.item?.lOd ?? "-",
      "W (OD)": r.item?.wOd ?? "-",
      "H (OD)": r.item?.hOd ?? "-",
      Ply: r.production.ply ?? "-",
      Flute: r.production.flute ?? "-",
      L1: r.production.l1 || r.item?.l1 || "-",
      F1: r.production.f1 || r.item?.f1 || "-",
      L2: r.production.l2 || r.item?.l2 || "-",
      F2: r.production.f2 || r.item?.f2 || "-",
      L3: r.production.l3 || r.item?.l3 || "-",
      "L1 Paper": r.production.l1 ?? "-",
      GSM: r.production.gsm ?? "-",
      "Least GSM": r.leastGsm === null ? "-" : r.leastGsm,
      "Color 1": r.production.color1 ?? "-",
      "Color 2": r.production.color2 ?? "-",
      "Printing Color": r.production.printingColor ?? "-",
      "Total Wt": r.production.totalPaperWeight ?? "-",
      "Real/KG": Number(r.production.realizationPerKg || 0) ? Number(r.production.realizationPerKg || 0).toFixed(2) : "-",
      "Reel (Calc)": r.production.reelAsPerCalc || "-",
      "Reel Trim": r.production.reelActualWithTrimming || "-",
      "Cutting Trim": r.production.cuttingWithTrimming || r.item?.cuttingSize || "-",
      "Planned Prod (M)": r.production.plannedProductionInMeter ?? "-",
      "Sheet Wt": r.production.sheetWeight || "-",
      "Flute Batch": r.production.fluteBatches || "-",
      Rate: Number(r.production.rate) ? Number(r.production.rate).toFixed(2) : r.production.rate || "-",
      Value: Number(r.production.qty || 0) && Number(r.production.rate || 0) ? (Number(r.production.qty || 0) * Number(r.production.rate || 0)).toLocaleString() : "-",
      "Production FFG": Number(r.production.prodFromFFG || 0),
      "Actual Paper (KG)": Number(r.actualPaperUsed.toFixed(2)),
      "Job Closer": r.production.closeBy || "-",
      "Close Date": r.production.closeDate || "-"
    }));
  })() : void 0;
  return { summary, processingMachineCards, pendingCounts, exportRows };
}
export {
  PROCESSING_MACHINE_CARD_ORDER,
  computeOperationDashboard
};
