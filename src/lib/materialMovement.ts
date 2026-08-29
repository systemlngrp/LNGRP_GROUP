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

function buildJobReturnableWeights(
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[]
) {
  const weights = new Map<string, number>();
  issueReelLines.forEach((line) => {
    const key = `${line.packingSlipId}::${line.productionId}`;
    weights.set(key, (weights.get(key) || 0) + Number(line.weightKg || 0));
  });
  returnReelLines.forEach((line) => {
    const key = `${line.packingSlipId}::${line.productionId}`;
    weights.set(key, (weights.get(key) || 0) - Number(line.weightKg || 0));
  });
  return weights;
}

export function buildOpeningReelPackingSlips(
  materials: Pick<Material, "id" | "type" | "openingQty">[],
  packingSlips: MaterialInPackingSlip[],
  ourReelNoStartNumber: unknown = 1
) {
  const persistedIds = new Set(packingSlips.map((slip) => slip.id));
  const firstOpeningReelNo = getNextNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);

  return materials
    .filter(
      (material) =>
        String(material.type || "").trim().toLowerCase() === "reel" &&
        Number(material.openingQty || 0) > 0 &&
        !persistedIds.has(material.id)
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
  const returnableWeights = buildJobReturnableWeights(issueReelLines, returnReelLines);
  const latestIssueLineBySlip = new Map<string, MaterialIssueReelLine>();

  issueReelLines.forEach((line) => {
    if (line.materialId !== materialId) return;
    if (line.productionId !== productionId) return;
    latestIssueLineBySlip.set(line.packingSlipId, line);
  });

  return Array.from(latestIssueLineBySlip.values()).flatMap((line) => {
    const key = `${line.packingSlipId}::${line.productionId}`;
    const returnableWeight = Number((returnableWeights.get(key) || 0).toFixed(2));
    if (returnableWeight <= 0) return [];
    return [{ ...line, weightKg: returnableWeight }];
  });
}

export function getAllReturnableReelLines(
  issueReelLines: MaterialIssueReelLine[],
  returnReelLines: MaterialReturnReelLine[],
  productions: Pick<Production, "id" | "transactionNo">[] = []
) {
  const productionIds = new Set(productions.map((production) => String(production.id || "").trim()).filter(Boolean));
  const productionIdByJobNo = new Map(
    productions
      .map((production) => [String(production.transactionNo || "").trim().toLowerCase(), production.id] as const)
      .filter(([jobNo]) => Boolean(jobNo))
  );
  const resolveProductionId = (line: Pick<MaterialIssueReelLine, "productionId" | "jobNo">) => {
    const directId = String(line.productionId || "").trim();
    if (directId && (productionIds.size === 0 || productionIds.has(directId))) return directId;
    return productionIdByJobNo.get(String(line.jobNo || "").trim().toLowerCase()) || directId;
  };

  const returnableWeights = new Map<string, number>();
  issueReelLines.forEach((line) => {
    const productionId = resolveProductionId(line);
    if (!productionId || !line.packingSlipId) return;
    const key = `${productionId}::${line.packingSlipId}`;
    returnableWeights.set(key, (returnableWeights.get(key) || 0) + Number(line.weightKg || 0));
  });
  returnReelLines.forEach((line) => {
    const productionId = resolveProductionId(line);
    if (!productionId || !line.packingSlipId) return;
    const key = `${productionId}::${line.packingSlipId}`;
    returnableWeights.set(key, (returnableWeights.get(key) || 0) - Number(line.weightKg || 0));
  });

  const latestIssueLineByJobAndSlip = new Map<string, MaterialIssueReelLine>();

  issueReelLines.forEach((line) => {
    const productionId = resolveProductionId(line);
    if (!productionId || !line.packingSlipId) return;
    latestIssueLineByJobAndSlip.set(`${productionId}::${line.packingSlipId}`, { ...line, productionId });
  });

  return Array.from(latestIssueLineByJobAndSlip.entries()).flatMap(([key, line]) => {
    const returnableWeight = round2(returnableWeights.get(key) || 0);
    return returnableWeight > 0 ? [{ ...line, weightKg: returnableWeight }] : [];
  });
}
