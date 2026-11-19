import { useEffect, useState } from "react";
import type { PhpPlateReceipt } from "../lib/phpPlateInventory";

/** PHP / Plate quantities bought through FG Purchase MRRs, per item and firm. */
export function usePhpPlateReceipts(enabled = true) {
  const [receipts, setReceipts] = useState<PhpPlateReceipt[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const token = localStorage.getItem("authToken") || "";
    fetch("/api/php-plate-receipts", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setReceipts(rows); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled]);
  return receipts;
}
