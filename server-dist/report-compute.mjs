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
  const numberValue3 = Number(value);
  return Number.isFinite(numberValue3) ? numberValue3 : void 0;
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
        getLookupKeys(source, item).forEach((key5) => {
          if (!map.has(key5)) {
            map.set(key5, item);
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
  const erpIndexBySource = /* @__PURE__ */ new Map();
  const getErpIndex = (source) => {
    let index = erpIndexBySource.get(source);
    if (!index) {
      index = /* @__PURE__ */ new Map();
      for (const item of itemsBySource[source] || []) {
        const raw = item.raw || {};
        for (const value of [item.erp, raw.erpCode, raw.erpItemCode, raw.masterItemNameErpCode]) {
          const key5 = String(value || "").trim().toLowerCase();
          if (key5 && !index.has(key5)) index.set(key5, item);
        }
      }
      erpIndexBySource.set(source, index);
    }
    return index;
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
        const match = getErpIndex(source).get(normalizedErp);
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

// src/lib/rapcRanges.ts
var RAPC_RANGE_SEED_ROWS = [
  [1100, 1103, 1100],
  [1104, 1125, 1125],
  [1126, 1128, 1125],
  [1129, 1150, 1150],
  [1151, 1153, 1150],
  [1154, 1175, 1175],
  [1176, 1178, 1175],
  [1179, 1200, 1200],
  [1201, 1203, 1200],
  [1203, 1225, 1225],
  [1225, 1228, 1225],
  [1229, 1250, 1250],
  [1251, 1253, 1250],
  [1254, 1275, 1275],
  [1276, 1278, 1275],
  [1279, 1300, 1300],
  [1301, 1303, 1300],
  [1304, 1325, 1325],
  [1326, 1328, 1325],
  [1329, 1350, 1350],
  [1351, 1353, 1350],
  [1354, 1375, 1375],
  [1376, 1378, 1375],
  [1379, 1400, 1400],
  [1401, 1403, 1400],
  [1404, 1425, 1425],
  [1426, 1428, 1425],
  [1429, 1450, 1450],
  [1451, 1453, 1450],
  [1454, 1475, 1475],
  [1476, 1478, 1475],
  [1479, 1500, 1500],
  [1501, 1503, 1500],
  [1504, 1525, 1525],
  [1525, 1528, 1525],
  [1529, 1550, 1550],
  [1551, 1553, 1550],
  [1554, 1575, 1575],
  [1576, 1578, 1575],
  [1579, 1600, 1600],
  [1600, 1603, 1600],
  [1604, 1625, 1625],
  [1626, 1628, 1625],
  [1629, 1650, 1650],
  [1651, 1653, 1650],
  [1654, 1675, 1675],
  [1676, 1678, 1675],
  [1679, 1700, 1700],
  [1701, 1703, 1700],
  [1704, 1725, 1725],
  [1726, 1728, 1725],
  [1729, 1750, 1750],
  [1751, 1753, 1750],
  [1754, 1775, 1775],
  [1775, 1778, 1775],
  [1779, 1800, 1800],
  [1801, 1803, 1800],
  [1804, 1825, 1825],
  [1826, 1828, 1825],
  [1829, 1850, 1850],
  [1851, 1853, 1850],
  [1854, 1875, 1875],
  [1876, 1878, 1875],
  [1879, 1900, 1900],
  [1901, 1903, 1900],
  [1904, 1925, 1925],
  [1926, 1928, 1925],
  [1929, 1950, 1950],
  [1951, 1953, 1950],
  [1954, 1975, 1975],
  [1976, 1978, 1975],
  [1979, 2e3, 2e3],
  [2001, 2003, 2e3],
  [2004, 2025, 2025],
  [2026, 2028, 2025],
  [2029, 2050, 2050],
  [2051, 2053, 2050],
  [2054, 2075, 2075],
  [2076, 2078, 2075],
  [2079, 2100, 2100],
  [2101, 2103, 2100],
  [214, 2125, 2125],
  [2126, 2128, 2125],
  [2129, 2150, 2150],
  [2151, 2153, 2150],
  [2154, 2175, 2175],
  [2176, 2178, 2175],
  [2179, 2203, 2200],
  [2204, 2230, 2225],
  [0, 1099, 100],
  [2231, 5e3, 200]
];
function buildSeedRapcRanges() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  return RAPC_RANGE_SEED_ROWS.map(([from, to, rapcRange], index) => ({
    id: `rapc-range-seed-${index + 1}`,
    from,
    to,
    rapcRange,
    updatedBy: "System Seed",
    updateTimestamp: timestamp
  }));
}
function getEffectiveRapcRanges(ranges) {
  return ranges.length > 0 ? ranges : buildSeedRapcRanges();
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
function getNextReelNumber(values, configuredStart) {
  const start = normalizeStartNumber(configuredStart);
  const width = String(start).length;
  const highest = values.reduce((max, value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits || digits.length > width) return max;
    return Math.max(max, extractNumericSequence(digits));
  }, 0);
  return Math.max(start, highest + 1);
}
function formatOurReelNo(value) {
  return String(Math.max(1, Math.floor(Number(value) || 1))).padStart(5, "0");
}

// src/lib/materialMovement.ts
function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}
var OPENING_REEL_MATERIAL_IN_ID = "OPENING";
function normalizeReference(value) {
  return String(value || "").trim().toLowerCase();
}
function isOpeningReelPackingSlip(slip) {
  return normalizeReference(slip.materialInId) === normalizeReference(OPENING_REEL_MATERIAL_IN_ID);
}
function isActiveReelMaterial(material) {
  return Boolean(
    material && normalizeReference(material.type) === "reel" && normalizeReference(material.active || "Yes") !== "no"
  );
}
function calculateMaterialIssueAmount(qty, rate) {
  return round2(round2(qty) * round2(rate));
}
function getMaterialInLineRate(line) {
  const invoiceRate = Number(line.invoiceRate || 0);
  if (invoiceRate > 0) return invoiceRate;
  const poRate = Number(line.poRate || 0);
  if (poRate > 0) return poRate;
  const rate = Number(line.rate || 0);
  if (rate > 0) return rate;
  const actualQty = Number(line.actualQty || 0);
  const actualValue = Number(line.actualValue || 0);
  return actualQty > 0 && actualValue > 0 ? actualValue / actualQty : 0;
}
function resolveMaterialIssueRate(materialId, materials, materialIn, qty, options) {
  const material = materials.find((entry) => entry.id === materialId);
  const firmId = String(options?.firmId || "").trim();
  const firmOpening = firmId ? options?.firmOpenings?.find(
    (opening) => opening.materialId === materialId && String(opening.firmId || "").trim() === firmId
  ) : void 0;
  const openingRate = round2(Number(firmOpening?.openingRate ?? material?.openingRate ?? 0));
  const latestPurchaseLine = materialIn.filter((entry) => !firmId || String(entry.firmId || "").trim() === firmId).flatMap(
    (entry) => entry.lines.filter((line) => line.lineType !== "Service" && line.itemId === materialId).map((line) => ({
      line,
      time: new Date(entry.timestamp || entry.date || 0).getTime() || 0
    }))
  ).sort((a, b) => b.time - a.time)[0]?.line;
  const lastPurchaseRate = latestPurchaseLine ? round2(getMaterialInLineRate(latestPurchaseLine)) : 0;
  const effectiveOpeningRate = options?.useLatestRateAsOpeningRate && lastPurchaseRate > 0 ? lastPurchaseRate : openingRate;
  const rate = lastPurchaseRate > 0 ? lastPurchaseRate : openingRate;
  const effectiveRate = options?.useLatestRateAsOpeningRate ? effectiveOpeningRate : rate;
  return {
    lastPurchaseRate,
    openingRate: effectiveOpeningRate,
    rate: effectiveRate,
    amount: calculateMaterialIssueAmount(qty, effectiveRate)
  };
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
    const key5 = String(line.packingSlipId || "");
    if (!key5) return;
    const rows2 = issueLinesByPackingSlipId.get(key5) || [];
    rows2.push(line);
    issueLinesByPackingSlipId.set(key5, rows2);
  });
  const returnLinesByPackingSlipId = /* @__PURE__ */ new Map();
  filteredReturnLines.forEach((line) => {
    const key5 = String(line.packingSlipId || "");
    if (!key5) return;
    const rows2 = returnLinesByPackingSlipId.get(key5) || [];
    rows2.push(line);
    returnLinesByPackingSlipId.set(key5, rows2);
  });
  const getRelatedLines = (map, keys) => {
    const rows2 = [];
    const seen = /* @__PURE__ */ new Set();
    keys.forEach((key5) => {
      if (seen.has(key5)) return;
      seen.add(key5);
      rows2.push(...map.get(key5) || []);
    });
    return rows2;
  };
  const firstOpeningReelNo = getNextReelNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);
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

// src/lib/utils.ts
var takeUpFactorMap = {
  A: 1.5,
  B: 1.35,
  C: 1.42,
  E: 1.26,
  "B+C": 1.38,
  "B+E": 1.3
};
function calculateTakeUpFactor(flute) {
  if (!flute) return "";
  const normalized2 = flute.toUpperCase().trim().replace(/\s+/g, "");
  return takeUpFactorMap[normalized2] ?? "";
}

// src/lib/productionCalculations.ts
var numberValue = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
function calculateProductionTakeUpFactor(flute) {
  const factor = calculateTakeUpFactor(String(flute ?? ""));
  return factor === "" ? 0 : factor;
}
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
function round23(value) {
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
  return Number.isFinite(rapc) && rapc > 0 ? round23(rapc) : void 0;
}
function calculateInternalRapc(item) {
  const savedInternalUps = Number(item.internalUps);
  const internalUps = Number.isFinite(savedInternalUps) && savedInternalUps > 0 ? savedInternalUps : calculateInternalUps(item.rapcForSingleBox);
  return calculateProductionRapc({ ...item, ups: internalUps });
}

