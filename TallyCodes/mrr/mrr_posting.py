from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

try:
    import tally_mrr as core
except ModuleNotFoundError as error:
    if error.name != "tally_mrr":
        raise
    from TallyCodes.mrr import tally_mrr as core


CENT = Decimal("0.01")
PURCHASE_LEDGER_BY_MRR = {
    "reel": "PURCHASE PAPER",
    "others": "Purchase Other RM",
    "fg purchase": "Purchase - FG",
    "rejection in": "Purchase - Rejection In",
}
INPUT_TAX_LEDGERS = (
    ("totalCgst", "expenseCGST", "Input CGST"),
    ("totalSgst", "expenseSGST", "Input SGST"),
    ("totalIgst", "expenseIGST", "Input IGST"),
)
EXPENSE_LEDGER = "INSURANCE & OTHER EXP. ON PURCHASE"
TDS_LEDGER = "TDS PAYABLE"


def money(value: Any, label: str) -> Decimal:
    try:
        amount = Decimal(str(value if value not in (None, "") else "0"))
        if not amount.is_finite():
            raise InvalidOperation
        return amount.quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as error:
        raise RuntimeError(f"Invalid amount for {label}: {value!r}") from error


def format_money(value: Decimal) -> str:
    return f"{value.quantize(CENT, rounding=ROUND_HALF_UP):.2f}"


def parse_mrr_lines(raw_lines: Any, transaction_no: str) -> list[dict[str, Any]]:
    try:
        lines = json.loads(raw_lines) if isinstance(raw_lines, str) else raw_lines
    except json.JSONDecodeError as error:
        raise RuntimeError(f"MRR {transaction_no} has invalid line JSON.") from error
    if not isinstance(lines, list) or not lines or not all(isinstance(line, dict) for line in lines):
        raise RuntimeError(f"MRR {transaction_no} has no valid material lines.")
    return lines


def resolve_supplier_name(conn: Any, supplier_id: str) -> str:
    cursor = conn.cursor(dictionary=True)
    try:
        for table in ("suppliers", "companies"):
            cursor.execute(f"SELECT `name` FROM `{table}` WHERE `id` = %s LIMIT 1", (supplier_id,))
            row = cursor.fetchone()
            name = str((row or {}).get("name") or "").strip()
            if name:
                return name
    finally:
        cursor.close()
    raise RuntimeError(f"No supplier ledger was found for supplierId={supplier_id}.")


def resolve_material_profile(conn: Any, mrr_type: str, line: dict[str, Any]) -> dict[str, str]:
    item_id = str(line.get("itemId") or line.get("materialId") or "").strip()
    source = str(line.get("itemSource") or "").strip().upper()
    use_finished_goods = source == "FG" or mrr_type.strip().lower() == "fg purchase"
    if item_id:
        cursor = conn.cursor(dictionary=True)
        try:
            if use_finished_goods:
                cursor.execute(
                    "SELECT `name`, `uom`, `erp` AS `erpCode` FROM `items` WHERE `id` = %s LIMIT 1",
                    (item_id,),
                )
            else:
                cursor.execute(
                    "SELECT `name`, `uom`, `erpCode`, `type` FROM `materials` WHERE `id` = %s LIMIT 1",
                    (item_id,),
                )
            profile = cursor.fetchone() or {}
        finally:
            cursor.close()
    else:
        profile = {}
    if item_id and not profile:
        raise RuntimeError(f"MRR stock item ID '{item_id}' was not found in the application database.")

    item_name = str(
        line.get("itemName")
        or line.get("materialName")
        or line.get("name")
        or profile.get("name")
        or ""
    ).strip()
    erp_code = str(line.get("erpCode") or profile.get("erpCode") or "").strip()
    unit = str(line.get("uom") or line.get("unit") or profile.get("uom") or "").strip()
    if not item_name:
        raise RuntimeError(f"MRR material item {item_id or '(missing ID)'} has no name.")
    if not unit:
        raise RuntimeError(f"MRR material '{item_name}' has no unit of measure.")
    return {"name": item_name, "erpCode": erp_code, "uom": unit}


