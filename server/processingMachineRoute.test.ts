import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCurrentRequiredMachine, getProcessingMachineRoute } from "./processingMachineRoute.js";

const normalize = (name: string) => name.trim();
const mapping = { RSC: ["Corrugation Liner", "Pasting", "Printing", "Stitching"] };

describe("production processing machine route", () => {
  it("uses the PHP master methodology for an older linked FG row", () => {
    const route = getProcessingMachineRoute({
      itemSource: "FG", boxType: "RSC", methodology: "RSC",
      phpScheduledJobId: "php-1", phpMasterMethodology: " corrugation ",
    }, mapping, normalize);
    assert.deepEqual(route.requiredMachines, ["Corrugation Liner", "Printing"]);
    assert.equal(getCurrentRequiredMachine(route.requiredMachines, [], normalize), "Corrugation Liner");
    assert.equal(getCurrentRequiredMachine(route.requiredMachines, [
      { machineName: "Corrugation Liner", completionStatus: "Part" },
    ], normalize), "Corrugation Liner");
    assert.equal(getCurrentRequiredMachine(route.requiredMachines, [
      { machineName: "Corrugation Liner", completionStatus: "Full" },
    ], normalize), "Printing");
    assert.equal(getCurrentRequiredMachine(route.requiredMachines, [
      { machineName: "Corrugation Liner", completionStatus: "Full" },
      { machineName: "Printing", completionStatus: "Full" },
    ], normalize), "");
  });

  it("uses the same Corrugation route for linked Plate jobs", () => {
    const route = getProcessingMachineRoute({
      itemSource: "FG", boxType: "RSC", plateScheduledJobId: "plate-1",
      plateMasterMethodology: "Corrugation",
    }, mapping, normalize);
    assert.deepEqual(route.requiredMachines, ["Corrugation Liner", "Printing"]);
    assert.equal(route.requiredMachines.includes("Pasting"), false);
  });

  it("preserves other PHP methodologies and the regular RSC route", () => {
    assert.deepEqual(getProcessingMachineRoute({ itemSource: "PHP", methodology: "Scrap" }, mapping, normalize).requiredMachines, ["Corrugation Liner"]);
    assert.deepEqual(getProcessingMachineRoute({ itemSource: "FG", boxType: "RSC" }, mapping, normalize).requiredMachines, mapping.RSC);
  });
});