// src/lib/reports/paperRequirement.ts
var KG_CONVERSION_FACTOR = 1e9;
function parseAppDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const onlyDate = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
    const [year, month, day] = onlyDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function round24(value) {
  return Number(Number(value || 0).toFixed(2));
}
function makeKey(rapcRange, gsm) {
  return `${rapcRange}__${gsm}`;
}
function parseKey(key5) {
  const [rapcRangeRaw, gsmRaw] = key5.split("__");
  return { rapcRange: rapcRangeRaw === "Unmapped" ? "Unmapped" : Number(rapcRangeRaw || 0), gsm: Number(gsmRaw || 0) };
}
function resolveRapcValue(input, ranges) {
  if (!Number.isFinite(input) || input <= 0) return "Unmapped";
  const match = getEffectiveRapcRanges(ranges).find((row) => input >= Number(row.from || 0) && input <= Number(row.to || 0));
  return match ? Number(match.rapcRange || 0) : "Unmapped";
}
function getMaterialRapcInput(material) {
  const rapc = Number(material?.rapc || 0);
  if (rapc > 0) return rapc;
  const size = Number(material?.size || 0);
  return size > 0 ? size * 10 : 0;
}
function addToMap(map, row, qty) {
  if (!row.gsm || !Number.isFinite(row.gsm) || !Number.isFinite(qty) || qty === 0) return;
  const key5 = makeKey(row.rapcRange, row.gsm);
  map.set(key5, (map.get(key5) || 0) + qty);
}
function firstPositiveNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}
function getRawValue(item, key5) {
  return item?.raw?.[key5] ?? item?.[key5];
}
function getItemNumber(item, ...keys) {
  return firstPositiveNumber(...keys.map((key5) => getRawValue(item, key5)));
}
function getItemText(item, ...keys) {
  for (const key5 of keys) {
    const value = String(getRawValue(item, key5) ?? "").trim();
    if (value) return value;
  }
  return "";
}
function getFgInternalRapc(item) {
  if (item?.source !== "FG") return 0;
  const raw = item.raw || {};
  return firstPositiveNumber(getItemNumber(item, "internalRapc"), calculateInternalRapc(raw));
}
function getFgInternalUps(item) {
  if (item?.source !== "FG") return 0;
  return firstPositiveNumber(getItemNumber(item, "internalUps"), calculateInternalUps(getRawValue(item, "rapcForSingleBox")));
}
function buildLeastCostByErp(productions) {
  const map = /* @__PURE__ */ new Map();
  productions.forEach((production) => {
    if (production.status === "Cancelled" || production.cancelTimestamp) return;
    const erp = String(production.erpCode || production.masterErp || "").trim().toLowerCase();
    const gsm = Number(production.gsm || 0);
    if (!erp || !Number.isFinite(gsm) || gsm <= 0) return;
    const current = map.get(erp);
    if (!current || gsm < Number(current.gsm || 0)) map.set(erp, production);
  });
  return map;
}
function calculateLayerWeightKg(args) {
  const { cuttingSize, rapc, gsm, ups } = args;
  if (cuttingSize <= 0 || rapc <= 0 || gsm <= 0 || ups <= 0) return 0;
  const factor = args.takeUpFactor && args.takeUpFactor > 0 ? args.takeUpFactor : 1;
  return cuttingSize * rapc * gsm * factor / (KG_CONVERSION_FACTOR * ups);
}
function computePaperRequirement(lists, options) {
  const {
    productions,
    orders,
    schedules,
    dispatchPlans,
    loadingSlips,
    materials,
    materialIn,
    packingSlips,
    issueEntries,
    issueReelLines,
    returnEntries,
    returnReelLines,
    purchaseOrders,
    purchaseOrderLines,
    rapcRanges
  } = lists;
  const { resolveOrderItem } = options;
  const parsedUpto = parseAppDate(options.uptoDate);
  const filteredTimestamp = parsedUpto ? normalizeDate(parsedUpto).getTime() : normalizeDate(/* @__PURE__ */ new Date()).getTime();
  const effectiveRanges = getEffectiveRapcRanges(rapcRanges);
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const issueMap = new Map(issueEntries.map((entry) => [entry.id, entry]));
  const returnMap = new Map(returnEntries.map((entry) => [entry.id, entry]));
  const leastCostByErp = buildLeastCostByErp(productions);
  const invoicedQtyBySchedule = /* @__PURE__ */ new Map();
  const plansById = new Map(dispatchPlans.map((plan) => [plan.id, plan]));
  loadingSlips.forEach((slip) => {
    if (!slip.invoiceId) return;
    (slip.lines || []).forEach((line) => {
      const scheduleId = plansById.get(line.dispatchPlanId)?.scheduleId;
      if (!scheduleId) return;
      invoicedQtyBySchedule.set(scheduleId, (invoicedQtyBySchedule.get(scheduleId) || 0) + Number(line.loadedQty || 0));
    });
  });
  const requirementByKey = /* @__PURE__ */ new Map();
  schedules.forEach((schedule) => {
    const scheduledDate = parseAppDate(schedule.scheduledDate);
    if (!scheduledDate || normalizeDate(scheduledDate).getTime() > filteredTimestamp) return;
    const order = orderMap.get(schedule.orderId);
    if (!order || order.status === "Cancelled") return;
    const pendingQty = Math.max(0, Number(schedule.qty || 0) - Number(schedule.canceledQty || 0) - Number(invoicedQtyBySchedule.get(schedule.id) || 0));
    if (pendingQty <= 0) return;
    const item = resolveOrderItem(order);
    const erp = String(order.erpCode || item?.erp || "").trim().toLowerCase();
    const leastCost = erp ? leastCostByErp.get(erp) : void 0;
    const rapc = firstPositiveNumber(getFgInternalRapc(item), getItemNumber(item, "rapc", "rapcForSingleBox"));
    const rapcRange = resolveRapcValue(rapc, effectiveRanges);
    const cuttingSize = firstPositiveNumber(getItemNumber(item, "cuttingSize", "cuttingWithTrimming", "cuttingSizeLengthPiece"), leastCost?.cuttingWithTrimming);
    const ups = firstPositiveNumber(getFgInternalUps(item), getItemNumber(item, "ups", "noOfUps", "noOfUpsForRapc"));
    const takeUpFactor = calculateProductionTakeUpFactor(getItemText(item, "flute", "fluteType"));
    const layers = [
      { gsm: firstPositiveNumber(leastCost?.l1, getItemNumber(item, "l1", "top")), isFlute: false },
      { gsm: firstPositiveNumber(leastCost?.f1, getItemNumber(item, "f1")), isFlute: true },
      { gsm: firstPositiveNumber(leastCost?.l2, getItemNumber(item, "l2")), isFlute: false },
      { gsm: firstPositiveNumber(leastCost?.f2, getItemNumber(item, "f2")), isFlute: true },
      { gsm: firstPositiveNumber(leastCost?.l3, getItemNumber(item, "l3")), isFlute: false }
    ];
    layers.forEach((layer) => {
      const weightPerItem = calculateLayerWeightKg({ cuttingSize, rapc, gsm: layer.gsm, ups, takeUpFactor: layer.isFlute ? takeUpFactor : 1 });
      addToMap(requirementByKey, { rapcRange, gsm: layer.gsm }, weightPerItem * pendingQty);
    });
  });
  const stockByKey = /* @__PURE__ */ new Map();
  buildReelStockRows({
    materials,
    materialIn,
    packingSlips,
    issueReelLines,
    returnReelLines,
    includeMaterialIn: (entry) => {
      const entryDate = parseAppDate(entry.date || entry.timestamp);
      return Boolean(entryDate && normalizeDate(entryDate).getTime() <= filteredTimestamp);
    },
    includeIssueLine: (line) => {
      const issueDate = parseAppDate(issueMap.get(line.materialIssueId)?.date);
      return Boolean(issueDate && normalizeDate(issueDate).getTime() <= filteredTimestamp);
    },
    includeReturnLine: (line) => {
      const returnDate = parseAppDate(returnMap.get(line.materialReturnId)?.date);
      return Boolean(returnDate && normalizeDate(returnDate).getTime() <= filteredTimestamp);
    }
  }).filter((row) => row.availableWeight > 0).forEach((row) => {
    const material = materialMap.get(row.materialId);
    addToMap(stockByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material?.gsm || 0) }, row.availableWeight);
  });
  const receivedByPoLine = /* @__PURE__ */ new Map();
  materialIn.filter((entry) => {
    const entryDate = parseAppDate(entry.date || entry.timestamp);
    return Boolean(entryDate && normalizeDate(entryDate).getTime() <= filteredTimestamp);
  }).forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      if (!line.poLineId) return;
      receivedByPoLine.set(line.poLineId, (receivedByPoLine.get(line.poLineId) || 0) + Number(line.actualQty ?? line.qty ?? 0));
    });
  });
  const poMap = new Map(purchaseOrders.map((order) => [order.id, order]));
  const pendingPoByKey = /* @__PURE__ */ new Map();
  purchaseOrderLines.forEach((line) => {
    const po = poMap.get(line.purchaseOrderId);
    const poDate = parseAppDate(po?.poDate);
    if (!po || po.status !== "Approved" || !poDate || normalizeDate(poDate).getTime() > filteredTimestamp) return;
    const material = materialMap.get(line.materialId);
    if (!material || material.type !== "Reel") return;
    const pendingQty = Math.max(0, Number(line.qty || 0) - Number(receivedByPoLine.get(line.id) || 0) - Number(line.cancelledQty || 0));
    if (pendingQty <= 0) return;
    addToMap(pendingPoByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, pendingQty);
  });
  const consumptionByKey = /* @__PURE__ */ new Map();
  issueReelLines.forEach((line) => {
    const issueDate = parseAppDate(issueMap.get(line.materialIssueId)?.date);
    if (!issueDate || normalizeDate(issueDate).getTime() > filteredTimestamp) return;
    const material = materialMap.get(line.materialId);
    if (!material || material.type !== "Reel") return;
    addToMap(consumptionByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, Number(line.weightKg || 0));
  });
  returnReelLines.forEach((line) => {
    const returnDate = parseAppDate(returnMap.get(line.materialReturnId)?.date);
    if (!returnDate || normalizeDate(returnDate).getTime() > filteredTimestamp) return;
    const material = materialMap.get(line.materialId);
    if (!material || material.type !== "Reel") return;
    addToMap(consumptionByKey, { rapcRange: resolveRapcValue(getMaterialRapcInput(material), effectiveRanges), gsm: Number(material.gsm || 0) }, -Number(line.weightKg || 0));
  });
  const allKeys = /* @__PURE__ */ new Set([
    ...Array.from(requirementByKey.keys()),
    ...Array.from(stockByKey.keys()),
    ...Array.from(pendingPoByKey.keys()),
    ...Array.from(consumptionByKey.keys())
  ]);
  return Array.from(allKeys).map((key5) => {
    const { rapcRange, gsm } = parseKey(key5);
    const totalPaperRequirement = round24(requirementByKey.get(key5) || 0);
    const totalClosingStock = round24(stockByKey.get(key5) || 0);
    const totalPendingPo = round24(pendingPoByKey.get(key5) || 0);
    const consumption = round24(Math.max(0, consumptionByKey.get(key5) || 0));
    const mil = round24(consumption * 7 / 90);
    const calculatedNetPaperToOrder = totalClosingStock > mil ? round24(totalPaperRequirement - totalClosingStock - totalPendingPo) : round24(mil - totalClosingStock + (totalPaperRequirement - totalClosingStock - totalPendingPo));
    const netPaperToOrder = Math.max(0, calculatedNetPaperToOrder);
    return { rapcRange, gsm, totalPaperRequirement, totalClosingStock, totalPendingPo, mil, netPaperToOrder, consumption };
  }).filter((row) => row.gsm > 0).sort((a, b) => {
    if (a.rapcRange === "Unmapped" && b.rapcRange !== "Unmapped") return 1;
    if (a.rapcRange !== "Unmapped" && b.rapcRange === "Unmapped") return -1;
    return Number(a.rapcRange) - Number(b.rapcRange) || a.gsm - b.gsm;
  });
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

// src/lib/reports/jobsInProgress.ts
function text(value) {
  return String(value ?? "").trim();
}
function key(value) {
  return text(value).toLowerCase();
}
function quantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function roundQuantity(value) {
  return Number(quantity(value).toFixed(2));
}
function addQuantity(map, id, amount) {
  if (id && Number.isFinite(amount)) map.set(id, roundQuantity((map.get(id) || 0) + amount));
}
function getLineItemIdentity(line) {
  return `${key(line.itemSource)}::${key(line.itemId)}::${key(line.npdId)}`;
}
function computeJobsInProgressRows(lists, items) {
  const { productions, processing, plans, loadingSlips, invoiceLineItems } = lists;
  const productionById = new Map(productions.map((production) => [production.id, production]));
  const productionByJob = /* @__PURE__ */ new Map();
  productions.forEach((production) => {
    const jobNo = key(production.transactionNo || production.jobCardNo);
    if (jobNo) productionByJob.set(jobNo, production);
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const loadingByProduction = /* @__PURE__ */ new Map();
  const loadingEvidence = /* @__PURE__ */ new Set();
  const companyByProduction = /* @__PURE__ */ new Map();
  const itemNameByProduction = /* @__PURE__ */ new Map();
  const loadingAllocationsBySlip = /* @__PURE__ */ new Map();
  const resolveProductionId = (jobId, jobNo) => {
    const directId = text(jobId);
    if (directId && productionById.has(directId)) return directId;
    return productionByJob.get(key(jobNo))?.id || "";
  };
  const recordLoadingMetadata = (productionId, line) => {
    if (text(line.companyName)) companyByProduction.set(productionId, text(line.companyName));
    if (text(line.itemName)) itemNameByProduction.set(productionId, text(line.itemName));
  };
  loadingSlips.forEach((slip) => {
    if (slip.status === "Cancelled") return;
    const slipAllocations = [];
    slip.lines.forEach((line) => {
      const plan = planById.get(line.dispatchPlanId);
      const allocations = (line.allocations || []).filter((allocation) => allocation.sourceType === "job");
      const resolvedAllocations = allocations.map((allocation) => ({ productionId: resolveProductionId(allocation.jobId, allocation.jobNo), qty: quantity(allocation.qty) })).filter((allocation) => allocation.productionId && allocation.qty > 0);
      if (resolvedAllocations.length) {
        resolvedAllocations.forEach((allocation) => {
          const identity = getLineItemIdentity(line);
          recordLoadingMetadata(allocation.productionId, line);
          addQuantity(loadingByProduction, allocation.productionId, allocation.qty);
          loadingEvidence.add(allocation.productionId);
          slipAllocations.push({ ...allocation, identity });
        });
        return;
      }
      const planProductionId = text(plan?.productionId);
      const jobNumbers = (line.jobNos || []).map(key).filter(Boolean);
      const fallbackProductionId = planProductionId && productionById.has(planProductionId) ? planProductionId : jobNumbers.length === 1 ? productionByJob.get(jobNumbers[0])?.id || "" : "";
      if (!fallbackProductionId || quantity(line.loadedQty) <= 0) return;
      const fallback = { productionId: fallbackProductionId, qty: quantity(line.loadedQty), identity: getLineItemIdentity(line) };
      recordLoadingMetadata(fallback.productionId, line);
      addQuantity(loadingByProduction, fallback.productionId, fallback.qty);
      loadingEvidence.add(fallback.productionId);
      slipAllocations.push(fallback);
    });
    if (slipAllocations.length) loadingAllocationsBySlip.set(slip.id, slipAllocations);
  });
  plans.forEach((plan) => {
    const productionId = text(plan.productionId);
    if (productionId && !loadingEvidence.has(productionId)) addQuantity(loadingByProduction, productionId, quantity(plan.loadedQty));
  });
  const invoicedByProduction = /* @__PURE__ */ new Map();
  invoiceLineItems.forEach((invoiceLine) => {
    const invoiceQty = quantity(invoiceLine.qty);
    if (invoiceQty <= 0) return;
    const allocations = loadingAllocationsBySlip.get(invoiceLine.loadingSlipId) || [];
    const invoiceIdentity = getLineItemIdentity(invoiceLine);
    const matchingAllocations = allocations.filter((allocation) => allocation.identity === invoiceIdentity || allocation.identity.split("::")[1] === key(invoiceLine.itemId) || allocation.identity.split("::")[2] === key(invoiceLine.npdId));
    const candidates = matchingAllocations.length ? matchingAllocations : allocations;
    const totalAllocated = candidates.reduce((sum, allocation) => sum + allocation.qty, 0);
    if (totalAllocated > 0) candidates.forEach((allocation) => addQuantity(invoicedByProduction, allocation.productionId, invoiceQty * allocation.qty / totalAllocated));
  });
  const corrugationByProduction = /* @__PURE__ */ new Map();
  processing.forEach((entry) => {
    if (normalizeMachineName(entry.machineName).startsWith("Corrugation")) addQuantity(corrugationByProduction, entry.productionId, quantity(entry.qty));
  });
  return productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp).map((production) => {
    const erp = text(production.erpCode || production.masterErp);
    const item = items.find((candidate) => key(candidate.id) === key(production.itemId) || key(candidate.id) === key(production.npdId) || key(candidate.erp) === key(erp));
    const planQty = quantity(production.plannedQty || production.qty);
    const loading = roundQuantity(loadingByProduction.get(production.id) || 0);
    return { productionId: production.id, jobNo: text(production.transactionNo || production.jobCardNo), jobDate: text(production.date), erp, company: text(production.companyName || item?.companyName || companyByProduction.get(production.id)), itemName: text(production.itemName || item?.name || item?.itemName || itemNameByProduction.get(production.id) || production.itemId), planQty, corrugation: roundQuantity(corrugationByProduction.get(production.id) || 0), fg: roundQuantity(production.prodFromFFG), invoiced: roundQuantity(invoicedByProduction.get(production.id) || 0), loading, balance: roundQuantity(Math.max(0, planQty - loading)) };
  });
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
var JOIN_DEPENDENCIES = {
  // Plain NPD columns (item names etc.), no stock.
  npd_catalog: ["npd"],
  production_processing: ["production_processing", "productions", "npd"],
  invoice_line_items: ["invoice_line_items", "invoices", "items", "npd", "php_item_master", "plate_item_master", "materials"],
  materials: ["materials", "material_firm_openings"]
};
function realtimeChangeAffects(changed, entities, derived = false) {
  if (!changed.length || changed.includes("*")) return true;
  if (derived) return true;
  const names = entities.map(normalizeEntityName);
  const changedNames = new Set(changed.map(normalizeEntityName));
  return names.some((name) => {
    const dependsOn = JOIN_DEPENDENCIES[name];
    if (dependsOn) return dependsOn.some((table) => changedNames.has(table));
    if (DERIVED_ENTITIES.has(name)) return true;
    return changedNames.has(name);
  });
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
  for (const [key5, entry] of completedLoads) {
    if (realtimeChangeAffects(changed, Array.from(entry.tables), entry.derived)) completedLoads.delete(key5);
  }
  for (const [key5, entry] of completedNpdLoads) {
    if (!entry.catalog || realtimeChangeAffects(changed, ["npd_catalog"])) completedNpdLoads.delete(key5);
  }
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
        if (/\/api\//.test(url) && !/\/api\/(?:get-pending-job-closure|realtime\/|reports\/|operations-dashboard\/summary)/.test(url)) clearCollectionCache();
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
    const index = queue.findIndex((entry2) => entry2.priority === "page" || entry2.urgent);
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

// src/lib/reports/jobwiseReelConsumption.ts
function getReelRateForSlip({
  slip,
  materialInMap,
  materialMap
}) {
  if (!slip) return 0;
  const receipt = materialInMap.get(slip.materialInId);
  const line = receipt?.lines.find((entry) => entry.id === slip.materialLineId);
  const material = materialMap.get(slip.materialId);
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}
function computeJobwiseReelConsumptionRows(lists) {
  const { productions, processing, materials, materialIn, packingSlips, issueReelLines, returnReelLines } = lists;
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
  const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));
  const corrugationDateMap = /* @__PURE__ */ new Map();
  processing.forEach((entry) => {
    if (!normalizeMachineName(entry.machineName).startsWith("Corrugation")) return;
    const existing = corrugationDateMap.get(entry.productionId);
    if (!existing || new Date(entry.date).getTime() > new Date(existing).getTime()) {
      corrugationDateMap.set(entry.productionId, entry.date);
    }
  });
  const sumByProduction = (lines) => {
    const totals = /* @__PURE__ */ new Map();
    lines.forEach((line) => {
      const current = totals.get(line.productionId) || { weight: 0, value: 0 };
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      current.weight += Number(line.weightKg || 0);
      current.value += Number(line.weightKg || 0) * rate;
      totals.set(line.productionId, current);
    });
    return totals;
  };
  const issuedByProduction = sumByProduction(issueReelLines);
  const returnedByProduction = sumByProduction(returnReelLines);
  return productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp && Number(production.prodFromFFG || 0) > 0).map((production) => {
    const issued = issuedByProduction.get(production.id) || { weight: 0, value: 0 };
    const returned = returnedByProduction.get(production.id) || { weight: 0, value: 0 };
    const jobFfg = Number(production.prodFromFFG || 0);
    const jobRate = Number(production.rate || 0);
    const jobValue = jobFfg * jobRate;
    const reelIssued = Number(Number(issued.weight || 0).toFixed(2));
    const reelReturned = Number(Number(returned.weight || 0).toFixed(2));
    const reelConsumed = Number((reelIssued - reelReturned).toFixed(2));
    const consumedValue = Number(Number(issued.value - returned.value || 0).toFixed(2));
    const gp = Number(Number(jobValue - consumedValue || 0).toFixed(2));
    const gpPercent = jobValue > 0 ? Number((gp / jobValue * 100).toFixed(2)) : 0;
    return {
      productionId: production.id,
      jobNo: String(production.transactionNo || production.jobCardNo || ""),
      corrugationDate: corrugationDateMap.get(production.id) || "",
      jobFfg,
      jobRate,
      jobValue: Number(jobValue.toFixed(2)),
      reelIssued,
      reelReturned,
      reelConsumed,
      consumedValue,
      gp,
      gpPercent
    };
  });
}

// src/lib/financialYear.ts
var FY_MONTHS = [
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" }
];
function getCurrentFinancialYear() {
  const now = /* @__PURE__ */ new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}
function getFinancialYearFromDate(dateValue) {
  const parsed = dateValue ? new Date(dateValue) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const month = parsed.getMonth() + 1;
  const year = parsed.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}
function getFinancialYearOptions(extraYears = []) {
  const current = getCurrentFinancialYear();
  const currentStart = Number(`20${current.slice(0, 2)}`);
  const options = new Set(extraYears.filter(Boolean));
  for (let offset = -2; offset <= 2; offset += 1) {
    const start = currentStart + offset;
    options.add(`${String(start).slice(-2)}-${String(start + 1).slice(-2)}`);
  }
  return [...options].sort((a, b) => b.localeCompare(a));
}

// src/lib/reports/conversionCostMonthWise.ts
function normalizeExpenseLines(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function round25(value) {
  return Number(Number(value || 0).toFixed(2));
}
function isConsumableIssue(issue) {
  const type = String(issue?.issueType || "").toLowerCase();
  return type === "without job" || type === "general";
}
function getLineAmount(line, materials, materialIn) {
  const savedAmount = Number(line.amount || 0);
  if (savedAmount > 0) return savedAmount;
  const qty = Number(line.qty || 0);
  const savedRate = Number(line.rate || 0);
  if (savedRate > 0) return qty * savedRate;
  return resolveMaterialIssueRate(line.materialId, materials, materialIn, qty).amount;
}
function computeConversionCostMonthWise(lists, fy) {
  const { materialIssues, issueLines, materials, materialIn, fixedExpenses, productions, packingSlips, issueReelLines, returnReelLines } = lists;
  const normalizedFixedExpenses = fixedExpenses.map((record) => ({ ...record, lines: normalizeExpenseLines(record.lines) }));
  const issueYears = materialIssues.map((issue) => getFinancialYearFromDate(issue.date)).filter(Boolean);
  const fixedYears = normalizedFixedExpenses.map((record) => record.fy);
  const fyOptions = getFinancialYearOptions([...issueYears, ...fixedYears]);
  const issueMap = new Map(materialIssues.map((issue) => [issue.id, issue]));
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
  const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));
  const productionMap = new Map(productions.map((production) => [production.id, production]));
  const consumablesByMonth = /* @__PURE__ */ new Map();
  issueLines.forEach((line) => {
    const issue = issueMap.get(line.materialIssueId);
    if (!isConsumableIssue(issue)) return;
    if (getFinancialYearFromDate(issue?.date) !== fy) return;
    const issueMonth = issue?.date ? new Date(issue.date).getMonth() + 1 : 0;
    consumablesByMonth.set(issueMonth, (consumablesByMonth.get(issueMonth) || 0) + getLineAmount(line, materials, materialIn));
  });
  const paperByMonth = (lines) => {
    const totals = /* @__PURE__ */ new Map();
    lines.forEach((line) => {
      const production = productionMap.get(line.productionId);
      if (!production || production.status === "Cancelled" || production.cancelTimestamp) return;
      if (getFinancialYearFromDate(production.date) !== fy) return;
      const productionMonth = production.date ? new Date(production.date).getMonth() + 1 : 0;
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      totals.set(productionMonth, (totals.get(productionMonth) || 0) + Number(line.weightKg || 0) * rate);
    });
    return totals;
  };
  const issuedPaperByMonth = paperByMonth(issueReelLines);
  const returnedPaperByMonth = paperByMonth(returnReelLines);
  const rows2 = FY_MONTHS.map((month) => {
    const consumables = consumablesByMonth.get(month.value) || 0;
    const fixed = normalizedFixedExpenses.filter((record) => record.fy === fy && Number(record.month) === month.value).reduce((sum, record) => sum + Number(record.totalAmount || 0), 0);
    const actualPaperUsedCost = (issuedPaperByMonth.get(month.value) || 0) - (returnedPaperByMonth.get(month.value) || 0);
    return {
      month: month.label,
      monthValue: month.value,
      consumables: round25(consumables),
      fixed: round25(fixed),
      totalConsumption: round25(consumables),
      actualPaperUsedCost: round25(actualPaperUsedCost),
      ratio: actualPaperUsedCost > 0 ? round25(consumables / actualPaperUsedCost) : 0
    };
  });
  return { rows: rows2, fyOptions };
}

