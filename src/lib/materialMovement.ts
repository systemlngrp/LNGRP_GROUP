import {
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
} from "../types";
import { formatOurReelNo, getNextNumber } from "./materialNumbering";

export function round2(value: number) {
  return Number((Number(value) || 0).toFixed(2));
}

export const REEL_BALANCE_TOLERANCE_KG = 0.004;
export const OPENING_REEL_MATERIAL_IN_ID = "OPENING";

function normalizeReference(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function reelBalanceKey(productionId: string, line: Pick<MaterialIssueReelLine, "packingSlipId" | "ourReelNo">) {
  const reelIdentity = String(line.packingSlipId || line.ourReelNo || "").trim();
  return productionId && reelIdentity ? `${productionId}::${reelIdentity}` : "";
}

export function isOpeningReelPackingSlip(slip: Pick<MaterialInPackingSlip, "materialInId">) {
  return String(slip.materialInId || "").trim() === OPENING_REEL_MATERIAL_IN_ID;
}

function buildProductionResolver(productions: Pick<Production, "id" | "transactionNo" | "jobCardNo">[] = []) {
  const productionIds = new Set(productions.map((production) => String(production.id || "").trim()).filter(Boolean));
  const productionIdByJobNo = new Map<string, string>();

  productions.forEach((production) => {
    const id = String(production.id || "").trim();
    if (!id) return;
    [production.transactionNo, production.jobCardNo].forEach((jobNo) => {
      const normalizedJobNo = normalizeReference(jobNo);
      if (normalizedJobNo) productionIdByJobNo.set(normalizedJobNo, id);
    });
  });

  return (line: Pick<MaterialIssueReelLine, "productionId" | "jobNo">) => {
    const directId = String(line.productionId || "").trim();
    if (directId && (productionIds.size === 0 || productionIds.has(directId))) return directId;
    return productionIdByJobNo.get(normalizeReference(line.jobNo)) || directId;
  };
}

export function calculateMaterialIssueAmount(qty: number, rate: number) {
  return round2(round2(qty) * round2(rate));
}

function getMaterialInLineRate(line: MaterialIn["lines"][number]) {
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

export function resolveMaterialIssueRate(
  materialId: string,
  materials: Pick<Material, "id" | "openingRate">[],
  materialIn: MaterialIn[],
  qty: number,
  options?: { useLatestRateAsOpeningRate?: boolean }
) {
  const material = materials.find((entry) => entry.id === materialId);
  const openingRate = round2(Number(material?.openingRate || 0));
  const latestPurchaseLine = materialIn
    .flatMap((entry) =>
      entry.lines
        .filter((line) => line.itemId === materialId)
        .map((line) => ({
          line,
          time: new Date(entry.timestamp || entry.date || 0).getTime() || 0,
        }))
    )
    .sort((a, b) => b.time - a.time)[0]?.line;
  const lastPurchaseRate = latestPurchaseLine ? round2(getMaterialInLineRate(latestPurchaseLine)) : 0;
  const effectiveOpeningRate = options?.useLatestRateAsOpeningRate && lastPurchaseRate > 0 ? lastPurchaseRate : openingRate;
  const rate = lastPurchaseRate > 0 ? lastPurchaseRate : openingRate;
  const effectiveRate = options?.useLatestRateAsOpeningRate ? effectiveOpeningRate : rate;
  return {
    lastPurchaseRate,
    openingRate: effectiveOpeningRate,
    rate: effectiveRate,
    amount: calculateMaterialIssueAmount(qty, effectiveRate),
  };
}

function buildSlipNetIssuedWeights(
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[]
) {
  const weights = new Map<string, number>();
  issueReelLines.forEach((line) => {
    const key = line.packingSlipId;
    weights.set(key, (weights.get(key) || 0) + Number(line.weightKg || 0));
  });
  returnReelLines.forEach((line) => {
    const key = line.packingSlipId;
    weights.set(key, (weights.get(key) || 0) - Number(line.weightKg || 0));
  });
  return weights;
}

function buildReturnedReelKeys(
  returnReelLines: MaterialReturnReelLine[],
  resolveProductionId: (line: Pick<MaterialIssueReelLine, "productionId" | "jobNo">) => string
) {
  const keys = new Set<string>();
  returnReelLines.forEach((line) => {
    const key = reelBalanceKey(resolveProductionId(line), line);
    if (key) keys.add(key);
  });
  return keys;
}

export function buildOpeningReelPackingSlips(
  materials: Pick<Material, "id" | "type" | "openingQty">[],
  packingSlips: MaterialInPackingSlip[],
  ourReelNoStartNumber: unknown = 1
) {
  const persistedIds = new Set(packingSlips.map((slip) => slip.id));
  const explicitOpeningMaterialIds = new Set(
    packingSlips
      .filter(isOpeningReelPackingSlip)
      .map((slip) => slip.materialId)
  );
  const firstOpeningReelNo = getNextNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);

  return materials
    .filter(
      (material) =>
        String(material.type || "").trim().toLowerCase() === "reel" &&
        Number(material.openingQty || 0) > 0 &&
        !persistedIds.has(material.id) &&
        !explicitOpeningMaterialIds.has(material.id)
    )
    .map<MaterialInPackingSlip>((material, index) => ({
      // Opening stock has no MRR packing slip. Use the material UUID as a stable,
      // VARCHAR(36)-safe reel identity so issue/return rows can track its balance.
      id: material.id,
      materialInId: "",
      materialLineId: material.id,
      materialId: material.id,
      supplierReelNo: "OPENING",
      ourReelNo: formatOurReelNo(firstOpeningReelNo + index),
      weightKg: round2(Number(material.openingQty || 0)),
    }));
}
export function getNonReelAvailableQty(
  materialId: string,
  materialIn: MaterialIn[],
  issueLines: MaterialIssueLine[],
  returnLines: MaterialReturnLine[]
) {
  const received = materialIn.reduce(
    (sum, entry) =>
      sum +
      entry.lines
        .filter((line) => line.itemId === materialId)
        .reduce((lineSum, line) => lineSum + Number(line.qty || 0), 0),
    0
  );
  const issued = issueLines
    .filter((line) => line.materialId === materialId)
    .reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const returned = returnLines
    .filter((line) => line.materialId === materialId)
    .reduce((sum, line) => sum + Number(line.qty || 0), 0);

  return Math.max(0, received - issued + returned);
}

export function getAvailableReelPackingSlips(
  materialId: string,
  packingSlips: MaterialInPackingSlip[],
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[],
  materials: Pick<Material, "id" | "type" | "openingQty">[] = [],
  ourReelNoStartNumber: unknown = 1
) {
  const netIssuedBySlip = buildSlipNetIssuedWeights(issueReelLines, returnReelLines);
  const allSlips = [...packingSlips, ...buildOpeningReelPackingSlips(materials, packingSlips, ourReelNoStartNumber)];
  return allSlips.flatMap((slip) => {
    if (slip.materialId !== materialId) return [];
    const baseWeight = Number(slip.weightKg || 0);
    if (baseWeight <= 0) return [];
    const availableWeight = Number((baseWeight - (netIssuedBySlip.get(slip.id) || 0)).toFixed(2));
    if (availableWeight <= 0) return [];
    return [{ ...slip, weightKg: availableWeight }];
  });
}

export function getReturnableReelLinesForJob(
  materialId: string,
  productionId: string,
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[]
) {
  const returnedReelKeys = buildReturnedReelKeys(returnReelLines, (line) => String(line.productionId || "").trim());
  const latestIssueLineBySlip = new Map<string, MaterialIssueReelLine>();

  issueReelLines.forEach((line) => {
    if (line.materialId !== materialId) return;
    if (line.productionId !== productionId) return;
    const key = reelBalanceKey(productionId, line);
    if (!key || returnedReelKeys.has(key)) return;
    latestIssueLineBySlip.set(key, line);
  });

  return Array.from(latestIssueLineBySlip.values()).flatMap((line) => {
    const issuedWeight = round2(Number(line.weightKg || 0));
    if (issuedWeight <= REEL_BALANCE_TOLERANCE_KG) return [];
    return [{ ...line, weightKg: issuedWeight }];
  });
}

export function getAllReturnableReelLines(
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[],
  productions: Pick<Production, "id" | "transactionNo" | "jobCardNo">[] = []
) {
  const resolveProductionId = buildProductionResolver(productions);
  const returnedReelKeys = buildReturnedReelKeys(returnReelLines, resolveProductionId);

  const latestIssueLineByJobAndSlip = new Map<string, MaterialIssueReelLine>();

  issueReelLines.forEach((line) => {
    const productionId = resolveProductionId(line);
    const key = reelBalanceKey(productionId, line);
    if (!key || returnedReelKeys.has(key)) return;
    latestIssueLineByJobAndSlip.set(key, { ...line, productionId });
  });

  return Array.from(latestIssueLineByJobAndSlip.values()).flatMap((line) => {
    const issuedWeight = round2(Number(line.weightKg || 0));
    return issuedWeight > REEL_BALANCE_TOLERANCE_KG ? [{ ...line, weightKg: issuedWeight }] : [];
  });
}
