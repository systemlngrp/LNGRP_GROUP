export const MATERIAL_IN_SUB_TYPES = ["Other RM", "Spare parts", "Others"] as const;

export type MaterialInSubType = (typeof MATERIAL_IN_SUB_TYPES)[number];

export const MATERIAL_IN_SUB_TYPE_LEDGER: Record<MaterialInSubType, string> = {
  "Other RM": "PURCHASE - OTHER RM",
  "Spare parts": "PURCHASE - SPARE PARTS",
  Others: "PURCHASE - OTHERS",
};

export function normalizeMaterialInSubType(value: unknown): string {
  return String(value ?? "").trim();
}

export function isValidMaterialInSubType(value: unknown): value is MaterialInSubType {
  return MATERIAL_IN_SUB_TYPES.includes(normalizeMaterialInSubType(value) as MaterialInSubType);
}

export function getMaterialInSubTypeLedger(value: unknown): string {
  const normalized = normalizeMaterialInSubType(value) as MaterialInSubType;
  return MATERIAL_IN_SUB_TYPE_LEDGER[normalized] || MATERIAL_IN_SUB_TYPE_LEDGER["Other RM"];
}
