import type {
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssueReelLine,
  MaterialReturnReelLine,
  Supplier,
} from "../types";
import { formatOurReelNo, getNextNumber } from "./materialNumbering";
import { isOpeningReelPackingSlip } from "./materialMovement";

export type ReelStockCalculationRow = {
  slipId: string;
  materialId: string;
  mrrDate: string;
  mrrNo: string;
  ourReelNo: string;
  erp: string;
  itemName: string;
  supplierName: string;
  gsm: number;
  size: number;
  bf: number;
  issuedWeight: number;
  returnedWeight: number;
  netIssuedWeight: number;
  availableWeight: number;
  mrrQty: number;
  openingQty: number;
  rate: number;
  valuation: number;
  ageDays: number;
  isOpening: boolean;
};

type BuildReelStockRowsArgs = {
  materials: Material[];
  materialIn: MaterialIn[];
  packingSlips: MaterialInPackingSlip[];
  issueReelLines: MaterialIssueReelLine[];
  returnReelLines: MaterialReturnReelLine[];
  suppliers?: Supplier[];
  includeMaterialIn?: (entry: MaterialIn) => boolean;
  includeIssueLine?: (line: MaterialIssueReelLine) => boolean;
  includeReturnLine?: (line: MaterialReturnReelLine) => boolean;
  ourReelNoStartNumber?: number;
};

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function getAgeDays(dateStr?: string) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function getLineRate(line: MaterialIn["lines"][number] | undefined, material?: Material) {
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}

function isOpeningMrrNo(value?: string | number | null) {
  return String(value ?? "").trim() === "1";
}

export function buildReelStockRows({
  materials,
  materialIn,
  packingSlips,
  issueReelLines,
  returnReelLines,
  suppliers = [],
  includeMaterialIn = () => true,
  includeIssueLine = () => true,
  includeReturnLine = () => true,
  ourReelNoStartNumber = 1,
}: BuildReelStockRowsArgs): ReelStockCalculationRow[] {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.filter(includeMaterialIn).map((entry) => [entry.id, entry]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const filteredIssueLines = issueReelLines.filter(includeIssueLine);
  const filteredReturnLines = returnReelLines.filter(includeReturnLine);
  const firstOpeningReelNo = getNextNumber(packingSlips.map((slip) => slip.ourReelNo), ourReelNoStartNumber);

  const explicitOpeningMaterialIds = new Set(
    packingSlips
      .filter(isOpeningReelPackingSlip)
      .map((slip) => slip.materialId)
  );

  const openingRows: ReelStockCalculationRow[] = materials
    .filter((material) => material.type === "Reel" && Number(material.openingQty || 0) > 0 && !explicitOpeningMaterialIds.has(material.id))
    .map((material, index) => {
      const openingQty = round2(Number(material.openingQty || 0));
      const openingRate = round2(Number(material.openingRate || 0));
      const relatedIssueLines = filteredIssueLines.filter(
        (line) => line.packingSlipId === material.id || line.packingSlipId === `opening-${material.id}`
      );
      const relatedReturnLines = filteredReturnLines.filter(
        (line) => line.packingSlipId === material.id || line.packingSlipId === `opening-${material.id}`
      );
      const issuedWeight = round2(relatedIssueLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
      const returnedWeight = round2(relatedReturnLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0));
      const netIssuedWeight = round2(issuedWeight - returnedWeight);
      const availableWeight = round2(Math.max(0, openingQty + returnedWeight - issuedWeight));
      return {
        slipId: material.id,
        materialId: material.id,
        mrrDate: "2026-06-06",
        mrrNo: "1",
        ourReelNo: formatOurReelNo(firstOpeningReelNo + index),
        erp: String(material.erpCode || ""),
        itemName: String(material.name || ""),
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
        isOpening: true,
      };
    });

  const mrrRows = packingSlips
    .filter((slip) => materialInMap.has(slip.materialInId) || isOpeningReelPackingSlip(slip))
    .map((slip) => {
      const material = materialMap.get(slip.materialId);
      const receipt = materialInMap.get(slip.materialInId);
      const supplier = receipt ? supplierMap.get(receipt.supplierId) : undefined;
      const receiptLine =
        receipt?.lines.find((line) => line.id === slip.materialLineId) ||
        receipt?.lines.find((line) => line.itemId === slip.materialId);
      const relatedIssueLines = filteredIssueLines.filter((line) => line.packingSlipId === slip.id);
      const relatedReturnLines = filteredReturnLines.filter((line) => line.packingSlipId === slip.id);
      const issuedWeight = relatedIssueLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0);
      const returnedWeight = relatedReturnLines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0);
      const reelQty = round2(Number(slip.weightKg || 0));
      const netIssuedWeight = round2(issuedWeight - returnedWeight);
      const availableWeight = round2(Math.max(0, reelQty + returnedWeight - issuedWeight));
      const mrrNo = isOpeningReelPackingSlip(slip) ? "1" : receipt?.transactionNo || "";
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
        supplierName: isOpening ? "-" : supplier?.name || "",
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
        isOpening,
      };
    })
    .sort((a, b) => {
      const dateDiff = new Date(b.mrrDate || 0).getTime() - new Date(a.mrrDate || 0).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.ourReelNo.localeCompare(b.ourReelNo);
    });

  return [...openingRows, ...mrrRows];
}
