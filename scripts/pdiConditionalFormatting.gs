/**
 * Installs the PDI REPORT validation rules without changing values or formulas.
 * The function is safe to run repeatedly; rules for the configured ranges are replaced.
 */
function setupPdiReportConditionalFormatting() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('PDI REPORT');
  if (!sheet) throw new Error('Sheet tab not found: PDI REPORT');

  const firstRow = 4;
  const lastRow = 5090;
  const rules = sheet.getConditionalFormatRules();
  const titleRow = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  titleRow.setBackground('#0b3640')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  const targetA1 = new Set(['H4:H5090', 'L4:L5090', 'P4:P5090']);
  const headerRow = sheet.getRange(3, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map((header) => String(header || '').trim().toLowerCase());
  const normalized = (value) => String(value || '').trim().toLowerCase();
  const columnLetter = (column) => {
    let result = '';
    for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
      result = String.fromCharCode(((value - 1) % 26) + 65) + result;
    }
    return result;
  };
  const findColumn = (candidates) => {
    const index = candidates.map(normalized).map((candidate) => headerRow.indexOf(candidate)).find((value) => value >= 0);
    return index == null ? -1 : index + 1;
  };
  const rangeForColumn = (column) => sheet.getRange(firstRow, column, lastRow - firstRow + 1, 1);
  const brightGreen = '#00ff00';
  const brightRed = '#ff0000';
  const yellow = '#ffff00';
  const builders = [];
  const addNumericRules = (valueColumn, minColumn, maxColumn) => {
    const value = columnLetter(valueColumn);
    const min = columnLetter(minColumn);
    const max = columnLetter(maxColumn);
    const range = rangeForColumn(valueColumn);
    targetA1.add(range.getA1Notation());
    builders.push(SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenFormulaSatisfied(`=AND($${value}4<>"",ISNUMBER(IFERROR(VALUE($${value}4),"")),ISNUMBER(IFERROR(VALUE($${min}4),"")),ISNUMBER(IFERROR(VALUE($${max}4),"")),IFERROR(VALUE($${value}4),0)>=IFERROR(VALUE($${min}4),0),IFERROR(VALUE($${value}4),0)<=IFERROR(VALUE($${max}4),0))`)
      .setBackground(brightGreen).setFontColor('#000000').build());
    builders.push(SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenFormulaSatisfied(`=AND($${value}4<>"",ISNUMBER(IFERROR(VALUE($${value}4),"")),OR(NOT(ISNUMBER(IFERROR(VALUE($${min}4),""))),NOT(ISNUMBER(IFERROR(VALUE($${max}4),""))),IFERROR(VALUE($${value}4),0)<IFERROR(VALUE($${min}4),0),IFERROR(VALUE($${value}4),0)>IFERROR(VALUE($${max}4),0)))`)
      .setBackground(brightRed).setFontColor('#ffffff').build());
  };
  addNumericRules(8, 9, 10);
  addNumericRules(12, 13, 14);
  addNumericRules(16, 17, 18);

  sheet.getRangeList(['I4:J5090', 'M4:N5090', 'Q4:R5090']).setBackground('#ffff00');
  sheet.getRangeList(['S4:U5090']).setBackground('#cc4125');

  const addTextRules = (column, passPattern, failPattern) => {
    const letter = columnLetter(column);
    const range = rangeForColumn(column);
    targetA1.add(range.getA1Notation());
    builders.push(SpreadsheetApp.newConditionalFormatRule().setRanges([range])
      .whenFormulaSatisfied(`=REGEXMATCH(UPPER(TRIM($${letter}4)),"${passPattern}")`)
      .setBackground(brightGreen).setFontColor('#000000').build());
    builders.push(SpreadsheetApp.newConditionalFormatRule().setRanges([range])
      .whenFormulaSatisfied(`=REGEXMATCH(UPPER(TRIM($${letter}4)),"${failPattern}")`)
      .setBackground(brightRed).setFontColor('#ffffff').build());
  };
  ['Printing Artwork Check', 'Printing Color Check', 'Box Squaring Check', 'Flap Gap Check', 'Joint Pasting / Delamination Check']
    .forEach((name) => {
      const column = findColumn([name]);
      if (column > 0) addTextRules(column, '^(PASS|OK|YES)$', '^(FAIL|NOT OK|NO)$');
    });

  const csColumn = findColumn(['CS Act / CS STD']);
  if (csColumn > 0) {
    const letter = columnLetter(csColumn);
    const range = rangeForColumn(csColumn);
    const numericPair = `^[[:space:]]*[+-]?[0-9]+(?:\\.[0-9]+)?[[:space:]]*/[[:space:]]*[+-]?[0-9]+(?:\\.[0-9]+)?[[:space:]]*$`;
    const actual = `VALUE(REGEXEXTRACT($${letter}4,"^[[:space:]]*([+-]?[0-9]+(?:\\.[0-9]+)?)[[:space:]]*/"))`;
    const standard = `VALUE(REGEXEXTRACT($${letter}4,"/[[:space:]]*([+-]?[0-9]+(?:\\.[0-9]+)?)[[:space:]]*$"))`;
    targetA1.add(range.getA1Notation());
    builders.push(SpreadsheetApp.newConditionalFormatRule().setRanges([range])
      .whenFormulaSatisfied(`=AND(REGEXMATCH($${letter}4,"${numericPair}"),${actual}>=${standard})`)
      .setBackground(brightGreen).setFontColor('#000000').build());
    builders.push(SpreadsheetApp.newConditionalFormatRule().setRanges([range])
      .whenFormulaSatisfied(`=AND(REGEXMATCH($${letter}4,"${numericPair}"),${actual}<${standard})`)
      .setBackground(brightRed).setFontColor('#ffffff').build());
  }

  const resultColumn = findColumn(['Result']);
  if (resultColumn > 0) {
    addTextRules(resultColumn, '^PASS$', '^FAIL$');
    const letter = columnLetter(resultColumn);
    builders.push(SpreadsheetApp.newConditionalFormatRule().setRanges([rangeForColumn(resultColumn)])
      .whenFormulaSatisfied(`=UPPER(TRIM($${letter}4))="PENDING"`)
      .setBackground(yellow).setFontColor('#000000').build());
  }

  const preserved = rules.filter((rule) => rule.getRanges().every((range) => !targetA1.has(range.getA1Notation())));
  sheet.setConditionalFormatRules(preserved.concat(builders));
}
