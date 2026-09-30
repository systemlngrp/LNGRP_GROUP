/** Manual Google Sheets -> LNGRP order import.
 * The backend reads the Hostinger IMPORT_KEY environment variable.
 */
const SALES_ORDER_SYNC_CONFIG = {
  spreadsheetId: '1UMXRwrnrxSS9SEAfA6TUdU6cD2Sm3Y55vIr0YXwW5Lg',
  tabName: 'Order Master',
  startDate: '2026-04-01',
  endpoint: 'https://system.lngrp.in/api/sales-order-sync',
  secret: '1234567890',
  batchSize: 100,
};

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
    headers.forEach((header, column) => { if (header) payload[header] = row[column] || ''; });
    if (!payload['Order Id']) continue;
    const orderDate = parseSalesOrderDate_(payload['Order Date']);
    if (orderDate && orderDate >= SALES_ORDER_SYNC_CONFIG.startDate) rows.push(payload);
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
  Logger.log(JSON.stringify(summary));
  return summary;
}

function parseSalesOrderDate_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : '';
  return match[3] + '-' + ('0' + match[1]).slice(-2) + '-' + ('0' + match[2]).slice(-2);
}
