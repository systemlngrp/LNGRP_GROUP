from copy import copy
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side


SOURCE = Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook.xlsx")
OUTPUT = Path(r"C:\Users\Admin\Downloads\LNGRP_Migration_Workbook_with_Missing_ERP.xlsx")
TARGET_IDS = {"7623", "7925", "10340"}


def main():
    wb = load_workbook(SOURCE)
    source = wb["Orders"]
    headers = [cell.value for cell in source[1]]
    positions = {str(value).strip().lower(): index for index, value in enumerate(headers)}

    def value(row, header):
        return row[positions[header.lower()]] if header.lower() in positions else None

    rows = []
    for excel_row, row in enumerate(source.iter_rows(min_row=2, values_only=True), start=2):
        order_id = str(value(row, "Order Id") or "").strip()
        if order_id in TARGET_IDS:
            rows.append([
                excel_row,
                value(row, "Order Id"),
                value(row, "Order Date"),
                value(row, "Company Name"),
                value(row, "PO Number"),
                value(row, "ERP Code"),
                value(row, "Item"),
                value(row, "Qty"),
                value(row, "Rate"),
                value(row, "Scheduled Date"),
                "Held: ERP/item mapping requires confirmation before synchronization",
            ])

    if "Missing ERP" in wb.sheetnames:
        del wb["Missing ERP"]
    sheet = wb.create_sheet("Missing ERP")
    headers_out = [
        "Source Row", "Order Id", "Order Date", "Company Name", "PO Number",
        "ERP Code", "Item", "Qty", "Rate", "Scheduled Date", "Status / Reason",
    ]
    sheet.append(headers_out)
    for row in rows:
        sheet.append(row)

    header_fill = PatternFill("solid", fgColor="0F766E")
    header_font = Font(bold=True, color="FFFFFF")
    thin = Side(style="thin", color="D9D9D9")
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in sheet.iter_rows(min_row=1, max_row=sheet.max_row, min_col=1, max_col=sheet.max_column):
        for cell in row:
            cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
            if cell.row > 1:
                cell.alignment = Alignment(vertical="top", wrap_text=True)
    widths = {"A": 12, "B": 12, "C": 14, "D": 38, "E": 18, "F": 14, "G": 52, "H": 12, "I": 12, "J": 16, "K": 62}
    for col, width in widths.items():
        sheet.column_dimensions[col].width = width
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:K{sheet.max_row}"
    sheet.sheet_properties.tabColor = "C00000"

    wb.save(OUTPUT)
    print(f"Created {OUTPUT}")
    print(f"Rows added: {len(rows)}")
    for row in rows:
        print(f"Order {row[1]}: {row[6]}")


if __name__ == "__main__":
    main()
