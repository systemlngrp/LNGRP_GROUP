import { SheetMasterPage } from "./SheetMasterPage";
import { PLATE_ITEM_MASTER_COLUMNS } from "../lib/sheetMasterConfigs";
import { useData } from "../hooks/useData";
import { buildFirmWisePhpPlateInventoryRows } from "../lib/phpPlateInventory";
import type { Firm, LoadingSlip, Production } from "../types";

const HIDDEN_PLATE_ITEM_MASTER_COLUMNS = new Set(["syncInItemMaster", "hostingerSync"]);

export function PlateItemMaster() {
  const [rows] = useData<any>("plate_item_master", []);
  const [jobs] = useData<Production>("plate_job_master", []);
  const [standaloneLoadingSlips] = useData<LoadingSlip>("plate_loading_slips", []);
  const [commonLoadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [firms] = useData<Firm>("firms", []);
  const firmColumns = firms.flatMap((firm) => [{ key: `firm_${firm.id}_production`, label: `${firm.firmName} Production` }, { key: `firm_${firm.id}_invoiced`, label: `${firm.firmName} Invoiced` }, { key: `firm_${firm.id}_balance`, label: `${firm.firmName} Balance` }]);
  const firmRows = buildFirmWisePhpPlateInventoryRows(rows, jobs, [...standaloneLoadingSlips, ...commonLoadingSlips], firms, "PLATE").map((row) => Object.fromEntries([...Object.entries(row), ...firms.flatMap((firm) => { const stock = row.firmStocks?.[firm.id] || {}; return [[`firm_${firm.id}_production`, stock.production], [`firm_${firm.id}_invoiced`, stock.invoiced], [`firm_${firm.id}_balance`, stock.balance]]; })]));

  return (
    <SheetMasterPage
      title="Plate Item Master"
      entity="plate_item_master"
      columns={[...PLATE_ITEM_MASTER_COLUMNS.filter((column) => !HIDDEN_PLATE_ITEM_MASTER_COLUMNS.has(column.key)), ...firmColumns]}
      editableColumns={["openingQty"]}
      rowsOverride={firmRows as any}
      filters={[
        { key: "company", label: "Company", searchable: true },
        { key: "itemName", label: "Item", searchable: true, optionLabelKeys: ["itemName", "erpItemCode"], optionSearchKeys: ["masterItemNameErpCode"] },
      ]}
      searchPlaceholder="Search plate item master..."
    />
  );
}
