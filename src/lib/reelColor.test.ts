import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReelColor } from "./reelColor";

const master = ["LG", "NS"];

test("LG = GY = Yellow = VK (Gold = GY), NS = Natural = Brown", () => {
  for (const value of ["LG", "GY", "Yellow", "VK", "Gold", "KRAFT 120 GSM BF 18 GY"]) assert.equal(resolveReelColor(value, master), "LG", value);
  for (const value of ["NS", "Natural", "Brown", "Size 178 / GSM 140 / BF 18 NATURAL"]) assert.equal(resolveReelColor(value, master), "NS", value);
});

test("only Color Master colours count", () => {
  assert.equal(resolveReelColor("Gold", ["NS"]), "");
  assert.equal(resolveReelColor("white kraft", master), "");
  assert.equal(resolveReelColor("", master), "");
  assert.equal(resolveReelColor("NSK-11", master), "");
});