// src/lib/wastageCalculations.ts
var nonNegative = (value) => {
  const numberValue3 = Number(value || 0);
  return Number.isFinite(numberValue3) && numberValue3 >= 0 ? numberValue3 : 0;
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

// src/lib/jobLoadingRecords.ts
var key2 = (value) => String(value ?? "").trim().toLowerCase();
var positiveQty = (value) => {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
};
function buildJobLoadingRecords(productions, slips, plans) {
  const byId = new Map(productions.map((production) => [key2(production.id), production.id]));
  const byJobNo = new Map(productions.map((production) => [key2(production.transactionNo || production.jobCardNo), production.id]));
  const planById = new Map(plans.map((plan) => [key2(plan.id), plan]));
  const records = /* @__PURE__ */ new Map();
  for (const slip of slips) {
    if (key2(slip.status) === "cancelled") continue;
    for (const line of slip.lines || []) {
      const jobs = (line.allocations || []).filter((allocation) => allocation.sourceType === "job");
      const quantities = /* @__PURE__ */ new Map();
      if (jobs.length) {
        for (const allocation of jobs) {
          if (allocation.sourceType !== "job") continue;
          const productionId = byId.get(key2(allocation.jobId)) || byJobNo.get(key2(allocation.jobNo));
          const qty = positiveQty(allocation.qty);
          if (productionId && qty) quantities.set(productionId, (quantities.get(productionId) || 0) + qty);
        }
      } else {
        const plan = planById.get(key2(line.dispatchPlanId));
        const planProductionId = byId.get(key2(plan?.productionId));
        const jobNos = [...new Set((line.jobNos || []).map(key2).filter(Boolean))];
        const productionId = planProductionId || (jobNos.length === 1 ? byJobNo.get(jobNos[0]) : void 0);
        const qty = positiveQty(line.loadedQty);
        if (productionId && qty) quantities.set(productionId, qty);
      }
      for (const [productionId, qty] of quantities) {
        let bySlip = records.get(productionId);
        if (!bySlip) {
          bySlip = /* @__PURE__ */ new Map();
          records.set(productionId, bySlip);
        }
        let record = bySlip.get(slip.id);
        if (!record) {
          record = { slip, qty: 0, itemIds: /* @__PURE__ */ new Set() };
          bySlip.set(slip.id, record);
        }
        record.qty += qty;
        if (line.itemId) record.itemIds.add(key2(line.itemId));
      }
    }
  }
  return new Map(Array.from(records, ([productionId, bySlip]) => [
    productionId,
    Array.from(bySlip.values()).map(({ slip, qty, itemIds }) => ({ slip, qty: Number(qty.toFixed(2)), itemIds: [...itemIds] })).sort((a, b) => String(a.slip.date || "").localeCompare(String(b.slip.date || "")) || String(a.slip.slipNo || "").localeCompare(String(b.slip.slipNo || ""), void 0, { numeric: true }))
  ]));
}

// src/lib/reports/summarySheet.ts
var n = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
var s = (value) => String(value ?? "").trim();
var isoDateText = (value) => s(value).slice(0, 10);
var money = (value) => Number(value.toFixed(2));
function firstById(rows2) {
  const map = /* @__PURE__ */ new Map();
  rows2.forEach((row) => {
    if (!map.has(row.id)) map.set(row.id, row);
  });
  return map;
}
function computeSummarySheetRows(lists, stockItems) {
  const { productions, processing, orders, schedules, plans, slips, invoices, invoiceLines, trucks, companies, firms } = lists;
  const orderMap = new Map(orders.map((row) => [row.id, row]));
  const firstScheduleById = firstById(schedules);
  const companyById = firstById(companies);
  const firmById = firstById(firms);
  const scheduleMap = new Map(schedules.map((row) => [row.id, row]));
  const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
  const truckMap = new Map(trucks.map((row) => [row.id, row]));
  const stockItemById = new Map(stockItems.map((item) => [s(item.id), item]));
  const stockByErp = new Map(stockItems.map((item) => [s(item.erp || item.erpCode || item.masterItemNameErpCode), { name: s(item.name || item.itemName), balance: n(item.balance) }]));
  const invoiceLinesBySlip = /* @__PURE__ */ new Map();
  invoiceLines.forEach((line) => {
    const list = invoiceLinesBySlip.get(line.loadingSlipId) || [];
    list.push(line);
    invoiceLinesBySlip.set(line.loadingSlipId, list);
  });
  const processingByJob = /* @__PURE__ */ new Map();
  processing.forEach((entry) => {
    const list = processingByJob.get(entry.productionId) || [];
    list.push(entry);
    processingByJob.set(entry.productionId, list);
  });
  const dispatchByProduction = /* @__PURE__ */ new Map();
  const addDispatch = (productionId, qty, date = "", slip) => {
    if (!productionId || !Number.isFinite(qty) || qty <= 0) return;
    const current = dispatchByProduction.get(productionId) || { qty: 0, date: "", slips: [], invoiceIds: /* @__PURE__ */ new Set() };
    current.qty += qty;
    current.date = current.date || date;
    if (slip && !current.slips.some((item) => item.id === slip.id)) current.slips.push(slip);
    if (slip?.invoiceId) current.invoiceIds.add(slip.invoiceId);
    dispatchByProduction.set(productionId, current);
  };
  const loadingByJob = buildJobLoadingRecords(productions, slips, plans);
  loadingByJob.forEach((records, productionId) => records.forEach(({ slip, qty, itemIds }) => {
    addDispatch(productionId, qty, isoDateText(slip.date), slip);
    const dispatch = dispatchByProduction.get(productionId);
    invoiceLinesBySlip.get(slip.id)?.forEach((line) => {
      if (line.invoiceId && (!line.itemId || !itemIds.length || itemIds.includes(s(line.itemId).toLowerCase()))) {
        dispatch?.invoiceIds.add(line.invoiceId);
      }
    });
  }));
  return productions.filter((production) => production.status !== "Cancelled").map((production) => {
    const order = orderMap.get(firstScheduleById.get(production.scheduleId)?.orderId || "");
    const schedule = scheduleMap.get(production.scheduleId || "");
    const company = companyById.get(order?.companyId || production.companyId);
    const firmName = s(production.firmName || order?.firmName || firmById.get(production.firmId)?.firmName);
    const jobNo = s(production.transactionNo || production.jobCardNo);
    const erp = s(production.erpCode || production.masterErp || production.erp);
    const stockItem = stockByErp.get(erp);
    const itemName = s(stockItem?.name || production.itemName || production.name);
    const productionRows = processingByJob.get(production.id) || [];
    const boardline = productionRows.filter((entry) => /corrugation|pasting|stitching|slotting|punching|gluing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
    const printing = productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
    const dispatch = dispatchByProduction.get(production.id) || { qty: 0, date: "", slips: [], invoiceIds: /* @__PURE__ */ new Set() };
    const relatedInvoices = Array.from(dispatch.invoiceIds).map((id) => invoiceMap.get(id)).filter(Boolean);
    relatedInvoices.sort((a, b) => isoDateText(a.tallyInvDate || a.date).localeCompare(isoDateText(b.tallyInvDate || b.date)));
    const invoiceValues = relatedInvoices.map((invoice) => money(n(invoice.totalAfterGst || invoice.totalBeforeGst)));
    const invoiceDates = relatedInvoices.map((invoice) => isoDateText(invoice.tallyInvDate || invoice.date));
    const loadingRecords = (loadingByJob.get(production.id) || []).map(({ slip, qty }) => ({
      slipNo: s(slip.slipNo),
      date: isoDateText(slip.date),
      qty: money(qty),
      vehicle: s(slip.truckNo || truckMap.get(slip.truckId)?.truckNo)
    }));
    const dispatchedQty = loadingRecords.slice(0, 3).reduce((sum, record) => sum + n(record.qty), 0);
    const vehicle = Array.from(new Set(loadingRecords.map((record) => record.vehicle).filter(Boolean))).join(", ");
    const planned = n(production.plannedQty || production.qty || schedule?.qty);
    const pprUsed = n(production.actualPaperUsed);
    const ups = n(production.ups);
    const catalogItem = stockItemById.get(s(production.itemId));
    const cuttingMm = n(production.cuttingWithTrimming) || n(catalogItem?.cuttingSize) || n(catalogItem?.cuttingSizeLengthPiece);
    const linearMeter = ups > 0 && cuttingMm > 0 ? money(boardline / ups * (cuttingMm / 1e3)) : 0;
    const jobWeight = n(production.totalWeightOfSet) * planned;
    const rate = n(production.rate || order?.rate);
    const fgStock = stockItem?.balance || 0;
    const wastage = getProductionWastageTotals(production, productionRows);
    const realizationRaw = String(production.realizationPerKg ?? "").trim();
    const realizationValue = realizationRaw === "" || !Number.isFinite(Number(realizationRaw)) ? "" : Number(realizationRaw);
    const row = {
      "Job No.": jobNo,
      Date: isoDateText(production.date),
      "Party Name": s(production.companyName || company?.name),
      "Item Name": itemName,
      ERP: erp,
      "Planned Qty": planned,
      "FG Stock": fgStock,
      "Job Weight": money(jobWeight),
      "Customer Complaint": "",
      "PDI REPORT": "",
      "Realization / kg": realizationValue,
      Meter: linearMeter,
      "Cutting Size": [production.length, production.breadth].filter((value) => n(value) > 0).join(" x "),
      UPS: n(production.ups),
      "Sheets prdcd": n(production.productionOutputQty),
      "Plate per box": n(production.setsPerBox),
      "Boardline Prod.": boardline,
      "Printing prod.": printing,
      "PPR Rqd.": n(production.totalPaperWeight),
      "PPR Used": pprUsed,
      "Paper Wastage": pprUsed && production.totalPaperWeight ? money(pprUsed - n(production.totalPaperWeight)) : "",
      "Boardline Wastage": money(wastage.corrugationKg),
      "Actual Realization / kg": n(production.realizationPerKg),
      "Dispatched Qty": money(dispatchedQty),
      "Dispatch Date": invoiceDates[0] || "",
      "Vehicle No": vehicle,
      "App Stock": fgStock,
      "Invoice Value 1": invoiceValues[0] ?? "",
      "Invoice Value 2": invoiceValues[1] ?? "",
      "Invoice Value 3": invoiceValues[2] ?? "",
      "Invoice No. 1": s(relatedInvoices[0]?.invoiceNo || relatedInvoices[0]?.tallyInvNo),
      "Invoice Date 1": invoiceDates[0] || "",
      "Invoice No. 2": s(relatedInvoices[1]?.invoiceNo || relatedInvoices[1]?.tallyInvNo),
      "Invoice Date 2": invoiceDates[1] || "",
      "Invoice No. 3": s(relatedInvoices[2]?.invoiceNo || relatedInvoices[2]?.tallyInvNo),
      "Invoice Date 3": invoiceDates[2] || "",
      "Loading No 1": loadingRecords[0]?.slipNo || "",
      "Loading Date 1": loadingRecords[0]?.date || "",
      "Loading Qty 1": loadingRecords[0]?.qty ?? "",
      "Vehicle 1": loadingRecords[0]?.vehicle || "",
      "Loading No 2": loadingRecords[1]?.slipNo || "",
      "Loading Date 2": loadingRecords[1]?.date || "",
      "Loading Qty 2": loadingRecords[1]?.qty ?? "",
      "Vehicle 2": loadingRecords[1]?.vehicle || "",
      "Loading No 3": loadingRecords[2]?.slipNo || "",
      "Loading Date 3": loadingRecords[2]?.date || "",
      "Loading Qty 3": loadingRecords[2]?.qty ?? "",
      "Vehicle 3": loadingRecords[2]?.vehicle || "",
      "FG LEFT": money(Math.max(0, planned - dispatchedQty)),
      Rate: rate,
      Status: s(production.status),
      "Printing Wastage": productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.misprinting), 0),
      "Sale Value": money(dispatchedQty * rate),
      "FINAL FG LEFT": money(Math.max(0, planned - dispatchedQty)),
      "wip value": money(Math.max(0, planned - dispatchedQty) * rate),
      Remarks: s(production.remarks),
      "Dispatched From FG": dispatchedQty ? "Yes" : "",
      Value: money(dispatchedQty * rate),
      Timestamp: isoDateText(production.updateTimestamp),
      "App sale value": money(dispatchedQty * rate)
    };
    row["Job Closed"] = s(production.closeBy).toLowerCase() === "yes" ? "Yes" : "";
    row["Close Date"] = isoDateText(production.closeDate);
    row.__productionId = production.id;
    row.__firmName = s(production.firmName || firmById.get(production.firmId)?.firmName);
    return row;
  });
}

