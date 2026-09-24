import { calculateProductionReel } from "./productionCalculations";

export function calculateInternalUps(rapcForSingleBox: unknown) {
  const rapcValue = Number(rapcForSingleBox);
  if (!Number.isFinite(rapcValue) || rapcValue <= 0) return undefined;
  return Math.floor(1320 / rapcValue);
}

type ProductionRapcInput = {
  breadth?: unknown;
  height?: unknown;
  ply?: unknown;
  ups?: unknown;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function positiveNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

export function calculateProductionRapc(input: ProductionRapcInput) {
  const breadth = positiveNumber(input.breadth);
  const height = positiveNumber(input.height);
  const ups = positiveNumber(input.ups);
  if (ups <= 0) return undefined;

  const ply = Number(input.ply || 0);
  const idToOd = ply === 3 ? 6 : ply === 5 ? 10 : 0;
  const rapc = calculateProductionReel({ breadth, height, ups, idToOd });

  return Number.isFinite(rapc) && rapc > 0 ? round2(rapc) : undefined;
}

export function calculateInternalRapc(
  item: ProductionRapcInput & { internalUps?: unknown; rapcForSingleBox?: unknown }
) {
  const savedInternalUps = Number(item.internalUps);
  const internalUps = Number.isFinite(savedInternalUps) && savedInternalUps > 0
    ? savedInternalUps
    : calculateInternalUps(item.rapcForSingleBox);
  return calculateProductionRapc({ ...item, ups: internalUps });
}
