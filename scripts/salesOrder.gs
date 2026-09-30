/** Manual Google Sheets -> LNGRP order import.
 * The backend reads the Hostinger IMPORT_KEY environment variable.
 */
const SALES_ORDER_SYNC_CONFIG = {
  spreadsheetId: '1UMXRwrnrxSS9SEAfA6TUdU6cD2Sm3Y55vIr0YXwW5Lg',
  tabName: 'Order Master',
  startDate: '2026-04-01',
  firmName: 'Unit-2',
  endpoint: 'https://system.lngrp.in/api/sales-order-sync',
  secret: '1234567890',
  batchSize: 10,
  maxRows: 10,
};

const ORDER_IMPORT_COLUMNS = [
  'Order Id', 'Order Date', 'Company Name', 'PO Number', 'PO Type',
  'ERP Code', 'Item', 'Qty', 'Rate', 'Order By', 'Remarks',
  'Scheduled Date 1', 'Qty 1', 'Scheduled Date 2', 'Qty 2',
  'Scheduled Date 3', 'Qty 3', 'Scheduled Date 4', 'Qty 4',
  'Scheduled Date 5', 'Qty 5', 'Scheduled Date 6', 'Qty 6',
  'Scheduled Date 7', 'Qty 7', 'Scheduled Date 8', 'Qty 8',
  'Scheduled Date 9', 'Qty 9', 'Scheduled Date 10', 'Qty 10'
];

function syncSalesOrdersFromSheet() {
  const sheet = SpreadsheetApp.openById(SALES_ORDER_SYNC_CONFIG.spreadsheetId)
    .getSheetByName(SALES_ORDER_SYNC_CONFIG.tabName);
  if (!sheet) throw new Error('Order Master tab not found.');
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, processed: 0, message: 'No order rows.' };
  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(v => String(v || '').trim() === '')) continue;
    const payload = {};
    headers.forEach((header, column) => {
      if (header && ORDER_IMPORT_COLUMNS.indexOf(header) !== -1) payload[header] = row[column] || '';
    });
    payload['Firm Name'] = SALES_ORDER_SYNC_CONFIG.firmName;
    if (!payload['Order Id']) continue;
    const orderDate = parseSalesOrderDate_(payload['Order Date']);
    if (orderDate && orderDate >= SALES_ORDER_SYNC_CONFIG.startDate) {
      rows.push(payload);
      if (rows.length >= SALES_ORDER_SYNC_CONFIG.maxRows) break;
    }
  }
  const results = [];
  for (let offset = 0; offset < rows.length; offset += SALES_ORDER_SYNC_CONFIG.batchSize) {
    const batch = rows.slice(offset, offset + SALES_ORDER_SYNC_CONFIG.batchSize);
    const response = UrlFetchApp.fetch(SALES_ORDER_SYNC_CONFIG.endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Order-Sync-Secret': SALES_ORDER_SYNC_CONFIG.secret },
      payload: JSON.stringify({
        spreadsheetId: SALES_ORDER_SYNC_CONFIG.spreadsheetId,
        tabName: SALES_ORDER_SYNC_CONFIG.tabName,
        rows: batch,
      }),
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('Backend returned HTTP ' + code + ': ' + body);
    const parsed = JSON.parse(body);
    (parsed.results || []).forEach(item => results.push(item));
  }
  const summary = { ok: true, eligibleRows: rows.length,
    inserted: results.filter(r => r.status === 'inserted').length,
    updated: results.filter(r => r.status === 'updated').length,
    errors: results.filter(r => r.status === 'error').length, results };
  Logger.log(JSON.stringify({
    ok: summary.ok,
    eligibleRows: summary.eligibleRows,
    inserted: summary.inserted,
    updated: summary.updated,
    errors: summary.errors,
    errorPreview: results.filter(r => r.status === 'error').slice(0, 10),
  }));
  return summary;
}

function parseSalesOrderDate_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : '';
  return match[3] + '-' + ('0' + match[1]).slice(-2) + '-' + ('0' + match[2]).slice(-2);
}