// src/lib/reports/summarySheetTiles.ts
function computePhpPlateCounts(lists) {
  const jobs = [...lists.phpJobs || [], ...lists.plateJobs || []].filter((job) => job.status !== "Cancelled");
  const filled = (value) => s(value) !== "";
  const scheduling = jobs.filter((job) => !filled(job.scheduledDate) || !filled(job.shift) || !filled(job.methodology) || !(n(job.plannedQty) > 0)).length;
  const open = jobs.filter((job) => job.status !== "Completed");
  const sequence = open.filter((job) => filled(job.scheduledDate) && filled(job.shift) && filled(job.methodology) && !filled(job.sequence)).length;
  const production = open.filter((job) => filled(job.scheduledDate) && filled(job.shift) && filled(job.sequence) && (!filled(job.jobCompletionTimeOutput) || !(n(job.productionOutputQty) > 0))).length;
  return { scheduling, sequence, production };
}
var STORE_STOCK_TILES = [
  { id: "starch", label: "Starch", keywords: ["starch", "corrugation gum", "pasting gum"], red: 4e3, green: 7e3, tone: "bg-[#ffd966] text-slate-950" },
  { id: "fevicol", label: "Fevicol", keywords: ["fevicol"], red: 200, green: 400, tone: "bg-[#ffd966] text-slate-950" },
  { id: "diesel", label: "Diesel", keywords: ["diesel"], red: 500, green: 1e3, tone: "bg-[#e69138] text-slate-950" },
  { id: "firewood", label: "Firewood", keywords: ["firewood", "fire wood"], red: 2e4, green: 4e4, tone: "bg-[#93c47d] text-slate-950" },
  { id: "strapping", label: "Strapping Roll", keywords: ["strapping"], red: 30, green: 60, tone: "bg-[#ffd966] text-slate-950" }
];
function computeStoreStocks(lists) {
  const materials = (lists.materials || []).filter((material) => String(material.type || "") !== "Reel");
  const firmOpenings = /* @__PURE__ */ new Map();
  (lists.materialFirmOpenings || []).forEach((row) => firmOpenings.set(String(row.materialId), (firmOpenings.get(String(row.materialId)) || 0) + n(row.openingQty)));
  const receipts = /* @__PURE__ */ new Map();
  (lists.materialIn || []).forEach((receipt) => {
    if (receipt.mrrType === "Reel" || isCancelled(receipt)) return;
    (receipt.lines || []).forEach((line) => {
      const id = String(line.itemId || line.npdId || "").trim();
      if (!id || line.lineType === "Service") return;
      receipts.set(id, (receipts.get(id) || 0) + n(line.actualQty ?? line.qty ?? line.invoiceQty));
    });
  });
  const issues = /* @__PURE__ */ new Map();
  (lists.issueLines || []).forEach((line) => issues.set(String(line.materialId), (issues.get(String(line.materialId)) || 0) + n(line.qty)));
  const result = {};
  STORE_STOCK_TILES.forEach((tile) => {
    const matched = materials.filter((material) => {
      const name = s(material.name).toLowerCase();
      return tile.keywords.some((keyword) => name.includes(keyword));
    });
    if (!matched.length) {
      result[tile.id] = null;
      return;
    }
    const qty = matched.reduce((sum, material) => {
      const id = String(material.id);
      const opening = firmOpenings.has(id) ? firmOpenings.get(id) || 0 : n(material.openingQty);
      return sum + opening + (receipts.get(id) || 0) - (issues.get(id) || 0);
    }, 0);
    result[tile.id] = { qty: Math.round(qty * 100) / 100, unit: s(matched[0].unit || matched[0].uom), materials: matched.map((material) => s(material.name)) };
  });
  return result;
}
var isCancelled = (row) => /cancel/i.test(String(row?.status || "")) || Boolean(row?.cancelledAt);
function computeSummarySheetExtras(lists, npdItems) {
  const firmName = new Map((lists.firms || []).map((firm) => [String(firm.id), s(firm.firmName)]));
  const companyName = new Map((lists.companies || []).map((company) => [String(company.id), s(company.name || company.companyName)]));
  const itemById = new Map(npdItems.map((item) => [String(item.id), { name: s(item.name || item.itemName), erp: s(item.erp || item.erpCode) }]));
  const orders = (lists.orders || []).filter((order) => !isCancelled(order));
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  const orderFirm = (order) => s(order.firmName) || firmName.get(String(order.firmId)) || "";
  const orderParty = (order) => s(order.companyName) || companyName.get(String(order.companyId)) || "";
  const orderItem = (order) => itemById.get(String(order.npdId || order.itemId)) || { name: s(order.itemName), erp: s(order.erpCode) };
  const round = (value) => Math.round(value * 100) / 100;
  const planScheduleById = new Map((lists.plans || []).map((plan) => [String(plan.id), String(plan.scheduleId || "")]));
  const slips = (lists.slips || []).filter((slip) => !isCancelled(slip));
  const loadedBySchedule = /* @__PURE__ */ new Map();
  slips.forEach((slip) => (slip.lines || []).forEach((line) => {
    const scheduleId = planScheduleById.get(String(line?.dispatchPlanId || "").trim());
    if (scheduleId) loadedBySchedule.set(scheduleId, (loadedBySchedule.get(scheduleId) || 0) + n(line?.loadedQty));
  }));
  const pendingOrders = [];
  const scheduledByOrder = /* @__PURE__ */ new Map();
  (lists.schedules || []).forEach((schedule) => {
    const order = orderById.get(String(schedule.orderId));
    if (!order) return;
    scheduledByOrder.set(String(order.id), (scheduledByOrder.get(String(order.id)) || 0) + n(schedule.qty));
    const pending = n(schedule.qty) - n(schedule.canceledQty) - (loadedBySchedule.get(String(schedule.id)) || 0);
    if (pending <= 0) return;
    const item = orderItem(order);
    pendingOrders.push([isoDateText(schedule.scheduledDate), orderFirm(order), orderParty(order), item.name, item.erp, round(pending * n(order.rate))]);
  });
  const pendingScheduling = orders.filter((order) => order.status === "Pending Scheduling").map((order) => {
    const item = orderItem(order);
    return [isoDateText(order.orderDate), orderFirm(order), orderParty(order), item.name, item.erp, round(Math.max(0, n(order.qty) - (scheduledByOrder.get(String(order.id)) || 0)) * n(order.rate))];
  }).filter((record) => record[5] > 0);
  const invoiceRows = (lists.invoices || []).filter((invoice) => !isCancelled(invoice));
  const invoiceIds = new Set(invoiceRows.map((invoice) => String(invoice.id)));
  const invoicedSlipIds = new Set((lists.invoiceLines || []).filter((line) => invoiceIds.has(String(line.invoiceId))).map((line) => String(line.loadingSlipId || "")));
  const loadingSlips = slips.map((slip) => {
    const invoiced = slip.invoiceId && invoiceIds.has(String(slip.invoiceId)) || invoicedSlipIds.has(String(slip.id));
    return [isoDateText(slip.date), firmName.get(String(slip.firmId)) || "", s(slip.companyName) || companyName.get(String(slip.companyId)) || "", "", "", invoiced ? 1 : 0];
  });
  const firmKey = (value) => s(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const ownFirmKeys = new Set((lists.firms || []).map((firm) => firmKey(firm.firmName)).filter(Boolean));
  const isInterFirm = (invoice) => s(invoice.interFirmFlow).toLowerCase() === "yes" || ownFirmKeys.has(firmKey(s(invoice.companyName) || companyName.get(String(invoice.companyId)) || ""));
  const toInvoiceRecord = (invoice) => [
    isoDateText(invoice.date),
    firmName.get(String(invoice.firmId)) || "",
    s(invoice.companyName) || companyName.get(String(invoice.companyId)) || "",
    "",
    "",
    round(n(invoice.totalAfterGst))
  ];
  const invoices = invoiceRows.filter((invoice) => !isInterFirm(invoice)).map(toInvoiceRecord);
  const interFirmInvoices = invoiceRows.filter(isInterFirm).map(toInvoiceRecord);
  const latestRate = /* @__PURE__ */ new Map();
  orders.forEach((order) => {
    const itemId = String(order.npdId || order.itemId || "");
    const rate = n(order.rate);
    if (!itemId || rate <= 0) return;
    const date = isoDateText(order.orderDate);
    const current = latestRate.get(itemId);
    if (!current || date >= current.date) latestRate.set(itemId, { date, rate });
  });
  const fgStock = npdItems.map((item) => [
    "",
    s(item.firmName),
    "",
    s(item.name || item.itemName),
    s(item.erp || item.erpCode),
    round(Math.max(0, n(item.balance)) * (latestRate.get(String(item.id))?.rate || 0))
  ]).filter((record) => record[5] > 0);
  const fgStockQty = npdItems.filter((item) => n(item.balance) > 0).map((item) => ["", s(item.firmName), "", s(item.name || item.itemName), s(item.erp || item.erpCode), round(n(item.balance))]);
  return { version: 2, fgStockQty, pendingOrders, pendingScheduling, loadingSlips, invoices, interFirmInvoices, fgStock, storeStocks: computeStoreStocks(lists), phpPlate: computePhpPlateCounts(lists) };
}

// src/lib/reports/conversionCostDetails.ts
var factoryBuckets = [
  { key: "starch", label: "Starch", keywords: ["starch", "corrugation gum", "pasting gum"], source: "material" },
  { key: "borex", label: "Borex", keywords: ["borex", "borax"], source: "material" },
  { key: "caustic", label: "Caustic", keywords: ["caustic"], source: "material" },
  { key: "ink", label: "INK", keywords: ["ink"], source: "material" },
  { key: "strapping", label: "Strapping Roll", keywords: ["strapping", "sutli", "plastic sutli"], source: "material" },
  { key: "fevicol", label: "Fevicol", keywords: ["fevicol"], source: "material" },
  { key: "stitchingWire", label: "Stitching Wire", keywords: ["stitching wire"], source: "material" },
  { key: "diesel", label: "Diesel", keywords: ["diesel"], source: "both" },
  { key: "firewood", label: "Firewood", keywords: ["firewood", "fire wood"], source: "both" },
  { key: "briquettes", label: "Briquettes", keywords: ["briquette"], source: "both" },
  { key: "woodChips", label: "Wood Chips", keywords: ["wood chip"], source: "both" },
  { key: "salary", label: "Total Salary", keywords: ["salary", "wages", "contractual work"], source: "fixed" },
  { key: "dailyCash", label: "Daily Cash Expenses", keywords: ["daily cash", "cash expense", "petty cash"], source: "fixed" }
];
function normalizeExpenseLines2(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function toDateOnly(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDatePrefix = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(trimmed);
  if (isoDatePrefix) return isoDatePrefix[1];
  const ddmmyyyy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseDate(value) {
  const dateValue = toDateOnly(value);
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeDateTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function isWithinRange(value, fromDate, toDate) {
  const parsed = parseDate(value);
  if (!parsed) return false;
  const time = normalizeDateTime(parsed);
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (from && time < normalizeDateTime(from)) return false;
  if (to && time > normalizeDateTime(to)) return false;
  return true;
}
function round26(value) {
  return Number(Number(value || 0).toFixed(2));
}
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeLoose(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}
function getBucketForText(text4, source) {
  const normalized2 = normalizeText(text4);
  return factoryBuckets.find((bucket) => {
    if (bucket.source !== "both" && bucket.source !== source) return false;
    return bucket.keywords.some((keyword) => normalized2.includes(keyword));
  });
}
function getLineAmount2(line, materials, materialIn) {
  const savedAmount = Number(line.amount || 0);
  if (savedAmount > 0) return savedAmount;
  const qty = Number(line.qty || 0);
  const savedRate = Number(line.rate || 0);
  if (savedRate > 0) return qty * savedRate;
  return resolveMaterialIssueRate(line.materialId, materials, materialIn, qty, { useLatestRateAsOpeningRate: true }).amount;
}
function getReelRateForSlip2({
  slip,
  materialInMap,
  materialMap
}) {
  if (!slip) return 0;
  const receipt = materialInMap.get(slip.materialInId);
  const line = receipt?.lines.find((entry) => entry.id === slip.materialLineId);
  const material = materialMap.get(slip.materialId);
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}
function getProductionFfg(production) {
  return Number(production.prodFromFFG || 0);
}
function getProductionFfgDate(production) {
  return production.ffgTimestamp || production.date;
}
function getExpenseMonthDate(record) {
  const [startYearText] = String(record.fy || getCurrentFinancialYear()).split("-");
  const startYear = 2e3 + Number(startYearText || 0);
  const month = Number(record.month || 0);
  const year = month >= 4 ? startYear : startYear + 1;
  return new Date(year, month - 1, 1);
}
function isExpenseInRange(record, fromDate, toDate) {
  const monthStart = getExpenseMonthDate(record);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (from && normalizeDateTime(monthEnd) < normalizeDateTime(from)) return false;
  if (to && normalizeDateTime(monthStart) > normalizeDateTime(to)) return false;
  return true;
}
function computeConversionCostBase(lists, fromDate, toDate) {
  const { materialIssues, issueLines, materials, materialIn, packingSlips, issueReelLines, returnReelLines, fixedExpenses, fixedDailyExpenses, productions, processing, invoices, invoiceLines } = lists;
  const processingByProduction = /* @__PURE__ */ new Map();
  processing.forEach((row) => {
    const list = processingByProduction.get(row.productionId);
    if (list) list.push(row);
    else processingByProduction.set(row.productionId, [row]);
  });
  const issueMap = new Map(materialIssues.map((issue) => [issue.id, issue]));
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
  const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));
  const bucketTotals = new Map(factoryBuckets.map((bucket) => [bucket.key, 0]));
  let matchingConsumableIssueLines = 0;
  issueLines.forEach((line) => {
    const issue = issueMap.get(line.materialIssueId);
    const issueType = normalizeLoose(issue?.issueType);
    if (issueType !== "withoutjob" && issueType !== "general") return;
    if (!isWithinRange(issue?.date, fromDate, toDate)) return;
    const material = materialMap.get(line.materialId);
    if (normalizeText(material?.type) !== "other") return;
    matchingConsumableIssueLines += 1;
    const amount = getLineAmount2(line, materials, materialIn);
    const bucket = getBucketForText(material?.name, "material");
    if (bucket) bucketTotals.set(bucket.key, (bucketTotals.get(bucket.key) || 0) + amount);
  });
  fixedExpenses.forEach((record) => {
    if (!isExpenseInRange(record, fromDate, toDate)) return;
    normalizeExpenseLines2(record.lines).forEach((line) => {
      const amount = Number(line.amount || 0);
      const bucket = getBucketForText(line.expenseName, "fixed");
      if (bucket && bucket.key !== "dailyCash") bucketTotals.set(bucket.key, (bucketTotals.get(bucket.key) || 0) + amount);
    });
  });
  fixedDailyExpenses.forEach((record) => {
    if (!isWithinRange(record.date, fromDate, toDate)) return;
    normalizeExpenseLines2(record.lines).forEach((line) => {
      bucketTotals.set("dailyCash", (bucketTotals.get("dailyCash") || 0) + Number(line.amount || 0));
    });
  });
  const factoryRows = factoryBuckets.map((bucket, index) => {
    const amount = round26(bucketTotals.get(bucket.key) || 0);
    return {
      slNo: index + 1,
      label: bucket.label,
      amount
    };
  });
  const productionRows = productions.filter(
    (production) => production.status !== "Cancelled" && !production.cancelTimestamp && isWithinRange(getProductionFfgDate(production), fromDate, toDate)
  );
  const productionIds = new Set(productionRows.map((production) => production.id));
  const totalProduction = round26(
    productionRows.reduce((sum, production) => sum + getProductionFfg(production), 0)
  );
  const totalActualPaperUsed = round26(productionRows.reduce((sum, production) => sum + Number(production.actualPaperUsed || 0), 0));
  const totalWastageKg = round26(
    productionRows.reduce((sum, production) => sum + getProductionWastageTotals(production, processingByProduction.get(production.id) || []).totalWastageKg, 0)
  );
  const issuedPaperCost = issueReelLines.reduce((sum, line) => {
    if (!productionIds.has(line.productionId)) return sum;
    const slip = packingSlipMap.get(line.packingSlipId);
    const rate = getReelRateForSlip2({ slip, materialInMap, materialMap });
    return sum + Number(line.weightKg || 0) * rate;
  }, 0);
  const returnedPaperCost = returnReelLines.reduce((sum, line) => {
    if (!productionIds.has(line.productionId)) return sum;
    const slip = packingSlipMap.get(line.packingSlipId);
    const rate = getReelRateForSlip2({ slip, materialInMap, materialMap });
    return sum + Number(line.weightKg || 0) * rate;
  }, 0);
  const actualPaperUsedCost = round26(issuedPaperCost - returnedPaperCost);
  const totalPayable = round26(factoryRows.reduce((sum, row) => sum + row.amount, 0));
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const totalSold = round26(
    invoiceLines.reduce((sum, line) => {
      const invoice = invoiceMap.get(line.invoiceId);
      if (!isWithinRange(invoice?.date, fromDate, toDate)) return sum;
      return sum + Number(line.qty || 0);
    }, 0)
  );
  const totalSaleBasic = round26(
    invoices.filter((invoice) => isWithinRange(invoice.date, fromDate, toDate)).reduce((sum, invoice) => sum + Number(invoice.totalBeforeGst || 0), 0)
  );
  return { factoryRows, matchingConsumableIssueLines, totalPayable, totalProduction, totalActualPaperUsed, totalSold, totalWastageKg, totalSaleBasic, actualPaperUsedCost };
}

// src/lib/gatePasses.ts
function getInvoiceGrandTotal(invoice) {
  const otherCharges = Number(invoice.otherCharges || 0);
  const otherChargesGstRate = Number(invoice.otherChargesGstRate || 0);
  const nonTaxableOtherCharges = otherCharges !== 0 && otherChargesGstRate > 0 ? 0 : otherCharges;
  return Number(invoice.totalAfterGst || 0) + nonTaxableOtherCharges + Number(invoice.roundOff || 0);
}

// src/lib/reports/auditDashboard.ts
function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}
function getMaterialInPurchaseAuditValue(entry) {
  const lineGst = roundMoney(
    (entry.lines || []).reduce(
      (sum, line) => sum + Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0),
      0
    )
  );
  const expenseGst = roundMoney(Number(entry.expenseCGST || 0) + Number(entry.expenseSGST || 0) + Number(entry.expenseIGST || 0));
  const totalGst = roundMoney(Number(entry.totalCgst || 0) + Number(entry.totalSgst || 0) + Number(entry.totalIgst || 0));
  const hasExpenseOnlyGst = expenseGst !== 0 && lineGst === 0 && expenseGst === totalGst;
  if (hasExpenseOnlyGst) {
    return roundMoney(
      Number(entry.totalInvoiceValueAfterGst || 0) + Number(entry.insurance || 0) + Number(entry.otherCharges || 0) - Number(entry.roundOff || 0)
    );
  }
  return roundMoney(Number(entry.totalAmount || 0));
}
function hasJobNo(issue) {
  return String(issue.jobNo || "").trim() !== "";
}
function isCancelledIssue(issue) {
  return String(issue.tallyPostingStatus || "").trim().toLowerCase() === "cancelled";
}
function isNotApplicableIssue(issue) {
  const normalized2 = String(issue.notApplicable || "").trim().toLowerCase();
  return normalized2 === "yes" || normalized2 === "true" || normalized2 === "1";
}
function isDebitNotePostedToTally(entry) {
  return String(entry.debitTallySync || "").trim() !== "";
}
function isMaterialInPostedToTally(entry) {
  return String(entry.tallyTimestamp || "").trim() !== "" || String(entry.status || "").trim().toLowerCase() === "completed";
}
function isInvoicePostedToTally(invoice) {
  return String(invoice.tallyTimestamp || "").trim() !== "";
}
function isProductionPostedToTally(production) {
  return String(production.tallyTimestamp || "").trim() !== "";
}
function computeAuditAppValues(lists, npdItems) {
  const { materialIn, materialIssues, materialIssueLines, materialReturns, materialReturnLines, invoices, productions } = lists;
  const consumptionIssueIdSet = new Set(
    materialIssues.filter((entry) => !hasJobNo(entry) && !isCancelledIssue(entry) && !isNotApplicableIssue(entry)).map((entry) => entry.id)
  );
  const manufacturingProductions = productions.filter(
    (production) => !production.cancelTimestamp && production.status !== "Cancelled" && isProductionPostedToTally(production) && Number(production.prodFromFFG || 0) > 0
  );
  const manufacturingProductionIdSet = new Set(manufacturingProductions.map((production) => production.id));
  const manufacturingProductionJobNoSet = new Set(
    manufacturingProductions.map((production) => String(production.transactionNo || "").trim()).filter(Boolean)
  );
  const isManufacturingProductionEntry = (entry) => {
    const productionId = String(entry.productionId || "").trim();
    if (productionId) return manufacturingProductionIdSet.has(productionId);
    const jobNo = String(entry.jobNo || "").trim();
    return jobNo ? manufacturingProductionJobNoSet.has(jobNo) : false;
  };
  const manufacturingIssueIdSet = new Set(materialIssues.filter(isManufacturingProductionEntry).map((entry) => entry.id));
  const manufacturingReturnIdSet = new Set(materialReturns.filter(isManufacturingProductionEntry).map((entry) => entry.id));
  const tallyPostedMaterialIn = materialIn.filter(
    (entry) => isMaterialInPostedToTally(entry) && String(entry.transactionNo || "").trim() !== "1"
  );
  const tallyPostedDebitNotes = materialIn.filter(isDebitNotePostedToTally);
  const tallyPostedInvoices = invoices.filter(isInvoicePostedToTally);
  const getIssueLineValue = (issueIds) => materialIssueLines.filter((line) => issueIds.has(line.materialIssueId)).reduce((sum, line) => {
    const savedAmount = Number(line.amount || 0);
    if (savedAmount > 0) return sum + savedAmount;
    const savedRate = Number(line.rate || 0);
    return sum + Number(line.qty || 0) * savedRate;
  }, 0);
  const getReturnLineValue = (returnIds) => materialReturnLines.filter((line) => returnIds.has(line.materialReturnId)).reduce((sum, line) => {
    const savedAmount = Number(line.amount || 0);
    if (savedAmount > 0) return sum + savedAmount;
    const savedRate = Number(line.rate || 0);
    return sum + Number(line.qty || 0) * savedRate;
  }, 0);
  const consumptionValue = getIssueLineValue(consumptionIssueIdSet);
  const manufacturingIssueValue = getIssueLineValue(manufacturingIssueIdSet);
  const manufacturingReturnValue = getReturnLineValue(manufacturingReturnIdSet);
  const manufacturingValue = manufacturingIssueValue - manufacturingReturnValue;
  const activeNpdItems = npdItems.filter((item) => Number(item.balance || 0) > 0);
  const npdStockValue = roundMoney(
    activeNpdItems.reduce((sum, item) => sum + Number(item.balance || 0) * Number(item.rate || 0), 0)
  );
  const npdStockCount = activeNpdItems.length;
  const npdItemsWithTallyStock = npdItems.filter((item) => item.tallyStock != null);
  const npdStockQtyTally = roundMoney(
    npdItemsWithTallyStock.reduce((sum, item) => sum + Number(item.tallyStock || 0), 0)
  );
  const npdStockQtyCountTally = npdItemsWithTallyStock.length;
  const npdStockQtyApp = roundMoney(
    npdItems.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  );
  const npdStockQtyCountApp = npdItems.filter((item) => Number(item.balance || 0) > 0).length;
  return {
    invoiceValue: roundMoney(
      tallyPostedMaterialIn.reduce((sum, entry) => {
        return sum + getMaterialInPurchaseAuditValue(entry);
      }, 0)
    ),
    invoiceCount: tallyPostedMaterialIn.length,
    consumptionValue: roundMoney(consumptionValue),
    consumptionCount: consumptionIssueIdSet.size,
    manufacturingValue: roundMoney(manufacturingValue),
    manufacturingCount: manufacturingProductionIdSet.size,
    saleValue: roundMoney(
      tallyPostedInvoices.reduce((sum, invoice) => sum + getInvoiceGrandTotal(invoice), 0)
    ),
    saleCount: tallyPostedInvoices.length,
    debitNote: roundMoney(tallyPostedDebitNotes.reduce((sum, entry) => sum + Number(entry.debitNoteAmount || 0), 0)),
    debitNoteCount: tallyPostedDebitNotes.filter((entry) => roundMoney(Number(entry.debitNoteAmount || 0)) !== 0).length,
    npdStockValue,
    npdStockCount,
    npdStockQtyTally,
    npdStockQtyCountTally,
    npdStockQtyApp,
    npdStockQtyCountApp
  };
}
function computeNegativeOpeningNpdRows(npdItems) {
  return npdItems.filter((item) => roundMoney(Number(item.opening || 0)) < 0).map((item) => ({
    id: String(item.id || item.erp || item.name || ""),
    itemName: String(item.name || ""),
    erp: String(item.erp || ""),
    opening: roundMoney(Number(item.opening || 0)),
    balance: roundMoney(Number(item.balance || 0)),
    tallyStock: item.tallyStock == null ? null : roundMoney(Number(item.tallyStock || 0))
  })).sort((a, b) => a.itemName.localeCompare(b.itemName) || a.erp.localeCompare(b.erp));
}
function computeAuditDashboard(lists, npdItems) {
  return { appValues: computeAuditAppValues(lists, npdItems), negativeOpeningNpdRows: computeNegativeOpeningNpdRows(npdItems) };
}