def resolve_inventory_lines(
    conn: Any, company_name: str, mrr: dict[str, Any], mrr_type: str, lines: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for index, line in enumerate(lines, start=1):
        profile = resolve_material_profile(conn, mrr_type, line)
        item_name = core.resolve_tally_item_name(
            profile["name"], profile["erpCode"], company_name, "MRR stock item"
        )
        tally_details = core.query_tally_stock_item_details(item_name, company_name)
        if not tally_details.get("exists"):
            raise RuntimeError(
                f"MRR {mrr.get('transactionNo')} line {index}: stock item '{profile['name']}' "
                "was not found in Tally."
            )
        unit = str(tally_details.get("baseUnit") or profile["uom"]).strip()
        if not core.has_valid_tally_unit(unit):
            raise RuntimeError(f"Tally stock item '{item_name}' has no valid base unit.")

        quantity = money(
            line.get("invoiceQty") or line.get("qty") or line.get("actualQty"),
            f"MRR line {index} quantity",
        )
        rate = money(
            line.get("invoiceRate") or line.get("rate") or line.get("poRate"),
            f"MRR line {index} rate",
        )
        if quantity <= 0 or rate <= 0:
            raise RuntimeError(f"MRR {mrr.get('transactionNo')} line {index} needs positive quantity and rate.")
        amount = money(line.get("invoiceValue"), f"MRR line {index} value")
        if amount == 0:
            amount = money(quantity * rate, f"MRR line {index} calculated value")
        if amount <= 0:
            raise RuntimeError(f"MRR {mrr.get('transactionNo')} line {index} needs a positive invoice value.")
        if abs(amount - money(quantity * rate, f"MRR line {index} calculated value")) > CENT:
            raise RuntimeError(
                f"MRR {mrr.get('transactionNo')} line {index} value does not match its quantity and rate."
            )

        batches = line.get("reels") or []
        if mrr_type.strip().lower() == "reel" and not batches:
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(
                    """SELECT `ourReelNo`, `weightKg`
                       FROM `material_in_packing_slips`
                       WHERE `materialInId` = %s AND `materialLineId` = %s
                       ORDER BY `ourReelNo`""",
                    (str(mrr.get("id") or ""), str(line.get("id") or "")),
                )
                batches = cursor.fetchall()
            finally:
                cursor.close()
            if not batches:
                raise RuntimeError(
                    f"Reel MRR {mrr.get('transactionNo')} line {index} has no reel/batch details."
                )

        normalized_batches: list[dict[str, Any]] = []
        if batches:
            batch_total = Decimal("0")
            for batch in batches:
                batch_name = str(batch.get("ourReelNo") or batch.get("batchName") or "").strip()
                batch_qty = money(batch.get("weightKg") or batch.get("qty"), "reel batch quantity")
                if not batch_name or batch_qty <= 0:
                    raise RuntimeError(
                        f"MRR {mrr.get('transactionNo')} line {index} has an invalid reel batch."
                    )
                normalized_batches.append({"name": batch_name, "qty": batch_qty})
                batch_total += batch_qty
            if abs(batch_total - quantity) > CENT:
                raise RuntimeError(
                    f"Reel MRR {mrr.get('transactionNo')} line {index} quantity "
                    f"({quantity}) does not match reel weights ({batch_total})."
                )
        else:
            normalized_batches.append({"name": "Primary Batch", "qty": quantity})

        resolved.append({
            "name": item_name,
            "quantity": quantity,
            "rate": rate,
            "amount": amount,
            "unit": unit,
            "batches": normalized_batches,
        })
    return resolved


def validate_purchase_mrr(
    mrr: dict[str, Any], inventory_lines: list[dict[str, Any]]
) -> dict[str, Decimal]:
    subtotal = sum((line["amount"] for line in inventory_lines), Decimal("0")).quantize(CENT)
    stored_subtotal = money(mrr.get("totalInvoiceValue"), "MRR totalInvoiceValue")
    if mrr.get("totalInvoiceValue") not in (None, "") and abs(stored_subtotal - subtotal) > CENT:
        raise RuntimeError(
            f"MRR {mrr.get('transactionNo')} line total {subtotal} differs from stored invoice value {stored_subtotal}."
        )

    tax_amounts: dict[str, Decimal] = {}
    for total_field, expense_field, ledger in INPUT_TAX_LEDGERS:
        tax_amounts[ledger] = (
            money(mrr.get(total_field), total_field)
            + money(mrr.get(expense_field), expense_field)
        ).quantize(CENT)
        if tax_amounts[ledger] < 0:
            raise RuntimeError(f"MRR {mrr.get('transactionNo')} has negative {ledger}.")

    charges = (
        money(mrr.get("insurance"), "insurance")
        + money(mrr.get("otherCharges"), "otherCharges")
    ).quantize(CENT)
    round_off = money(mrr.get("roundOff"), "roundOff")
    gross = (subtotal + sum(tax_amounts.values()) + charges + round_off).quantize(CENT)
    stored_total = money(mrr.get("totalAmount"), "totalAmount")
    if gross <= 0 or abs(gross - stored_total) > CENT:
        raise RuntimeError(
            f"MRR {mrr.get('transactionNo')} is out of balance: calculated gross {gross}, "
            f"stored totalAmount {stored_total}."
        )

    tds = money(mrr.get("tdsAmount"), "tdsAmount")
    if tds < 0 or tds > gross:
        raise RuntimeError(f"MRR {mrr.get('transactionNo')} has an invalid TDS amount.")
    payable = (gross - tds).quantize(CENT)
    stored_payable = money(mrr.get("netSupplierPayable"), "netSupplierPayable")
    if stored_payable and abs(stored_payable - payable) > CENT:
        raise RuntimeError(
            f"MRR {mrr.get('transactionNo')} netSupplierPayable {stored_payable} "
            f"does not match calculated payable {payable}."
        )
    return {
        "subtotal": subtotal,
        "charges": charges,
        "roundOff": round_off,
        "gross": gross,
        "tds": tds,
        "payable": payable,
        **tax_amounts,
    }


def build_purchase_mrr_xml(
    company_name: str | None,
    mrr: dict[str, Any],
    supplier_name: str,
    inventory_lines: list[dict[str, Any]],
) -> str:
    mrr_type = str(mrr.get("mrrType") or "").strip()
    purchase_ledger = PURCHASE_LEDGER_BY_MRR.get(mrr_type.lower())
    if not purchase_ledger:
        raise RuntimeError(f"Unsupported MRR type for Purchase posting: {mrr_type or '(blank)'}")
    totals = validate_purchase_mrr(mrr, inventory_lines)
    voucher_date = core._parse_tally_date(mrr.get("invDate")) or core._parse_tally_date(mrr.get("date"))
    if not voucher_date:
        raise RuntimeError(f"MRR {mrr.get('transactionNo')} has no valid invoice/receipt date.")
    invoice_no = str(mrr.get("invoiceNo") or "").strip()
    transaction_no = str(mrr.get("transactionNo") or "").strip()
    if not supplier_name.strip() or not invoice_no or not transaction_no:
        raise RuntimeError("MRR needs a supplier, invoice number, and transaction number.")

    inventory_xml: list[str] = []
    for line in inventory_lines:
        qty_text = core.format_qty(float(line["quantity"]), line["unit"])
        rate_text = core.format_rate(float(line["rate"]), line["unit"])
        batch_xml = "".join(
            f"""<BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Main Location</GODOWNNAME>
                <BATCHNAME>{core.escape_xml(batch['name'])}</BATCHNAME>
                <AMOUNT>-{format_money(line['rate'] * batch['qty'])}</AMOUNT>
                <ACTUALQTY>{core.format_qty(float(batch['qty']), line['unit'])}</ACTUALQTY>
                <BILLEDQTY>{core.format_qty(float(batch['qty']), line['unit'])}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>"""
            for batch in line["batches"]
        )
        inventory_xml.append(
            f"""<ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>{core.escape_xml(line['name'])}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <ACTUALQTY>{qty_text}</ACTUALQTY>
                <BILLEDQTY>{qty_text}</BILLEDQTY>
                <RATE>{rate_text}</RATE>
                <AMOUNT>-{format_money(line['amount'])}</AMOUNT>
                {batch_xml}
                <ACCOUNTINGALLOCATIONS.LIST>
                    <LEDGERNAME>{core.escape_xml(purchase_ledger)}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                    <AMOUNT>-{format_money(line['amount'])}</AMOUNT>
                </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>"""
        )

    ledger_xml = [
        f"""<LEDGERENTRIES.LIST><LEDGERNAME>{core.escape_xml(supplier_name)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <AMOUNT>{format_money(totals['payable'])}</AMOUNT></LEDGERENTRIES.LIST>"""
    ]
    for ledger, amount in totals.items():
        if ledger in {name for _, _, name in INPUT_TAX_LEDGERS} and amount:
            ledger_xml.append(
                f"""<LEDGERENTRIES.LIST><LEDGERNAME>{core.escape_xml(ledger)}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{format_money(amount)}</AMOUNT>
                </LEDGERENTRIES.LIST>"""
            )
    if totals["charges"]:
        ledger_xml.append(
            f"""<LEDGERENTRIES.LIST><LEDGERNAME>{EXPENSE_LEDGER}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{format_money(totals['charges'])}</AMOUNT>
            </LEDGERENTRIES.LIST>"""
        )
    if totals["roundOff"]:
        ledger_xml.append(
            f"""<LEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{format_money(totals['roundOff'])}</AMOUNT>
            </LEDGERENTRIES.LIST>"""
        )
    if totals["tds"]:
        ledger_xml.append(
            f"""<LEDGERENTRIES.LIST><LEDGERNAME>{TDS_LEDGER}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{format_money(totals['tds'])}</AMOUNT>
            </LEDGERENTRIES.LIST>"""
        )

    narration = f"MRR {transaction_no} | Supplier Invoice {invoice_no}"
    user_narration = str(mrr.get("narration") or "").strip()
    if user_narration:
        narration = f"{user_narration} | {narration}"
    return f"""<ENVELOPE>
        <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
        <BODY><IMPORTDATA>
            <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>{core.build_company_static_variables(company_name)}</STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
                <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
                    <DATE>{voucher_date.strftime('%Y%m%d')}</DATE>
                    <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
                    <PARTYNAME>{core.escape_xml(supplier_name)}</PARTYNAME>
                    <PARTYLEDGERNAME>{core.escape_xml(supplier_name)}</PARTYLEDGERNAME>
                    <REFERENCE>{core.escape_xml(invoice_no)}</REFERENCE>
                    <NARRATION>{core.escape_xml(narration)}</NARRATION>
                    <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                    <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
                    <ISINVOICE>Yes</ISINVOICE>
                    {''.join(inventory_xml)}
                    {''.join(ledger_xml)}
                </VOUCHER>
            </TALLYMESSAGE></REQUESTDATA>
        </IMPORTDATA></BODY>
    </ENVELOPE>"""


def financial_year_bounds(value: datetime) -> tuple[str, str]:
    start_year = value.year if value.month >= 4 else value.year - 1
    return f"{start_year}0401", f"{start_year + 1}0331"


def is_duplicate_purchase(vouchers: list[dict[str, Any]], mrr: dict[str, Any], supplier_name: str) -> bool:
    invoice_no = core.normalize_lookup_token(mrr.get("invoiceNo"))
    supplier = core.normalize_lookup_token(supplier_name)
    return any(
        core.normalize_lookup_token(voucher.get("reference")) == invoice_no
        and core.normalize_lookup_token(voucher.get("partyLedgerName")) == supplier
        and core.normalize_lookup_token(voucher.get("voucherType") or "Purchase") == "PURCHASE"
        for voucher in vouchers
    )


def update_mrr_result(conn: Any, mrr_id: str, remark: str, completed: bool) -> None:
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    if completed:
        cursor.execute(
            """UPDATE `material_in`
               SET `tallyTimestamp` = %s, `tallySyncRemark` = %s, `status` = 'Completed',
                   `updatedBy` = %s, `updateTimestamp` = %s
               WHERE `id` = %s AND (`tallyTimestamp` IS NULL OR TRIM(`tallyTimestamp`) = '')""",
            (now, remark, core.POSTED_BY, now, mrr_id),
        )
    else:
        cursor.execute(
            """UPDATE `material_in` SET `tallySyncRemark` = %s, `updateTimestamp` = %s
               WHERE `id` = %s AND (`tallyTimestamp` IS NULL OR TRIM(`tallyTimestamp`) = '')""",
            (remark, now, mrr_id),
        )
    conn.commit()
    cursor.close()


def post_purchase_xml(xml_text: str) -> str:
    urls = list(core.TALLY_URL_CANDIDATES)
    if core.ACTIVE_TALLY_URL and core.ACTIVE_TALLY_URL not in urls:
        urls.insert(0, core.ACTIVE_TALLY_URL)
    last_connection_error: Exception | None = None
    for url in urls:
        try:
            response = core.requests.post(
                url,
                data=xml_text.encode("utf-8"),
                headers={"Content-Type": "text/xml; charset=utf-8"},
                timeout=core.REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            core.ACTIVE_TALLY_URL = url
            return response.text
        except core.requests_exceptions.Timeout as error:
            raise RuntimeError(
                "Tally timed out while posting the MRR; the result is unknown. "
                "Do not repost until the Purchase voucher register has been checked."
            ) from error
        except core.requests_exceptions.ConnectionError as error:
            last_connection_error = error
            message = str(error).lower()
            if not any(
                text in message
                for text in ("connection refused", "actively refused", "failed to establish a new connection")
            ):
                raise RuntimeError(
                    "Tally connection dropped during the MRR post; the result is unknown. "
                    "Check the Purchase voucher register before retrying."
                ) from error
        except core.requests_exceptions.RequestException as error:
            raise RuntimeError(f"Tally request failed: {error}") from error
    raise RuntimeError(f"Tally is not reachable at the configured firm port(s): {last_connection_error}")


def process_one_mrr(conn: Any, company_name: str, mrr: dict[str, Any], dry_run: bool) -> None:
    transaction_no = str(mrr.get("transactionNo") or "").strip()
    mrr_type = str(mrr.get("mrrType") or "").strip()
    lines = parse_mrr_lines(mrr.get("lines"), transaction_no)
    supplier_name = resolve_supplier_name(conn, str(mrr.get("supplierId") or "").strip())
    inventory_lines = resolve_inventory_lines(conn, company_name, mrr, mrr_type, lines)
    xml_text = build_purchase_mrr_xml(company_name, mrr, supplier_name, inventory_lines)
    if dry_run:
        print(xml_text)
        return

    invoice_date = core._parse_tally_date(mrr.get("invDate")) or core._parse_tally_date(mrr.get("date"))
    if not invoice_date:
        raise RuntimeError(f"MRR {transaction_no} has no valid invoice/receipt date.")
    from_date, to_date = financial_year_bounds(invoice_date)
    vouchers = core.fetch_tally_vouchers_for_duplicate_check(
        company_name, "Purchase", supplier_name, from_date, to_date
    )
    if is_duplicate_purchase(vouchers, mrr, supplier_name):
        update_mrr_result(
            conn,
            str(mrr["id"]),
            f"Skipped duplicate Purchase voucher in Tally (supplier={supplier_name}, invoice={mrr.get('invoiceNo')}).",
            completed=True,
        )
        core.LOGGER.info("MRR %s already exists in Tally; marked as reconciled.", transaction_no)
        return

    response_text = post_purchase_xml(xml_text)
    summary = core.parse_import_summary(response_text)
    if summary.get("CREATED", 0) + summary.get("ALTERED", 0) > 0 and not (
        summary.get("ERRORS", 0) or summary.get("EXCEPTIONS", 0)
    ):
        update_mrr_result(
            conn,
            str(mrr["id"]),
            f"Purchase voucher posted to Tally for MRR {transaction_no}.",
            completed=True,
        )
        core.LOGGER.info("MRR %s posted to Tally.", transaction_no)
        return

    raise RuntimeError(
        f"Tally rejected MRR {transaction_no}: {core.response_error_message(response_text)}"
    )


def run_pending_mrrs(
    firm_number: int | None = None, dry_run: bool = False, mrr_no: str | None = None
) -> None:
    core.LOGGER.info("Starting MRR Purchase posting | Build signature: %s", core.BUILD_SIGNATURE)
    conn = core.get_db_connection()
    try:
        selected_firms = [firm_number] if firm_number is not None else sorted(core.FIRM_CONFIG)
        for selected_firm_number in selected_firms:
            firm = core.resolve_firm(conn, selected_firm_number)
            core.TALLY_URL_CANDIDATES = core.build_tally_url_candidates(firm["tallyPortNo"])
            core.ACTIVE_TALLY_URL = None
            company_name = firm["firmName"]
            pending_mrrs = core.get_pending_mrrs(conn, firm["id"], mrr_no)
            core.LOGGER.info(
                "Found %s eligible non-service MRR(s) for %s.",
                len(pending_mrrs),
                firm["label"],
            )
            for mrr in pending_mrrs:
                try:
                    process_one_mrr(conn, company_name, mrr, dry_run)
                except Exception as error:
                    transaction_no = mrr.get("transactionNo") or mrr.get("id")
                    core.LOGGER.exception("MRR %s failed: %s", transaction_no, error)
                    if not dry_run:
                        update_mrr_result(conn, str(mrr["id"]), str(error)[:2000], completed=False)
    finally:
        conn.close()
        core.LOGGER.info("Finished MRR Purchase posting.")
