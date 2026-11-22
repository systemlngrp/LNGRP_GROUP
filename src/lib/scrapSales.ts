// Wastage scrap sold to Megha Trading: recorded as Direct Loading Slips in Firm 1 (Unit-I).

const text = (value: unknown) => String(value ?? "").trim();

/** M/S MEGHA TRADING (the scrap buyer). */
export const isMeghaTrading = (name: unknown) => /megha\s*trading/i.test(text(name));

/** Firm 1: "... Unit-I" / "Unit 1" (not Unit-II). */
export const isFirmOne = (firm: { firmName?: unknown; shortName?: unknown } | null | undefined) =>
  /unit\s*[-–]?\s*(?:i|1)(?![iv\d])/i.test(text(firm?.firmName)) || /unit\s*[-–]?\s*(?:i|1)(?![iv\d])/i.test(text(firm?.shortName));

/** Scrap items sold to Megha Trading: CORRUGATED WASTAGE SCRAP (99010001), WASTAGE SCRAP CORE PIPE (99010004). */
export const SCRAP_ERPS = new Set(["99010001", "99010004"]);
export const isScrapItem = (item: { erp?: unknown; name?: unknown } | null | undefined) =>
  SCRAP_ERPS.has(text(item?.erp)) || /scrap/i.test(text(item?.name));

/** Corrugated wastage scrap only (core pipe scrap is not production wastage). */
export const isCorrugatedScrap = (itemName: unknown) => /scrap/i.test(text(itemName)) && !/core\s*pipe/i.test(text(itemName));
