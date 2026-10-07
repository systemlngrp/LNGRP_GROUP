type FileNoRecord = {
  npdId?: unknown;
  erpNo?: unknown;
  fileNo?: unknown;
  updateTimestamp?: unknown;
  updateDate?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();

function latestWithFileNo(records: FileNoRecord[]) {
  return [...records].filter((record) => text(record.fileNo)).sort((a, b) => {
    const aDate = text(a.updateTimestamp || a.updateDate);
    const bDate = text(b.updateTimestamp || b.updateDate);
    return bDate.localeCompare(aDate);
  })[0];
}

export function resolveNpdFileNo(npdRow: { id?: unknown; erp?: unknown }, qcUpdates: FileNoRecord[]) {
  const npdId = text(npdRow.id);
  const erp = text(npdRow.erp).toLowerCase();
  const byNpd = latestWithFileNo(qcUpdates.filter((record) => npdId && text(record.npdId) === npdId));
  if (byNpd) return text(byNpd.fileNo);
  const byErp = latestWithFileNo(qcUpdates.filter((record) => erp && text(record.erpNo).toLowerCase() === erp));
  return text(byErp?.fileNo) || text(npdRow.erp);
}
