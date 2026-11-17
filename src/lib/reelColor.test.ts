import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReelColor } from "./reelColor";

const master = ["LG", "NS", "Duplex"];

test("LG = LG, GY, Yellow, Gold; NS = NS, Natural, VK, Brown; Duplex = Duplex", () => {
  for (const value of ["LG", "GY", "Yellow", "Gold", "KRAFT 120 GSM BF 18 GY"]) assert.equal(resolveReelColor(value, master), "LG", value);
  for (const value of ["NS", "Natural", "VK", "Brown", "Size 178 / GSM 140 / BF 18 NATURAL"]) assert.equal(resolveReelColor(value, master), "NS", value);
});

test("only Color Master colours count", () => {
  for (const value of ["Duplex", "DUPLEX", "Kraft 140 GSM Duplex"]) assert.equal(resolveReelColor(value, master), "Duplex", value);
});

test("Duplex needs to be in Color Master", () => {
  assert.equal(resolveReelColor("Duplex", ["LG", "NS"]), "");
  assert.equal(resolveReelColor("Gold", ["NS"]), "");
  assert.equal(resolveReelColor("white kraft", master), "");
  assert.equal(resolveReelColor("", master), "");
  assert.equal(resolveReelColor("NSK-11", master), "");
});
