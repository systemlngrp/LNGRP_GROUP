import { useData } from "./useData";
import { findCapaLinkedDetails } from "../lib/capaReportLinks";
import type { DispatchPlan, Invoice, InvoiceLineItem, LoadingSlip, Production, QualityComplaint, Setting } from "../types";

export function useCapaReportContext() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all" });
  const [slips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all" });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all" });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  return {
    setting: settings[0],
    linkedDetails: (complaint: QualityComplaint) => findCapaLinkedDetails(complaint, productions, plans, slips, invoices, invoiceLines),
  };
}
