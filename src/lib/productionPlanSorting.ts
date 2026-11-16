import { Production } from "../types";

type ProductionPlanSortRow = Production & {
  productionPlanCompanyName?: string;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function getCompanyName(row: ProductionPlanSortRow) {
  return normalizeText(row.productionPlanCompanyName || row.companyName);
}

function getFluteBatch(row: ProductionPlanSortRow) {
  return normalizeText(row.fluteBatches);
}

// Batch numbers sort numerically (1, 2, ... 10); blank batches go last.
function compareFluteBatch(a: string, b: string) {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1;
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function getReel(row: ProductionPlanSortRow) {
  return toNumber(row.reelActualWithTrimming);
}

function sortByCompanyThenReelDesc(a: ProductionPlanSortRow, b: ProductionPlanSortRow) {
  return (
    getCompanyName(a).localeCompare(getCompanyName(b), undefined, { sensitivity: "base" }) ||
    getReel(b) - getReel(a)
  );
}

function sortByReelDesc(a: ProductionPlanSortRow, b: ProductionPlanSortRow) {
  return getReel(b) - getReel(a);
}

function mergeSmallRowsNearClosestReel(bigRows: ProductionPlanSortRow[], smallRows: ProductionPlanSortRow[]) {
  const merged = [...bigRows];
  if (merged.length === 0) return [...smallRows];

  smallRows.forEach((smallRow) => {
    const smallReel = getReel(smallRow);
    let closestBigRow = bigRows[0];
    let closestDifference = Number.POSITIVE_INFINITY;

    bigRows.forEach((row) => {
      const difference = Math.abs(getReel(row) - smallReel);
      if (difference < closestDifference) {
        closestDifference = difference;
        closestBigRow = row;
      }
    });

    const matchedIndex = merged.indexOf(closestBigRow);
    const insertAfter = smallReel <= getReel(closestBigRow);
    merged.splice(Math.max(0, matchedIndex + (insertAfter ? 1 : 0)), 0, smallRow);
  });

  return merged;
}

function groupMergedRowsByCompany(rows: ProductionPlanSortRow[]) {
  const grouped = new Map<string, ProductionPlanSortRow[]>();
  rows.forEach((row) => {
    const companyName = getCompanyName(row);
    const key = companyName.toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  return Array.from(grouped.values())
    .sort((a, b) => {
      const maxA = Math.max(...a.map(getReel));
      const maxB = Math.max(...b.map(getReel));
      return maxB - maxA || getCompanyName(a[0]).localeCompare(getCompanyName(b[0]), undefined, { sensitivity: "base" });
    })
    .flat();
}

export function sortProductionPlanRows<T extends ProductionPlanSortRow>(rows: T[]): T[] {
  const groupedByFlute = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = getFluteBatch(row).toLowerCase();
    groupedByFlute.set(key, [...(groupedByFlute.get(key) || []), row]);
  });

  return Array.from(groupedByFlute.values())
    .sort((a, b) => compareFluteBatch(getFluteBatch(a[0]), getFluteBatch(b[0])))
    .flatMap((batchRows) => {
      const bigRows = batchRows
        .filter((row) => toNumber(row.plannedProductionInMeter) > 200)
        .sort(sortByCompanyThenReelDesc);
      const smallRows = batchRows
        .filter((row) => toNumber(row.plannedProductionInMeter) <= 200)
        .sort(sortByReelDesc);
      const mergedRows = mergeSmallRowsNearClosestReel(bigRows, smallRows);
      return groupMergedRowsByCompany(mergedRows);
    }) as T[];
}
