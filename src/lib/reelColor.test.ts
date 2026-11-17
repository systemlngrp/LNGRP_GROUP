import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReelColor } from "./reelColor";

const master = ["LG", "NS", "WKL"];

test("LG = LG, GY, Yellow, Gold", () => {
  for (const value of ["LG", "GY", "Yellow", "Gold", "KRAFT 120 GSM BF 18 GY"]) assert.equal(resolveReelColor(value, master), "LG", value);
});

test("NS = NS, Natural, VK, Brown", () => {
  for (const value of ["NS", "Natural", "VK", "Brown", "Size 178 / GSM 140 / BF 18 NATURAL"]) assert.equal(resolveReelColor(value, master), "NS", value);
});

test("WKL = WKL, Duplex, White Kraft Liner", () => {
  for (const value of ["WKL", "Duplex", "duplex board", "White Kraft Liner", "WHITE KRAFT LINER 140 GSM"]) assert.equal(resolveReelColor(value, master), "WKL", value);
});

test("only Color Master colours count", () => {
  assert.equal(resolveReelColor("Duplex", ["LG", "NS"]), "");
  assert.equal(resolveReelColor("Gold", ["NS"]), "");
  assert.equal(resolveReelColor("white kraft", master), "");
  assert.equal(resolveReelColor("kraft liner", master), "");
  assert.equal(resolveReelColor("", master), "");
  assert.equal(resolveReelColor("NSK-11", master), "");
});
