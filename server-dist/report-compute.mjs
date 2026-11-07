// src/lib/orderItems.ts
function normalizeOrderItemSource(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PHP") return "PHP";
  if (normalized === "PLATE") return "PLATE";
  if (normalized === "MATERIAL") return "MATERIAL";
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
        getLookupKeys(source, item).forEach((key2) => {
          if (!map.has(key2)) {
            map.set(key2, item);
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
function getNextNumber(values, configuredStart) {
  const start = normalizeStartNumber(configuredStart);
  const highest = values.reduce((max, value) => Math.max(max, extractNumericSequence(value)), 0);
  return Math.max(start, highest + 1);
}
function formatOurReelNo(value) {
  return String(Math.max(1, Math.floor(Number(value) || 1))).padStart(5, "0");
}

// src/lib/materialMovement.ts
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

// src/lib/reelStock.ts
function round2(value) {
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
    const key2 = String(line.packingSlipId || "");
    if (!key2) return;
    const rows = issueLinesByPackingSlipId.get(key2) || [];
    rows.push(line);
    issueLinesByPackingSlipId.set(key2, rows);
  });
  const returnLinesByPackingSlipId = /* @__PURE__ */ new Map();
  filteredReturnLines.forEach((line) => {
    const key2 = String(line.packingSlipId || "");
    if (!key2) return;
    const rows = returnLinesByPackingSlipId.get(key2) || [];
    rows.push(line);
    returnLinesByPackingSlipId.set(key2, rows);
  });
  const getRelatedLines = (map, keys) => {
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    keys.forEach((key2) => {
      if (seen.has(key2)) return;
      seen.add(key2);
      rows.push(...map.get(key2) || []);
    });
    return rows;
  };
  const firstOpeningReelNo = getNextNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);
  const explicitOpeningMaterialIds = new Set(
    packingSlips.filter(isOpeningReelPackingSlip).map((slip) => slip.materialId)
  );
  const openingRows = materials.filter((material) => isActiveReelMaterial(material) && Number(material.openingQty || 0) > 0 && !explicitOpeningMaterialIds.has(material.id)).map((material, index) => {
    const openingQty = round2(Number(material.openingQty || 0));
    const openingRate = round2(Number(material.openingRate || 0));
    const relatedIssueLines = getRelatedLines(issueLinesByPackingSlipId, [material.id, `opening-${material.id}`]);
    const relatedReturnLines = getRelatedLines(returnLinesByPackingSlipId, [material.id, `opening-${material.id}`]);
    const issuedWeight = round2(relatedIssueLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
    const returnedWeight = round2(relatedReturnLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
    const netIssuedWeight = round2(issuedWeight - returnedWeight);
    const availableWeight = round2(Math.max(0, openingQty + returnedWeight - issuedWeight));
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
      valuation: availableWeight > 0 ? round2(availableWeight * openingRate) : 0,
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
    const reelQty = round2(Number(slip.weightKg || 0));
    const netIssuedWeight = round2(issuedWeight - returnedWeight);
    const availableWeight = round2(Math.max(0, reelQty + returnedWeight - issuedWeight));
    const mrrNo = isOpeningReelPackingSlip(slip) ? "Opening" : receipt?.transactionNo || "";
    const isOpening = isOpeningReelPackingSlip(slip) || isOpeningMrrNo(mrrNo);
    const rate = availableWeight > 0 ? round2(isOpeningReelPackingSlip(slip) ? Number(slip.openingRate || material?.openingRate || 0) : getLineRate(receiptLine, material)) : 0;
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
      issuedWeight: round2(issuedWeight),
      returnedWeight: round2(returnedWeight),
      netIssuedWeight,
      availableWeight,
      mrrQty: isOpening ? 0 : reelQty,
      openingQty: isOpening ? reelQty : 0,
      rate,
      valuation: availableWeight > 0 ? round2(availableWeight * rate) : 0,
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
  const normalized = flute.toUpperCase().trim().replace(/\s+/g, "");
  return takeUpFactorMap[normalized] ?? "";
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
function round22(value) {
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
  return Number.isFinite(rapc) && rapc > 0 ? round22(rapc) : void 0;
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
function round23(value) {
  return Number(Number(value || 0).toFixed(2));
}
function makeKey(rapcRange, gsm) {
  return `${rapcRange}__${gsm}`;
}
function parseKey(key2) {
  const [rapcRangeRaw, gsmRaw] = key2.split("__");
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
  const key2 = makeKey(row.rapcRange, row.gsm);
  map.set(key2, (map.get(key2) || 0) + qty);
}
function firstPositiveNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}
function getRawValue(item, key2) {
  return item?.raw?.[key2] ?? item?.[key2];
}
function getItemNumber(item, ...keys) {
  return firstPositiveNumber(...keys.map((key2) => getRawValue(item, key2)));
}
function getItemText(item, ...keys) {
  for (const key2 of keys) {
    const value = String(getRawValue(item, key2) ?? "").trim();
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
  return Array.from(allKeys).map((key2) => {
    const { rapcRange, gsm } = parseKey(key2);
    const totalPaperRequirement = round23(requirementByKey.get(key2) || 0);
    const totalClosingStock = round23(stockByKey.get(key2) || 0);
    const totalPendingPo = round23(pendingPoByKey.get(key2) || 0);
    const consumption = round23(Math.max(0, consumptionByKey.get(key2) || 0));
    const mil = round23(consumption * 7 / 90);
    const calculatedNetPaperToOrder = totalClosingStock > mil ? round23(totalPaperRequirement - totalClosingStock - totalPendingPo) : round23(mil - totalClosingStock + (totalPaperRequirement - totalClosingStock - totalPendingPo));
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
  for (const [key2, entry] of completedLoads) {
    if (realtimeChangeAffects(changed, Array.from(entry.tables), entry.derived)) completedLoads.delete(key2);
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
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return false;
  const truthy = /* @__PURE__ */ new Set(["1", "true", "yes", "y", "on"]);
  return truthy.has(normalized);
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

// src/lib/reports/serverReports.ts
function catalogFrom(helpers) {
  const rows = helpers.catalogRows || { fgRows: [], phpRows: [], plateRows: [], materialRows: [] };
  return createOrderItemCatalog(rows);
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
function runReport(name, lists, params, helpers) {
  const definition = REPORT_DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown report ${name}`);
  return definition.compute(lists, params, helpers);
}
export {
  REPORT_DEFINITIONS,
  runReport
};
