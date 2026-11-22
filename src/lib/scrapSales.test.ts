import { test } from "node:test";
import assert from "node:assert/strict";
import { isFirmOne, isMeghaTrading, isScrapItem, isCorrugatedScrap } from "./scrapSales";

test("scrap sale helpers", () => {
  assert.ok(isMeghaTrading("M/S MEGHA TRADING"));
  assert.ok(isFirmOne({ firmName: "Laxmi Narayan Corrugated Boards LLP Unit-I" }));
  assert.ok(!isFirmOne({ firmName: "Laxmi Narayan Corrugated Boards LLP Unit-II" }));
  assert.ok(isScrapItem({ erp: "99010004", name: "x" }));
  assert.ok(isCorrugatedScrap("CORRUGATED WASTAGE SCRAP"));
  assert.ok(!isCorrugatedScrap("WASTAGE SCRAP CORE PIPE"));
});
