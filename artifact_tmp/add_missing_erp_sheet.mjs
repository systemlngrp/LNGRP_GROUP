import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'C:/Users/Admin/Downloads/LNGRP_Migration_Workbook.xlsx';
const outputDir = 'C:/Users/Admin/Downloads';
const outputPath = `${outputDir}/LNGRP_Migration_Workbook_with_Missing_ERP.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const orders = workbook.worksheets.getItem('Orders');
const used = orders.getUsedRange(true);
const values = used.values;
const headers = values[0].map(v => String(v ?? '').trim());
const index = new Map(headers.map((h, i) => [h.toLowerCase(), i]));
const get = (row, name) => row[index.get(name.toLowerCase()) ?? -1] ?? '';

const targetOrderIds = new Set(['7623', '7925', '10340']);
const rows = [];
for (let i = 1; i < values.length; i++) {
  const row = values[i];
  const orderId = String(get(row, 'Order Id')).trim();
  if (targetOrderIds.has(orderId)) {
    rows.push([
      i + 1,
      get(row, 'Order Id'),
      get(row, 'Order Date'),
      get(row, 'Company Name'),
      get(row, 'PO Number'),
      get(row, 'ERP Code'),
      get(row, 'Item'),
      get(row, 'Qty'),
      get(row, 'Rate'),
      get(row, 'Scheduled Date'),
      'Held: ERP/item mapping requires confirmation before synchronization'
    ]);
  }
}

const name = 'Missing ERP';
let sheet = workbook.worksheets.getItemOrNullObject?.(name);
if (!sheet || sheet.isNullObject) sheet = workbook.worksheets.add(name);
sheet.getRange('A1:K100').clear({ applyTo: 'all' });
sheet.getRange('A1:K1').values = [[
  'Source Row', 'Order Id', 'Order Date', 'Company Name', 'PO Number',
  'ERP Code', 'Item', 'Qty', 'Rate', 'Scheduled Date', 'Status / Reason'
]];
if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, 11).values = rows;
sheet.getRange(`A1:K${Math.max(rows.length + 1, 2)}`).format.borders = { preset: 'all', style: 'thin', color: '#D9D9D9' };
sheet.getRange('A1:K1').format = { fill: '#0F766E', font: { bold: true, color: '#FFFFFF' }, wrapText: true };
sheet.getRange(`A2:K${Math.max(rows.length + 1, 2)}`).format.wrapText = true;
sheet.getRange('A:K').format.autofitColumns();
sheet.getRange('A:A').format.columnWidth = 12;
sheet.getRange('D:D').format.columnWidth = 34;
sheet.getRange('G:G').format.columnWidth = 48;
sheet.getRange('K:K').format.columnWidth = 58;
sheet.freezePanes.freezeRows(1);
sheet.tabColor = '#C00000';

workbook.recalculate();
await fs.mkdir(outputDir, { recursive: true });
const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(JSON.stringify({ outputPath, rowsAdded: rows.length, rows }));