// src/lib/productionMaterialUsage.ts
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
  totals.forEach((value, key5) => {
    totals.set(key5, Math.max(0, Number(value.toFixed(5))));
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
  totals.forEach((value, key5) => {
    totals.set(key5, Math.max(0, Number(value.toFixed(5))));
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

// src/lib/jobCellColors.ts
var dateKey = (value) => {
  const raw = String(value ?? "").trim().slice(0, 10);
  const match = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) : raw.match(/^(\d{2})[-\/]?(\d{2})[-\/]?(\d{4})$/);
  if (!match) return "";
  const [year, month, day] = match[1].length === 4 ? [Number(match[1]), Number(match[2]), Number(match[3])] : [Number(match[3]), Number(match[2]), Number(match[1])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
};
var normalizeQcResult = (value) => {
  const normalized2 = String(value ?? "").trim().toLowerCase();
  if (["qc pass", "pass"].includes(normalized2)) return "QC PASS";
  if (["qc fail", "fail", "qc hold", "hold"].includes(normalized2)) return "QC FAIL";
  return String(value ?? "").trim();
};

// src/lib/pdiReportData.ts
var text2 = (value) => String(value ?? "").trim();
var normalized = (value) => text2(value).toLowerCase();
function findLatestInspection(inspections, productionId, jobNo) {
  const byProduction = productionId ? inspections.filter((inspection) => normalized(inspection.productionId) === normalized(productionId)) : [];
  const matches = byProduction.length ? byProduction : jobNo ? inspections.filter((inspection) => normalized(inspection.jobNo) === normalized(jobNo)) : [];
  const latest2 = [...matches].sort(
    (left, right) => text2(left.updateTimestamp || left.inspectionDate).localeCompare(text2(right.updateTimestamp || right.inspectionDate))
  ).at(-1);
  return latest2 ? { ...latest2, result: normalizeQcResult(latest2.result) } : void 0;
}
function photoPath(value) {
  const raw = text2(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return "/uploads/" + encodeURIComponent(raw.replace(/^\/?uploads\//i, ""));
}

// src/lib/samplingPlanQty.ts
var DEFAULT_SAMPLING_PLAN_QTY_DIVISOR = 2e3;
var DEFAULT_SAMPLING_PLAN_QTY_MIN = 2;
var DEFAULT_SAMPLING_PLAN_QTY_MAX = 4;
function normalizePlanQuantity(value) {
  if (typeof value === "string") {
    const normalized2 = value.replace(/,/g, "").trim();
    if (!normalized2) return "";
    value = normalized2;
  } else if (typeof value !== "number") {
    return "";
  }
  const quantity2 = Number(value);
  return Number.isFinite(quantity2) && quantity2 > 0 ? quantity2 : "";
}
function resolvePlanQuantity(...values) {
  for (const value of values) {
    const quantity2 = normalizePlanQuantity(value);
    if (quantity2 !== "") return quantity2;
  }
  return "";
}
function getSamplingPlanQtySettings(settings) {
  const divisor = Number(settings?.samplingPlanQtyDivisor);
  const minimum = Number(settings?.samplingPlanQtyMin);
  const maximum = Number(settings?.samplingPlanQtyMax);
  const safeDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : DEFAULT_SAMPLING_PLAN_QTY_DIVISOR;
  const safeMinimum = Number.isInteger(minimum) && minimum > 0 ? minimum : DEFAULT_SAMPLING_PLAN_QTY_MIN;
  const safeMaximum = Number.isInteger(maximum) && maximum >= safeMinimum ? maximum : Math.max(DEFAULT_SAMPLING_PLAN_QTY_MAX, safeMinimum);
  return { divisor: safeDivisor, minimum: safeMinimum, maximum: safeMaximum };
}
function calculateSamplingPlanQty(planQty, settings) {
  const quantity2 = normalizePlanQuantity(planQty);
  if (quantity2 === "") return "";
  const { divisor, minimum, maximum } = getSamplingPlanQtySettings(settings);
  return Math.min(maximum, Math.max(minimum, Math.ceil(quantity2 / divisor)));
}

// src/lib/reports/qcView.ts
var s2 = (v) => String(v ?? "").trim();
var key3 = (v) => s2(v).toLowerCase();
var n2 = (v) => v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : s2(v);
var formatDate = (value) => {
  const normalized2 = dateKey(value);
  return normalized2 ? `${normalized2.slice(8, 10)}-${normalized2.slice(5, 7)}-${normalized2.slice(0, 4)}` : s2(value);
};
var formatFlapHeightFlap = (left, height, right) => {
  const values = [s2(left), s2(height), s2(right)];
  return values.some(Boolean) ? values.join(" - ") : "";
};
var whole = (value) => {
  if (value === "" || value == null) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : s2(value);
};
var formatWholeFlapHeightFlap = (left, height, right) => {
  const values = [left, height, right].map(whole);
  return values.some((value) => value !== "") ? values.join(" - ") : "";
};
var checkColumnValues = (checkNo, operatorValue, driveValue, cuttingValue) => {
  const index = Number.parseInt(s2(checkNo), 10);
  const values = ["", "", "", ""];
  if (index < 1 || index > 4) return { checks: values, cutting: ["", "", "", ""] };
  const combined = [operatorValue && `OS ${operatorValue}`, driveValue && `DS ${driveValue}`].filter(Boolean).join(" | ");
  values[index - 1] = combined;
  const cutting = ["", "", "", ""];
  cutting[index - 1] = String(cuttingValue);
  return { checks: values, cutting };
};
var hasPositiveQuantity = (value) => Number(value || 0) > 0;
function getQcProductionStatus(production, actualPaperUsed, hasCorrugatedSheetUsage, processing) {
  if (production.status === "Cancelled" || production.cancelTimestamp || production.tallyTimestamp || production.status === "Completed") return s2(production.status);
  if (!hasPaperNotRequiredBypass(production) && actualPaperUsed <= 0 && !hasCorrugatedSheetUsage) return "Pending Reel Issue";
  if (!isCorrugationLinerComplete(processing, s2(production.id))) return "Pending Corrugation";
  if (!isMachineStepFull(processing, s2(production.id), "Printing")) return "Pending Printing";
  return s2(production.status);
}
function toQcItems(npdItems) {
  return npdItems.map((item) => ({ ...item, artwork: item.url, spec: item.artwork }));
}
function computeQcViewRows(lists, items) {
  const { productions, processing, boardline, printing, inspections, loadingSlips, plans, settings, materials, materialIssues, materialIssueLines, materialIssueReelLines, materialReturns, materialReturnLines, materialReturnReelLines, qcUpdates, blockRecords, controlRecords } = lists;
  const materialUsageMap = buildProductionMaterialUsageMap(materialIssues, materialIssueLines, materialReturns, materialReturnLines, materialIssueReelLines, materialReturnReelLines, productions);
  const corrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(materials, materialIssues, materialIssueLines, materialReturns, materialReturnLines);
  const loadingByJob = buildJobLoadingRecords(productions, loadingSlips, plans);
  const lastByJob = (rows2) => {
    const map = /* @__PURE__ */ new Map();
    rows2.forEach((row) => map.set(key3(row.jobNo), row));
    return map;
  };
  const lastBoardlineByJob = lastByJob(boardline);
  const lastPrintingByJob = lastByJob(printing);
  const latestByErp = (rows2) => {
    const map = /* @__PURE__ */ new Map();
    rows2.forEach((row) => {
      const erpKey = key3(row.erpCode || row.erpNo);
      const current = map.get(erpKey);
      if (!current || s2(row.updateTimestamp).localeCompare(s2(current.updateTimestamp)) > 0) map.set(erpKey, row);
    });
    return map;
  };
  const latestQcUpdateByErp = latestByErp(qcUpdates);
  const latestBlockByErp = latestByErp(blockRecords);
  const latestControlByErp = latestByErp(controlRecords);
  const firstIndex = (values) => {
    const map = /* @__PURE__ */ new Map();
    values.forEach((value, index) => {
      if (!map.has(value)) map.set(value, index);
    });
    return map;
  };
  const itemIndexById = firstIndex(items.map((i) => key3(i.id)));
  const itemIndexByErp = firstIndex(items.map((i) => key3(i.erp)));
  const findItem = (p, erp) => {
    const candidates = [itemIndexById.get(key3(p.itemId)), itemIndexById.get(key3(p.npdId)), itemIndexByErp.get(key3(erp))].filter((index) => index !== void 0);
    return candidates.length ? items[Math.min(...candidates)] : void 0;
  };
  const processingByProductionId = /* @__PURE__ */ new Map();
  processing.forEach((row) => {
    const list = processingByProductionId.get(row.productionId);
    if (list) list.push(row);
    else processingByProductionId.set(row.productionId, [row]);
  });
  const qtyIndexById = /* @__PURE__ */ new Map();
  const qtyIndexByJob = /* @__PURE__ */ new Map();
  processing.forEach((record, index) => {
    const machine = key3(record.machineName);
    const byId = `${machine}|${key3(record.productionId)}`;
    const byJob = `${machine}|${key3(record.jobNo)}`;
    (qtyIndexById.get(byId) || qtyIndexById.set(byId, []).get(byId)).push(index);
    (qtyIndexByJob.get(byJob) || qtyIndexByJob.set(byJob, []).get(byJob)).push(index);
  });
  const processingQuantity2 = (production, job, machine) => {
    const a = qtyIndexById.get(`${key3(machine)}|${key3(production.id)}`) || [];
    const b = qtyIndexByJob.get(`${key3(machine)}|${key3(job)}`) || [];
    let total = 0;
    let i = 0;
    let j = 0;
    let last = -1;
    while (i < a.length || j < b.length) {
      const next = j >= b.length || i < a.length && a[i] <= b[j] ? a[i++] : b[j++];
      if (next === last) continue;
      last = next;
      const record = processing[next];
      total += hasPositiveQuantity(record.qty) ? Number(record.qty) : 0;
    }
    return total;
  };
  return productions.filter((p) => p.status !== "Cancelled" && !(key3(p.closeBy) === "yes" && s2(p.closeDate)) && s2(p.transactionNo || p.jobCardNo)).map((p) => {
    const job = s2(p.transactionNo || p.jobCardNo);
    const b = lastBoardlineByJob.get(key3(job));
    const pr = lastPrintingByJob.get(key3(job));
    const erp = s2(p.erpCode || b?.erp || pr?.erp);
    const item = findItem(p, erp);
    const itemName = s2(p.itemName || item?.name || b?.itemName || pr?.itemName);
    const qcUpdate = latestQcUpdateByErp.get(key3(erp));
    const block = latestBlockByErp.get(key3(erp));
    const control = latestControlByErp.get(key3(erp));
    const pdi = findLatestInspection(inspections, s2(p.id), job);
    const pdiResult = s2(pdi?.result);
    const planQty = resolvePlanQuantity(p.plannedQty, p.qty, b?.planQty, pr?.planQty);
    const operatorCheck = formatWholeFlapHeightFlap(b?.flapAchievedOs, b?.heightAchievedOs, b?.flapLAchievedOs);
    const driveCheck = formatWholeFlapHeightFlap(b?.flapAchievedDs, b?.heightAchievedDs, b?.flapLAchievedDs);
    const mappedChecks = checkColumnValues(b?.checkNo, operatorCheck, driveCheck, whole(b?.cuttingSizeMm));
    const tolerance = Number(settings[0]?.qcBgsmTolerancePercent ?? 3);
    const bgsmTolerance = tolerance >= 0 ? tolerance : 3;
    const requiredBgsm = Number(b?.boardGsm || 0);
    const bgsmMin = whole(requiredBgsm * (1 - bgsmTolerance / 100));
    const bgsmMax = whole(requiredBgsm * (1 + bgsmTolerance / 100));
    return { __rowKey: s2(p.id) || `${job}|${s2(p.date)}|${erp}`, "Job No.": job, Date: formatDate(p.date), "Party Name": s2(p.companyName || b?.partyName || pr?.partyName), "Item Name": itemName, "ERP Code": erp, "Plan Quantity": planQty, "Item Status": getQcProductionStatus(p, getProductionActualPaperUsed(p, materialUsageMap), hasProductionCorrugatedSheetUsage(p, corrugatedSheetUsageMap), processingByProductionId.get(s2(p.id)) || []), Artwork: s2(item?.artwork), Spec: s2(item?.spec), "File No.": s2(qcUpdate?.fileNo), "Index No": s2(qcUpdate?.indexNo), "Sample No.": s2(qcUpdate?.sampleNo), "Block Location": s2(block?.blockLocation), "Block No.": s2(block?.blockNo), "Sample Location": s2(qcUpdate?.location), "Sample No. (Control)": s2(control?.sampleNo), "Boardline AUTO-CORRECTION Message": [b?.systemAutoCorrection1, b?.systemAutoCorrection2, b?.systemAutoCorrection3, b?.systemAutoCorrection4, b?.systemAutoCorrection5].filter(Boolean).join(" | "), "Previous Customer Complaint": s2(b?.previousCustomerComplaintWarning || pr?.previousCustomerComplaintWarning), "PDI RESULT": pdiResult, "Boardline Production": n2(processingQuantity2(p, job, "Corrugation Liner")), "Printing Production": n2(processingQuantity2(p, job, "Printing")), "Loaded Quantity": n2((loadingByJob.get(p.id) || []).reduce((total, record) => total + record.qty, 0)), Length: n2(p.length || b?.length || pr?.lengthId), Width: n2(p.breadth || b?.width || pr?.widthId), Height: n2(p.height || b?.heightOd || pr?.heightId), "L-OD": n2(b?.length), "W-OD": n2(b?.width), "H-OD": n2(b?.heightOd), FLAP: n2(b?.flap), Ply: n2(b?.ply), "No. Of parts": s2(b?.part), "SAMPLING PLAN QTY": calculateSamplingPlanQty(planQty, settings[0]), "Required Size": s2(b?.standard) || formatFlapHeightFlap(b?.flap, b?.heightOd, b?.flap) || s2(pr?.standardBoxSize), "Check 1": mappedChecks.checks[0], "Check 2": mappedChecks.checks[1], "Check 3": mappedChecks.checks[2], "Check 4": mappedChecks.checks[3], "Required Cutting Size": whole(b?.cuttingSizeRequired), "Cutting Check 1": mappedChecks.cutting[0], "Cutting Check 2": mappedChecks.cutting[1], "Cutting Check 3": mappedChecks.cutting[2], "Cutting Check 4": mappedChecks.cutting[3], "Required B.GSM": whole(b?.boardGsm), "BGSM MIN": bgsmMin, "BGSM MAX": bgsmMax, "GSM Check 1": bgsmMin, "GSM Check 2": bgsmMax, "GSM Check 3": bgsmMin, "GSM Check 4": bgsmMax, "PLY": whole(b?.ply), "Flute Check": s2(b?.typeOfFlute), "Moisture Check": whole(b?.moisture), "Board Thickness Achieved": whole(b?.boardThickness || pr?.boardThickness), "BS Achieved": whole(b?.bsAchieved || pr?.bsAchieved), "Board Weight Achieved (Grams)": whole(b?.sheetWeightGrams || pr?.boxWeightGrams), "QC Remarks": s2(b?.boardlineRemarks || pr?.column40) };
  });
}

// src/lib/traceabilityData.ts
var text3 = (value) => String(value ?? "").trim();
var key4 = (value) => text3(value).toLowerCase().replace(/\s+/g, " ");
var rows = (value) => Array.isArray(value) ? value : [];
var numberValue2 = (value) => {
  if (value === "" || value === null || value === void 0) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : text3(value);
};
var firstText = (...values) => values.map(text3).find(Boolean) || "";
var firstValue = (...values) => {
  for (const value of values) {
    if (value !== null && value !== void 0 && text3(value)) return numberValue2(value);
  }
  return "";
};
var latest = (rows2, timestamp) => [...rows2].sort((left, right) => text3(timestamp(left)).localeCompare(text3(timestamp(right)))).at(-1);
var dateText = (value) => text3(value).slice(0, 19);
var formatDate2 = (value) => text3(value).slice(0, 10);
var normalizedJob = (value) => key4(value).replace(/^0+(?=\d)/, "");
var sameJob = (left, right) => normalizedJob(left) === normalizedJob(right);
var reelIdentity = (line) => {
  const packingSlipId = key4(line.packingSlipId);
  const reelNo = key4(line.ourReelNo);
  return packingSlipId || reelNo ? `${packingSlipId}|${reelNo}` : key4(line.id);
};
var joinSize = (...values) => {
  const parts = values.map(text3);
  return parts.some(Boolean) ? parts.join(" x ") : "";
};
var joinNonEmpty = (separator, ...values) => values.map(text3).filter(Boolean).join(separator);
function latestByJob(rows2, jobNo) {
  return latest(rows2.filter((row) => sameJob(row.jobNo, jobNo)), (row) => row.updateTimestamp || row.timestamp);
}
function processingFor(rows2, production, jobNo) {
  return rows2.filter((row) => key4(row.productionId) === key4(production.id) || sameJob(row.jobNo, jobNo));
}
function processingQuantity(rows2, machineName) {
  return rows2.filter((row) => key4(row.machineName) === key4(machineName)).reduce((total, row) => total + Math.max(0, Number(row.qty || 0)), 0);
}
function processingDate(rows2, machineName) {
  return latest(rows2.filter((row) => key4(row.machineName) === key4(machineName)), (row) => row.updateTimestamp || row.date)?.date || "";
}
function productionLoadingSlips(production, jobNo, plans, slips) {
  const planIds = new Set(plans.filter((plan) => key4(plan.productionId) === key4(production.id)).map((plan) => key4(plan.id)));
  return slips.filter((slip) => key4(slip.status) !== "cancelled" && (slip.lines || []).some((line) => {
    if (planIds.has(key4(line.dispatchPlanId))) return true;
    if ((line.jobNos || []).some((value) => sameJob(value, jobNo))) return true;
    return (line.allocations || []).some((allocation) => allocation.sourceType === "job" && (key4(allocation.jobId) === key4(production.id) || sameJob(allocation.jobNo, jobNo)));
  }));
}
function statusOf(production) {
  if (production.status === "Cancelled" || text3(production.cancelTimestamp)) return "JOB CANCELLED";
  if (production.status === "Completed" || text3(production.closeDate) || key4(production.closeBy) === "yes") return "JOB CLOSED";
  return "JOB OPEN";
}
function layerValue(value) {
  const normalized2 = text3(value);
  if (!normalized2) return "";
  const numeric = Number(normalized2);
  if (!Number.isFinite(numeric)) return normalized2;
  if (numeric === 0) return "";
  return String(numeric);
}
function paperSpec(item) {
  if (!item) return "";
  return [
    item.l1,
    item.f1,
    item.l2,
    item.f2,
    item.l3,
    item.f3
  ].map(layerValue).filter(Boolean).join(" - ");
}
function plannedPaper(production) {
  return [production.l1, production.f1, production.l2, production.f2, production.l3].map(layerValue).filter(Boolean).join(" - ");
}
function explicitLineIncharge(board) {
  if (!board) return "";
  const lineInchargeKeys = /* @__PURE__ */ new Set(["lineincharge", "lineinchargename", "lineinchargeperson"]);
  const rawBoard = board;
  return Object.entries(rawBoard).filter(([field]) => lineInchargeKeys.has(field.toLowerCase().replace(/[^a-z0-9]/g, ""))).map(([, value]) => text3(value)).find(Boolean) || "";
}
function processingLineIncharge(rows2) {
  return firstText(latest(
    rows2.filter((row) => key4(row.machineName) === "corrugation liner" && text3(row.operatorName)),
    (row) => row.updateTimestamp || row.date
  )?.operatorName);
}
function buildTraceabilityPaperIssueDetails(production, jobNo, materials = [], issueReelLines = [], returnReelLines = []) {
  const belongsToProduction = (line) => text3(line.productionId) && key4(line.productionId) === key4(production.id) || text3(line.jobNo) && sameJob(line.jobNo, jobNo);
  const eligibleIssues = rows(issueReelLines).filter((line) => belongsToProduction(line) && Number(line.weightKg || 0) > 0);
  const returnedWeights = /* @__PURE__ */ new Map();
  rows(returnReelLines).filter((line) => belongsToProduction(line) && Number(line.weightKg || 0) > 0).forEach((line) => {
    const identity = reelIdentity(line);
    returnedWeights.set(identity, (returnedWeights.get(identity) || 0) + Number(line.weightKg || 0));
  });
  const grouped = /* @__PURE__ */ new Map();
  eligibleIssues.forEach((line) => {
    const identity = reelIdentity(line);
    const existing = grouped.get(identity);
    if (existing) existing.issuedWeight += Number(line.weightKg || 0);
    else grouped.set(identity, { line, issuedWeight: Number(line.weightKg || 0) });
  });
  const materialById = new Map(rows(materials).map((material) => [key4(material.id), material]));
  return Array.from(grouped.entries()).map(([identity, entry]) => {
    const material = materialById.get(key4(entry.line.materialId));
    const netIssue = Math.max(0, Number((entry.issuedWeight - (returnedWeights.get(identity) || 0)).toFixed(2)));
    return {
      reelNo: text3(entry.line.ourReelNo),
      reelSize: numberValue2(material?.size),
      gsm: numberValue2(material?.gsm),
      bf: numberValue2(material?.bf),
      netIssue: numberValue2(netIssue),
      issueTimestamp: text3(entry.line.updateTimestamp)
    };
  }).sort((left, right) => left.issueTimestamp.localeCompare(right.issueTimestamp) || left.reelNo.localeCompare(right.reelNo));
}
function buildTraceabilityRecord(production, input) {
  const jobNo = firstText(production.transactionNo, production.jobCardNo);
  const board = latestByJob(rows(input.boardline), jobNo);
  const printing = latestByJob(rows(input.printing), jobNo);
  const inspection = findLatestInspection(rows(input.inspections), production.id, jobNo);
  const productionProcessing = processingFor(rows(input.processing), production, jobNo);
  const item = rows(input.items).find(
    (candidate) => [candidate.id, candidate.erp].some((value) => key4(value) && (key4(value) === key4(production.itemId) || key4(value) === key4(production.npdId) || key4(value) === key4(production.erpCode) || key4(value) === key4(board?.erp) || key4(value) === key4(printing?.erp)))
  );
  const schedule = rows(input.schedules).find((candidate) => key4(candidate.id) === key4(production.scheduleId));
  const order = rows(input.orders).find((candidate) => key4(candidate.id) === key4(schedule?.orderId));
  const company = rows(input.companies).find((candidate) => key4(candidate.id) === key4(order?.companyId));
  const erpCode = firstText(production.erpCode, inspection?.erpCode, board?.erp, printing?.erp, item?.erp);
  const partyName = firstText(production.companyName, inspection?.partyName, board?.partyName, printing?.partyName, company?.name);
  const itemName = firstText(production.itemName, item?.name, inspection?.itemName, board?.itemName, printing?.itemName);
  const plans = rows(input.dispatchPlans).filter((plan) => key4(plan.productionId) === key4(production.id));
  const slips = productionLoadingSlips(production, jobNo, rows(input.dispatchPlans), rows(input.loadingSlips));
  const latestSlip = latest(slips, (slip) => slip.updateTimestamp || slip.date);
  const invoice = rows(input.invoices).find((candidate) => key4(candidate.id) === key4(latestSlip?.invoiceId));
  const invoiceLine = rows(input.invoiceLineItems).find((line) => key4(line.invoiceId) === key4(invoice?.id) && (key4(line.npdId) === key4(production.npdId) || key4(line.itemId) === key4(production.itemId)));
  const truck = rows(input.trucks).find((candidate) => key4(candidate.id) === key4(latestSlip?.truckId));
  const complaintLots = rows(input.complaints).filter((complaint) => key4(complaint.erpCode) === key4(erpCode) && sameJob(complaint.lotNo, jobNo)).map((complaint) => text3(complaint.lotNo));
  const lotNumbers = [...new Set([text3(inspection?.lotNo), text3(printing?.lotNoPrinted), ...complaintLots].filter(Boolean))];
  const planQuantity = resolvePlanQuantity(production.plannedQty, production.qty, board?.planQty, printing?.planQty, inspection?.plannedQty, plans.reduce((sum, plan) => sum + Number(plan.plannedQty || 0), 0));
  const plannedPaperValue = plannedPaper(production);
  const lineIncharge = firstText(explicitLineIncharge(board), processingLineIncharge(productionProcessing));
  const paperRequired = firstValue(production.totalPaperWeight);
  const paperUsed = numberValue2(getProductionActualPaperUsed(production));
  const requiredNumber = Number(paperRequired || 0);
  const usedNumber = Number(paperUsed || 0);
  const paperWastagePercent = requiredNumber > 0 && usedNumber > 0 ? Number(Math.max(0, (usedNumber - requiredNumber) / requiredNumber * 100).toFixed(2)) : "";
  const customerArtwork = firstText(item?.artwork);
  const customerSpecification = firstText(item?.url, item?.spec);
  const boardWastagePcs = firstValue(production.boardWastagePcs);
  const boardWastagePercent = firstValue(production.boardWastagePercent);
  const boardlineQuantity = processingQuantity(productionProcessing, "Corrugation Liner");
  const printingQuantity = processingQuantity(productionProcessing, "Printing");
  const dispatchQuantity = slips.reduce((total, slip) => total + (slip.lines || []).reduce((lineTotal, line) => {
    const allocationQuantity = (line.allocations || []).filter((allocation) => allocation.sourceType === "job" && (key4(allocation.jobId) === key4(production.id) || sameJob(allocation.jobNo, jobNo))).reduce((sum, allocation) => sum + Number(allocation.qty || 0), 0);
    if (allocationQuantity > 0) return lineTotal + allocationQuantity;
    const belongsToJob = (line.jobNos || []).some((value) => sameJob(value, jobNo));
    return lineTotal + (belongsToJob || plans.some((plan) => key4(plan.id) === key4(line.dispatchPlanId)) ? Number(line.loadedQty || 0) : 0);
  }, 0), 0);
  const latestQcUpdate = latest(rows(input.qcUpdates).filter((record) => key4(record.erpNo) === key4(erpCode)), (record) => record.updateTimestamp || record.updateDate);
  const latestComplaint = latest(rows(input.complaints).filter((record) => key4(record.erpCode) === key4(erpCode)), (record) => record.timestamp || record.dateOfComplaint);
  const latestPlan = latest(plans, (plan) => plan.updateTimestamp || plan.date);
  const plannedDate = firstText(production.scheduledDate, schedule?.scheduledDate, production.date);
  const actualPdiDate = inspection?.inspectionDate || inspection?.updateTimestamp || "";
  const normalizedPrintingColors = joinNonEmpty(" / ", printing?.printingColor1Standard, printing?.printingColour2Standard);
  const actualPrintingColors = joinNonEmpty(" / ", printing?.colour1Actual, printing?.colour2Actual);
  const paperIssue = buildTraceabilityPaperIssueDetails(
    production,
    jobNo,
    rows(input.materials),
    rows(input.materialIssueReelLines),
    rows(input.materialReturnReelLines)
  );
  return {
    id: production.id,
    productionId: production.id,
    firmName: firstText(production.firmName),
    jobNo,
    lotNo: firstText(...lotNumbers),
    lotNumbers,
    itemName,
    partyName,
    erpCode,
    status: statusOf(production),
    paperIssue,
    planning: {
      planQuantity,
      plannedDate: formatDate2(plannedDate),
      jobWeightKg: firstValue(production.totalWeightOfSet, production.totalPaperWeight),
      realizationPerKg: firstValue(production.realizationPerKg),
      customerSpecification,
      customerArtwork
    },
    boardline: {
      quantityProducedPcs: numberValue2(boardlineQuantity || production.prodFromSheetPlant),
      paperRequiredKg: paperRequired,
      paperUsedKg: paperUsed,
      paperWastagePercent,
      boardWastagePcs,
      boardWastagePercent,
      qcExecutive: firstText(board?.qcPerson),
      rapc: firstValue(item?.internalRapc, item?.rapc),
      cuttingSizeMm: firstValue(board?.cuttingSizeMm, item?.cuttingSize),
      ups: firstValue(production.ups, item?.ups),
      ply: firstValue(production.ply, item?.ply, board?.ply),
      flute: firstText(production.flute, item?.flute, board?.typeOfFlute),
      paperSpec: paperSpec(item),
      sizeLxWxHmm: joinSize(production.length || item?.length, production.breadth || item?.breadth, production.height || item?.height),
      plannedPaper: plannedPaperValue,
      lineIncharge,
      sheetPlantRequiredSize: firstText(production.sheetPlantRequiredSize, board?.standard),
      sheetPlantProducedSize: firstText(board?.flapHeightFlapOperatorSide),
      sheetPlantProducedSizeDr: firstText(board?.flapHeightFlapDriveSide),
      cuttingSizeProduced: firstValue(production.cuttingSizeProduced, board?.cuttingSizeMm),
      typeOfFluteProduced: firstText(board?.typeOfFlute),
      bgsmAchieved: firstValue(board?.boardGsm, printing?.csAchieved, printing?.bsAchieved),
      boardThicknessAchieved: firstValue(board?.boardThickness, printing?.boardThickness),
      sheetWeightGramsAchieved: firstValue(board?.sheetWeightGrams, printing?.boxWeightGrams),
      moistureAchieved: firstValue(board?.moisture)
    },
    converting: {
      quantityProduced: numberValue2(printingQuantity || production.prodFromFFG),
      sizeAchieved: firstText(printing?.boxSizeAchieved, joinSize(printing?.lengthId, printing?.widthId, printing?.heightId)),
      boardThicknessAchieved: firstValue(printing?.boardThickness, board?.boardThickness),
      printingColourRequired: normalizedPrintingColors,
      printingColourIdentified: actualPrintingColors,
      boxWeightGrams: firstValue(printing?.boxWeightGrams, inspection?.boxWeightGrams),
      standardCsKg: firstValue(printing?.csStandard),
      achievedCsKg: firstValue(printing?.csAchieved),
      standardBsKg: firstValue(printing?.bsStandard),
      achievedBsKg: firstValue(printing?.bsAchieved),
      operatorIncharge: firstText(printing?.operatorName),
      qcInspector: firstText(printing?.qcPerson)
    },
    pdi: {
      boxSizeRequired: firstText(printing?.standardBoxSize, board?.standard),
      boxSizeAchieved: firstText(inspection?.lengthId && inspection?.widthId && inspection?.heightId ? joinSize(inspection.lengthId, inspection.widthId, inspection.heightId) : ""),
      csAchievedRequired: joinNonEmpty(" / ", inspection?.csAchieved, printing?.csStandard),
      bgsmAchieved: firstValue(inspection?.bGsm, board?.boardGsm),
      boxWeightAchievedGrams: firstValue(inspection?.boxWeightGrams, printing?.boxWeightGrams),
      artworkCheck: firstText(inspection?.printingArtworkCheck),
      printingColorCheck: firstText(inspection?.printingColorCheck),
      boxSquaringCheck: firstText(inspection?.boxSquaringCheck),
      flapGapCheck: firstText(inspection?.flapGapCheck),
      jointPastingDelaminationCheck: firstText(inspection?.jointPastingDelaminationCheck),
      remarks: firstText(inspection?.remarks, board?.boardlineRemarks, printing?.column40, latestQcUpdate?.remarks, latestComplaint?.issueDetails),
      frontPhoto: photoPath(inspection?.frontPhoto),
      backPhoto: photoPath(inspection?.backPhoto),
      qcInspector: firstText(inspection?.qcPerson),
      result: firstText(inspection?.result)
    },
    dispatch: {
      plannedQuantity: firstValue(latestPlan?.plannedQty, planQuantity),
      dispatchQuantity: dispatchQuantity || firstValue(latestPlan?.loadedQty),
      dispatchDate: formatDate2(firstText(latestSlip?.date, invoice?.date)),
      invoiceNo: firstText(invoice?.invoiceNo, latestSlip?.invoiceNo),
      rate: firstValue(invoiceLine?.rate, production.rate, order?.rate),
      saleValue: firstValue(invoiceLine?.amount, order?.orderAmount),
      vehicleNo: firstText(latestSlip?.truckNo, truck?.truckNo),
      driverName: firstText(truck?.driverName),
      driverNo: firstText(truck?.mobileNo)
    },
    timeChart: {
      plannedForProduction: dateText(plannedDate),
      productionFromBoardline: dateText(processingDate(productionProcessing, "Corrugation Liner")),
      productionFromPrinting: dateText(processingDate(productionProcessing, "Printing")),
      preDispatchInspection: dateText(actualPdiDate),
      dispatch: dateText(firstText(latestSlip?.date, invoice?.date))
    },
    searchText: [jobNo, ...lotNumbers, erpCode, partyName, itemName, firstText(production.firmName)].map(key4).join(" ")
  };
}
function buildTraceabilitySearchIndex(input) {
  const pdiNormalized = (value) => text3(value).toLowerCase();
  const groupBy = (list, keyOf) => {
    const map = /* @__PURE__ */ new Map();
    list.forEach((row) => {
      const groupKey = keyOf(row);
      const group = map.get(groupKey);
      if (group) group.push(row);
      else map.set(groupKey, [row]);
    });
    return map;
  };
  const firstByKey = (list, keyOf) => {
    const map = /* @__PURE__ */ new Map();
    list.forEach((row) => {
      const rowKey = keyOf(row);
      if (!map.has(rowKey)) map.set(rowKey, row);
    });
    return map;
  };
  const boardlineByJob = groupBy(rows(input.boardline), (row) => normalizedJob(row.jobNo));
  const printingByJob = groupBy(rows(input.printing), (row) => normalizedJob(row.jobNo));
  const latestOfJob = (groups, jobNo) => latest(groups.get(normalizedJob(jobNo)) || [], (row) => row.updateTimestamp || row.timestamp);
  const inspectionsList = rows(input.inspections);
  const inspectionIndexById = groupBy(inspectionsList.map((row, index) => ({ row, index })), (entry) => pdiNormalized(entry.row.productionId));
  const inspectionIndexByJob = groupBy(inspectionsList.map((row, index) => ({ row, index })), (entry) => pdiNormalized(entry.row.jobNo));
  const inspectionsFor = (productionId, jobNo) => {
    const seen = /* @__PURE__ */ new Set();
    return [...inspectionIndexById.get(pdiNormalized(productionId)) || [], ...inspectionIndexByJob.get(pdiNormalized(jobNo)) || []].filter((entry) => seen.has(entry.index) ? false : (seen.add(entry.index), true)).sort((a, b) => a.index - b.index).map((entry) => entry.row);
  };
  const items = rows(input.items);
  const itemIndexByKey = /* @__PURE__ */ new Map();
  items.forEach((candidate, index) => {
    [candidate.id, candidate.erp].forEach((value) => {
      const itemKey = key4(value);
      if (itemKey && !itemIndexByKey.has(itemKey)) itemIndexByKey.set(itemKey, index);
    });
  });
  const findItem = (...candidates) => {
    let best = -1;
    candidates.forEach((value) => {
      const candidateKey = key4(value);
      if (!candidateKey) return;
      const index = itemIndexByKey.get(candidateKey);
      if (index !== void 0 && (best < 0 || index < best)) best = index;
    });
    return best < 0 ? void 0 : items[best];
  };
  const scheduleById = firstByKey(rows(input.schedules), (row) => key4(row.id));
  const orderById = firstByKey(rows(input.orders), (row) => key4(row.id));
  const companyById = firstByKey(rows(input.companies), (row) => key4(row.id));
  const complaintsByErp = groupBy(rows(input.complaints), (row) => key4(row.erpCode));
  return rows(input.productions).filter((production) => Boolean(production && text3(production.id))).map((production) => {
    const jobNo = firstText(production.transactionNo, production.jobCardNo);
    const board = latestOfJob(boardlineByJob, jobNo);
    const printing = latestOfJob(printingByJob, jobNo);
    const inspection = findLatestInspection(inspectionsFor(production.id, jobNo), production.id, jobNo);
    const item = findItem(production.itemId, production.npdId, production.erpCode, board?.erp, printing?.erp);
    const schedule = scheduleById.get(key4(production.scheduleId));
    const order = orderById.get(key4(schedule?.orderId));
    const company = companyById.get(key4(order?.companyId));
    const erpCode = firstText(production.erpCode, inspection?.erpCode, board?.erp, printing?.erp, item?.erp);
    const partyName = firstText(production.companyName, inspection?.partyName, board?.partyName, printing?.partyName, company?.name);
    const itemName = firstText(production.itemName, item?.name, inspection?.itemName, board?.itemName, printing?.itemName);
    const complaintLots = (complaintsByErp.get(key4(erpCode)) || []).filter((complaint) => sameJob(complaint.lotNo, jobNo)).map((complaint) => text3(complaint.lotNo));
    const lotNumbers = [...new Set([text3(inspection?.lotNo), text3(printing?.lotNoPrinted), ...complaintLots].filter(Boolean))];
    return {
      id: production.id,
      productionId: production.id,
      firmName: firstText(production.firmName),
      jobNo,
      lotNo: firstText(...lotNumbers),
      lotNumbers,
      itemName,
      partyName,
      erpCode,
      status: statusOf(production),
      searchText: [jobNo, ...lotNumbers, erpCode, partyName, itemName, firstText(production.firmName)].map(key4).join(" ")
    };
  });
}
function buildTraceabilityRecordById(input, productionId) {
  const production = rows(input.productions).find((row) => Boolean(row && text3(row.id)) && row.id === productionId);
  return production ? buildTraceabilityRecord(production, input) : null;
}

// src/lib/reports/serverReports.ts
function catalogFrom(helpers) {
  const rows2 = helpers.catalogRows || { fgRows: [], phpRows: [], plateRows: [], materialRows: [] };
  return createOrderItemCatalog(rows2);
}
var REPORT_DEFINITIONS = {
  "paper-requirement": {
    permission: "/reports/paper-requirement",
    catalog: true,
    lists: [
      { key: "productions", entity: "productions", scope: "firm" },
      { key: "orders", entity: "orders", scope: "firm" },
      { key: "schedules", entity: "orders_schedule", scope: "firm" },
      { key: "dispatchPlans", entity: "dispatch_plans", scope: "firm" },
      { key: "loadingSlips", entity: "loading_slips", scope: "firm" },
      { key: "materials", entity: "materials", scope: "firm" },
      { key: "materialIn", entity: "material_in", scope: "firm" },
      { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
      { key: "issueEntries", entity: "material_issues", scope: "firm" },
      { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
      { key: "returnEntries", entity: "material_returns", scope: "firm" },
      { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
      { key: "purchaseOrders", entity: "purchase_orders", scope: "firm" },
      { key: "purchaseOrderLines", entity: "purchase_order_lines", scope: "firm" },
      { key: "rapcRanges", entity: "rapc_ranges", scope: "firm" }
    ],
    compute: (lists, params, helpers) => computePaperRequirement(lists, {
      uptoDate: String(params.uptoDate || ""),
      resolveOrderItem: catalogFrom(helpers).resolveOrderItem
    })
  }
};
REPORT_DEFINITIONS["jobs-in-progress"] = {
  permission: "/reports/jobs-in-progress",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "plans", entity: "dispatch_plans", scope: "firm" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" }
  ],
  compute: (lists, _params, helpers) => computeJobsInProgressRows(lists, (helpers.npdItems || []).map(normalizeNpdItem))
};
REPORT_DEFINITIONS["jobwise-reel-consumption"] = {
  permission: "/reports/jobwise-reel-consumption",
  lists: [
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" }
  ],
  compute: (lists) => computeJobwiseReelConsumptionRows(lists)
};
REPORT_DEFINITIONS["conversion-cost-month-wise"] = {
  permission: "/reports/conversion-cost-month-wise",
  lists: [
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "issueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "fixedExpenses", entity: "fixed_monthly_expenses", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" }
  ],
  compute: (lists, params) => computeConversionCostMonthWise(lists, String(params.fy || ""))
};
REPORT_DEFINITIONS["summary-sheet"] = {
  permission: "/reports/summary-sheet",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "slips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "companies", entity: "companies", scope: "firm" },
    { key: "firms", entity: "firms", scope: "firm" }
  ],
  // Blank cells are left out to keep the download small (the page reads a missing value as blank).
  compute: (lists, _params, helpers) => computeSummarySheetRows(lists, (helpers.npdItems || []).map(normalizeNpdItem)).map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== "" && value !== null && value !== void 0)))
};
REPORT_DEFINITIONS["summary-sheet-tiles"] = {
  permission: "/reports/summary-sheet",
  npdItems: true,
  lists: [
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "slips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "firms", entity: "firms", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialFirmOpenings", entity: "material_firm_openings", scope: "all" },
    { key: "materialIn", entity: "material_in", scope: "all" },
    { key: "issueLines", entity: "material_issue_lines", scope: "all" },
    { key: "phpJobs", entity: "php_job_master", scope: "all" },
    { key: "plateJobs", entity: "plate_job_master", scope: "all" }
  ],
  compute: (lists, _params, helpers) => computeSummarySheetExtras(lists, (helpers.npdItems || []).map(normalizeNpdItem))
};
REPORT_DEFINITIONS["conversion-cost-details"] = {
  permission: "/reports/conversion-cost-details",
  lists: [
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "issueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "packingSlips", entity: "material_in_packing_slips", scope: "firm" },
    { key: "issueReelLines", entity: "material_issue_reel_lines", scope: "firm" },
    { key: "returnReelLines", entity: "material_return_reel_lines", scope: "firm" },
    { key: "fixedExpenses", entity: "fixed_monthly_expenses", scope: "firm" },
    { key: "fixedDailyExpenses", entity: "fixed_daily_expenses", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" },
    { key: "processing", entity: "production_processing", scope: "firm" },
    { key: "invoices", entity: "invoices", scope: "firm" },
    { key: "invoiceLines", entity: "invoice_line_items", scope: "firm" }
  ],
  compute: (lists, params) => computeConversionCostBase(lists, String(params.fromDate || ""), String(params.toDate || ""))
};
REPORT_DEFINITIONS["audit-dashboard"] = {
  permission: "/audit-dashboard",
  npdItems: true,
  lists: [
    { key: "materialIn", entity: "material_in", scope: "firm" },
    { key: "materialIssues", entity: "material_issues", scope: "firm" },
    { key: "materialIssueLines", entity: "material_issue_lines", scope: "firm" },
    { key: "materialReturns", entity: "material_returns", scope: "firm" },
    { key: "materialReturnLines", entity: "material_return_lines", scope: "firm" },
    { key: "invoices", entity: "invoices", scope: "firm" },
    { key: "productions", entity: "productions", scope: "firm" }
  ],
  compute: (lists, _params, helpers) => computeAuditDashboard(lists, (helpers.npdItems || []).map(normalizeNpdItem))
};
REPORT_DEFINITIONS["qc-view"] = {
  permission: "/quality/qc-view",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "firm" },
    { key: "printing", entity: "printing_qc_checks", scope: "firm" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "plans", entity: "dispatch_plans", scope: "all" },
    { key: "settings", entity: "settings", scope: "firm" },
    { key: "materials", entity: "materials", scope: "firm" },
    { key: "materialIssues", entity: "material_issues", scope: "all" },
    { key: "materialIssueLines", entity: "material_issue_lines", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturns", entity: "material_returns", scope: "all" },
    { key: "materialReturnLines", entity: "material_return_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "blockRecords", entity: "qc_block_records", scope: "all" },
    { key: "controlRecords", entity: "control_records", scope: "all" }
  ],
  compute: (lists, _params, helpers) => computeQcViewRows(lists, toQcItems((helpers.npdItems || []).map(normalizeNpdItem)))
};
REPORT_DEFINITIONS["traceability-index"] = {
  permission: "/quality/traceability",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "all" },
    { key: "printing", entity: "printing_qc_checks", scope: "all" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "dispatchPlans", entity: "dispatch_plans", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "complaints", entity: "quality_complaints", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" }
  ],
  compute: (lists, _params, helpers) => buildTraceabilitySearchIndex({ ...lists, items: (helpers.npdItems || []).map(normalizeNpdItem) })
};
REPORT_DEFINITIONS["traceability-record"] = {
  permission: "/quality/traceability",
  npdItems: true,
  lists: [
    { key: "productions", entity: "productions", scope: "all" },
    { key: "companies", entity: "companies", scope: "all" },
    { key: "orders", entity: "orders", scope: "all" },
    { key: "schedules", entity: "orders_schedule", scope: "all" },
    { key: "processing", entity: "production_processing", scope: "all" },
    { key: "boardline", entity: "boardline_qc_checks", scope: "all" },
    { key: "printing", entity: "printing_qc_checks", scope: "all" },
    { key: "inspections", entity: "pre_dispatch_inspections", scope: "all" },
    { key: "dispatchPlans", entity: "dispatch_plans", scope: "all" },
    { key: "loadingSlips", entity: "loading_slips", scope: "all" },
    { key: "invoices", entity: "invoices", scope: "all" },
    { key: "invoiceLineItems", entity: "invoice_line_items", scope: "all" },
    { key: "trucks", entity: "trucks", scope: "all" },
    { key: "qcUpdates", entity: "qc_update_records", scope: "all" },
    { key: "complaints", entity: "quality_complaints", scope: "all" },
    { key: "materials", entity: "materials", scope: "all" },
    { key: "materialIssueReelLines", entity: "material_issue_reel_lines", scope: "all" },
    { key: "materialReturnReelLines", entity: "material_return_reel_lines", scope: "all" }
  ],
  compute: (lists, params, helpers) => buildTraceabilityRecordById({ ...lists, items: (helpers.npdItems || []).map(normalizeNpdItem) }, String(params.productionId || ""))
};
function runReport(name, lists, params, helpers) {
  const definition = REPORT_DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown report ${name}`);
  return definition.compute(lists, params, helpers);
}
export {
  REPORT_DEFINITIONS,
  runReport
};
