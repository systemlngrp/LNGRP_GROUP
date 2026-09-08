import { SheetMasterPage } from "./SheetMasterPage";
import { PHP_ITEM_MASTER_COLUMNS } from "../lib/sheetMasterConfigs";
import { useData } from "../hooks/useData";
import { buildFirmWisePhpPlateInventoryRows, buildPhpPlateInventoryRows } from "../lib/phpPlateInventory";
import type { Firm, LoadingSlip, Production } from "../types";

const HIDDEN_PHP_ITEM_MASTER_COLUMNS = new Set(["hostingerSync", "syncInItemMaster", "planQty"]);

export function PhpItemMaster() {
  const [rows] = useData<any>("php_item_master", []);
  const [jobs] = useData<Production>("php_job_master", []);
  const [standaloneLoadingSlips] = useData<LoadingSlip>("php_loading_slips", []);
  const [commonLoadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [firms] = useData<Firm>("firms", []);
  const firmColumns = firms.flatMap((firm) => [{ key: `firm_${firm.id}_production`, label: `${firm.firmName} Production` }, { key: `firm_${firm.id}_invoiced`, label: `${firm.firmName} Invoiced` }, { key: `firm_${firm.id}_balance`, label: `${firm.firmName} Balance` }]);
  const firmRows = buildFirmWisePhpPlateInventoryRows(rows, jobs, [...standaloneLoadingSlips, ...commonLoadingSlips], firms, "PHP").map((row) => Object.fromEntries([...Object.entries(row), ...firms.flatMap((firm) => { const stock = row.firmStocks?.[firm.id] || {}; return [[`firm_${firm.id}_production`, stock.production], [`firm_${firm.id}_invoiced`, stock.invoiced], [`firm_${firm.id}_balance`, stock.balance]]; })]));

  return (
    <SheetMasterPage
      title="PHP Item Master"
      entity="php_item_master"
      columns={[...PHP_ITEM_MASTER_COLUMNS.filter((column) => !HIDDEN_PHP_ITEM_MASTER_COLUMNS.has(column.key)), ...firmColumns]}
      editableColumns={["openingQty"]}
      rowsOverride={firmRows as any}
      filters={[
        { key: "company", label: "Company", searchable: true },
        { key: "itemName", label: "Item", searchable: true, optionLabelKeys: ["itemName", "erpItemCode"], optionSearchKeys: ["masterItemNameErpCode"] },
      ]}
      searchPlaceholder="Search PHP item master..."
    />
  );
}
