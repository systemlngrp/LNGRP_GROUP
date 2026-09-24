import { calculateTakeUpFactor } from "./utils";

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function calculateProductionTakeUpFactor(flute: unknown): number {
  const factor = calculateTakeUpFactor(String(flute ?? ""));
  return factor === "" ? 0 : factor;
}

export function calculateProductionGsm(input: {
  flute?: unknown;
  l1?: unknown;
  f1?: unknown;
  l2?: unknown;
  f2?: unknown;
  l3?: unknown;
}): number {
  const factor = calculateProductionTakeUpFactor(input.flute);
  return numberValue(input.l1)
    + numberValue(input.f1) * factor
    + numberValue(input.l2)
    + numberValue(input.f2) * factor
    + numberValue(input.l3);
}

export function calculateProductionReel(input: {
  breadth?: unknown;
  height?: unknown;
  ups?: unknown;
  idToOd?: unknown;
}): number {
  const breadth = numberValue(input.breadth);
  const height = numberValue(input.height);
  const ups = numberValue(input.ups);
  const idToOd = numberValue(input.idToOd);
  return breadth === 0
    ? height * ups
    : (breadth + height) * ups + (idToOd * ups + 16);
}
