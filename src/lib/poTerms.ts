// PO Terms: terms & conditions per Material Group (table po_terms, id = material group id).

export interface PoTerms {
  id: string;
  materialGroupId: string;
  materialGroupName?: string;
  terms?: string | null;
  updatedBy?: string;
  updateTimestamp?: string;
}

type LineLike = { materialId?: string | null };
type MaterialLike = { id: string; materialGroupId?: string | null };

/**
 * Terms for a PO: those of the material group of its first item that has a material group
 * (service lines have none). Blank when that group has no terms.
 */
export function poTermsForOrder(lines: LineLike[], materials: Map<string, MaterialLike> | MaterialLike[], terms: PoTerms[]) {
  const materialById = materials instanceof Map ? materials : new Map(materials.map((material) => [material.id, material]));
  const groupId = lines
    .map((line) => String(materialById.get(String(line.materialId || ""))?.materialGroupId || "").trim())
    .find(Boolean);
  if (!groupId) return { groupId: "", groupName: "", text: "" };
  const record = terms.find((value) => String(value.materialGroupId || value.id) === groupId);
  return { groupId, groupName: String(record?.materialGroupName || ""), text: String(record?.terms || "").trim() };
}
