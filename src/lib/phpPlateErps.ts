// The two ERP codes of a PHP / Plate job or item, shown side by side:
// main ERP = the FG box (master) ERP, PHP/Plate ERP = the PHP or Plate item's own ERP.

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

type JobLike = { masterErp?: unknown; erpCode?: unknown } | null | undefined;
type ItemLike = { erp?: unknown; raw?: any } | null | undefined;

export function getPhpPlateMainErp(job: JobLike, item?: ItemLike, fallback?: unknown) {
  return firstText(job?.masterErp, item?.raw?.masterItemNameErpCode, fallback);
}

export function getPhpPlateItemErp(job: JobLike, item?: ItemLike) {
  return firstText(job?.erpCode, item?.raw?.erpItemCode, item?.erp);
}
