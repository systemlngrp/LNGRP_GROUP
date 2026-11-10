import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import type { Company, DispatchPlan, Firm, LoadingSlip, Order, Truck } from "../types";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { upsertFgLinkedChildSlip } from "../lib/linkedLoadingSlipSync";
import { buildPhpPlateStockAlertMessage, getPhpPlateStockShortages } from "../lib/phpPlateStockValidation";
import { DirectLoadingSlipModal } from "../components/DirectLoadingSlipModal";

// Direct Loading Slip as its own form page (moved out of Loading Master).
// Saving works exactly as the Loading Master button did.
export function DirectLoadingSlip() {
  const navigate = useNavigate();
  const [loadingSlips, setLoadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [trucks] = useData<Truck>("trucks", []);
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const [phpJobs] = useData<any>("php_job_master", []);
  const [plateJobs] = useData<any>("plate_job_master", []);
  const [phpItemMaster] = useData<any>("php_item_master", []);
  const [plateItemMaster] = useData<any>("plate_item_master", []);
  const [phpLoadingSlips, setPhpLoadingSlips] = useData<LoadingSlip>("php_loading_slips", []);
  const [plateLoadingSlips, setPlateLoadingSlips] = useData<LoadingSlip>("plate_loading_slips", []);
  const { resolveOrderItem, itemsBySource, allItems } = useOrderItemCatalog();
  const [formKey, setFormKey] = useState(0);

  const saveDirectSlip = async ({ slip, phpDetails, plateDetails }: { slip: LoadingSlip; phpDetails: LoadingSlip["phpDetails"]; plateDetails: LoadingSlip["plateDetails"] }) => {
    try {
      const timestamp = new Date().toISOString();
      const newSlip: LoadingSlip = {
        ...slip,
        id: crypto.randomUUID(),
        slipNo: "",
        loadingSource: "DIRECT",
        phpDetails,
        plateDetails,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      const shortages = getPhpPlateStockShortages({
        phpDetails: phpDetails || [],
        plateDetails: plateDetails || [],
        phpMasterRows: phpItemMaster,
        plateMasterRows: plateItemMaster,
        phpJobs,
        plateJobs,
        fgLoadingSlips: loadingSlips,
        phpLoadingSlips,
        plateLoadingSlips,
        parentFgLoadingId: newSlip.id,
      });
      if (shortages.length > 0) {
        alert(buildPhpPlateStockAlertMessage(shortages));
        return false;
      }
      const loadingSaveResult = await setLoadingSlips((prev) => [newSlip, ...prev]);
      await setPhpLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: newSlip, details: phpDetails || [], source: "PHP" }));
      await setPlateLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: newSlip, details: plateDetails || [], source: "PLATE" }));
      const whatsapp = (loadingSaveResult as any)?.whatsapp;
      if (whatsapp?.status === "Sent") alert("Loading Slip saved and WhatsApp message sent.");
      else if (whatsapp?.status === "Not Configured") alert("Loading Slip saved, but no active Loading Slip WhatsApp configuration was found.");
      else if (whatsapp?.status === "Failed") alert("Loading Slip saved, but WhatsApp PDF could not be sent. It will retry automatically.");
      else alert("Direct loading slip created successfully.");
      setFormKey((key) => key + 1);
      return true;
    } catch (error) {
      console.error("Failed to save direct loading slip:", error);
      alert("Failed to save direct loading slip.");
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">Direct Loading Slip</h2>
      <DirectLoadingSlipModal
        key={formKey}
        open
        variant="page"
        companies={companies}
        firms={firms}
        trucks={trucks}
        allItems={allItems}
        plans={plans}
        orders={orders}
        phpItems={itemsBySource.PHP || []}
        plateItems={itemsBySource.PLATE || []}
        resolveOrderItem={resolveOrderItem}
        onClose={() => navigate("/loading/master")}
        onSave={saveDirectSlip}
      />
    </div>
  );
}
