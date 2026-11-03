import { useMemo } from "react";
import { useData } from "./useData";
import { Material } from "../types";
import { createOrderItemCatalog } from "../lib/orderItemCatalog";

export function useOrderItemCatalog(options?: { includeMaterials?: boolean; enabled?: boolean }) {
  const includeMaterials = options?.includeMaterials !== false;
  const enabled = options?.enabled !== false;
  const [fgRows, , fgLoading] = useData<any>("npd", [], {
    cacheToLocalStorage: false,
    endpointOverride: "/api/npd/catalog?status=all",
    storageKey: "npd_order_catalog",
    syncEventKey: "sync-data-npd",
    enabled,
  });
  const [phpRows, , phpLoading] = useData<any>("php_item_master", [], { firmScope: "all", enabled });
  const [plateRows, , plateLoading] = useData<any>("plate_item_master", [], { firmScope: "all", enabled });
  const [materialRows, , materialLoading] = useData<Material>("materials", [], { firmScope: "all", enabled: enabled && includeMaterials });

  const catalog = useMemo(
    () => createOrderItemCatalog({ fgRows, phpRows, plateRows, materialRows }),
    [fgRows, phpRows, plateRows, materialRows]
  );

  return {
    loading: fgLoading || phpLoading || plateLoading || (includeMaterials && materialLoading),
    fgRows,
    phpRows,
    plateRows,
    materialRows,
    ...catalog,
  };
}
