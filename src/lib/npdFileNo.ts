type FileNoRecord = {
  npdId?: unknown;
  erpNo?: unknown;
  fileNo?: unknown;
  updatedAt?: unknown;
  timestamp?: unknown;
  orderDate?: unknown;
  updateTimestamp?: unknown;
  updateDate?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();

function latestWithFileNo(records: FileNoRecord[]) {
  return [...records].filter((record) => text(record.fileNo)).sort((a, b) => {
    const aDate = text(a.updatedAt || a.updateTimestamp || a.timestamp || a.orderDate || a.updateDate);
    const bDate = text(b.updatedAt || b.updateTimestamp || b.timestamp || b.orderDate || b.updateDate);
    return bDate.localeCompare(aDate);
  })[0];
}

export function resolveNpdFileNo(npdRow: { id?: unknown; erp?: unknown }, qcUpdates: FileNoRecord[]) {
  const npdId = text(npdRow.id);
  const erp = text(npdRow.erp).toLowerCase();
  const matching = qcUpdates.filter((record) =>
    (npdId && text(record.npdId) === npdId) ||
    (erp && text(record.erpNo).toLowerCase() === erp)
  );
  return text(latestWithFileNo(matching)?.fileNo) || text(npdRow.erp);
}
