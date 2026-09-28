#!/usr/bin/env python3
"""Post completed Unit-2 Printing processing to Tally."""
from __future__ import annotations

import argparse
import datetime as dt
import os
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal
from xml.sax.saxutils import escape

from mfjFirm1 import (
    connect_db,
    create_stock_item,
    dict_rows,
    ensure_stock_items,
    load_env,
    post_tally,
    tally_date,
)


def _money(value):
    return format(Decimal(str(value or "0")).quantize(Decimal("0.01")), "f")


def _local_name(tag):
    return str(tag).rsplit("}", 1)[-1].upper()


def _first_text(element, names):
    wanted = {name.upper() for name in names}
    for child in element.iter():
        if _local_name(child.tag) in wanted and (child.text or "").strip():
            return child.text.strip()
    return None


def find_existing_voucher(port, company, job_no, date_value, timeout):
    """Find the existing Manufacturing Journal and return its alter identity."""
    tally_day = tally_date(date_value)
    request_xml = f'''<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY><SVFROMDATE>{tally_day}</SVFROMDATE><SVTODATE>{tally_day}</SVTODATE><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC><REQUESTDATA></REQUESTDATA></EXPORTDATA></BODY></ENVELOPE>'''
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}", data=request_xml.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            root = ET.fromstring(response.read().decode("utf-8", errors="replace"))
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        raise RuntimeError(f"Unable to query Tally Voucher Register: {exc}") from exc

    wanted_job = str(job_no).strip()
    candidates = []
    for voucher in root.iter():
        if _local_name(voucher.tag) != "VOUCHER":
            continue
        voucher_type = _first_text(voucher, ("VOUCHERTYPENAME", "VCHTYPE")) or voucher.attrib.get("VCHTYPE")
        if voucher_type and voucher_type.strip().lower() != "manufacturing journal":
            continue
        reference = _first_text(voucher, ("REFERENCE", "REFERENCE NUMBER"))
        number = _first_text(voucher, ("VOUCHERNUMBER", "VOUCHERNO", "NUMBER"))
        identity = {
            name: voucher.attrib.get(name) or _first_text(voucher, (name,))
            for name in ("REMOTEID", "VCHKEY", "MASTERID", "ALTERID")
            if voucher.attrib.get(name) or _first_text(voucher, (name,))
        }
        candidate = {"voucher": number, "reference": reference, **identity}
        if reference and reference.strip() == wanted_job:
            return candidate
        if number and number.strip() == wanted_job:
            candidates.append(candidate)
    if candidates:
        return candidates[0]
    raise RuntimeError(f"Existing Manufacturing Journal voucher not found for job {wanted_job}")


def voucher_xml(row, company, existing):
    job = str(row.get("jobNo") or "").strip()
    item = str(row.get("itemName") or row.get("erpCode") or "").strip()
    qty = Decimal(str(row.get("qty") or "0"))
    rate = Decimal(str(row.get("rate") or "0"))
    uom = str(row.get("uom") or "PCS").strip() or "PCS"
    if not job or not item or qty <= 0:
        raise ValueError("Job number, product item, and positive Printing quantity are required")
    if rate <= 0:
        raise ValueError(f"Job item rate is missing for {item}")
    quantity = _money(qty)
    item_rate = _money(rate)
    amount = _money(qty * rate)
    narration = f"Unit-2 Printing | Job {job}"
    component = (
        f"<INVENTORYENTRIESOUT.LIST><STOCKITEMNAME>Corrugated Board</STOCKITEMNAME>"
        f"<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>"
        f"<ISTRACKPRODUCTION>No</ISTRACKPRODUCTION><ISPRIMARYITEM>No</ISPRIMARYITEM>"
        f"<ACTUALQTY>{quantity} {escape(uom)}</ACTUALQTY><BILLEDQTY>{quantity} {escape(uom)}</BILLEDQTY>"
        f"<RATE>{item_rate}/{escape(uom)}</RATE><AMOUNT>{amount}</AMOUNT>"
        f"<BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME><BATCHNAME>{escape(job)}</BATCHNAME>"
        f"<ACTUALQTY>{quantity} {escape(uom)}</ACTUALQTY><BILLEDQTY>{quantity} {escape(uom)}</BILLEDQTY>"
        f"<RATE>{item_rate}/{escape(uom)}</RATE><AMOUNT>{amount}</AMOUNT></BATCHALLOCATIONS.LIST></INVENTORYENTRIESOUT.LIST>"
    )
    identity = " ".join(f'{key}=\"{escape(value)}\"' for key, value in existing.items() if key in {"REMOTEID", "VCHKEY", "MASTERID", "ALTERID"} and value)
    voucher_number = existing.get("voucher") or job
    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><VOUCHER ACTION=\"Alter\" VCHTYPE=\"Manufacturing Journal\" OBJVIEW=\"Multi Consumption Voucher View\"{(' ' + identity) if identity else ''}><DATE>{tally_date(row.get('date'))}</DATE><VOUCHERNUMBER>{escape(voucher_number)}</VOUCHERNUMBER><VOUCHERTYPENAME>Manufacturing Journal</VOUCHERTYPENAME><PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW><NARRATION>{escape(narration)}</NARRATION><REFERENCE>{escape(job)}</REFERENCE><ISINVOICE>No</ISINVOICE>{component}<INVENTORYENTRIESIN.LIST><STOCKITEMNAME>{escape(item)}</STOCKITEMNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT><ISTRACKPRODUCTION>Yes</ISTRACKPRODUCTION><ISPRIMARYITEM>Yes</ISPRIMARYITEM><ACTUALQTY>{quantity} {escape(uom)}</ACTUALQTY><BILLEDQTY>{quantity} {escape(uom)}</BILLEDQTY><BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME><BATCHNAME>{escape(job)}</BATCHNAME><ACTUALQTY>{quantity} {escape(uom)}</ACTUALQTY><BILLEDQTY>{quantity} {escape(uom)}</BILLEDQTY></BATCHALLOCATIONS.LIST></INVENTORYENTRIESIN.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""


def resolve_item(connection, row):
    source = str(row.get("itemSource") or "FG").strip().upper()
    table = {"FG": "items", "PHP": "php_item_master", "PLATE": "plate_item_master"}.get(source, "items")
    cursor = connection.cursor()
    cursor.execute(f"SELECT * FROM `{table}` WHERE id = %s LIMIT 1", (row.get("itemId"),))
    records = dict_rows(cursor, cursor.fetchall())
    cursor.close()
    item = records[0] if records else {}
    row["itemName"] = str(item.get("name") or item.get("itemName") or item.get("item_name") or row.get("remarks") or row.get("erpCode") or "").strip()
    row["erpCode"] = str(item.get("erp") or item.get("erpCode") or item.get("erpItemCode") or row.get("erpCode") or "").strip()
    return row


def get_port_and_company(connection):
    override = os.environ.get("MFJ_FIRM2_TALLY_PORT", "").strip()
    cursor = connection.cursor()
    if override:
        cursor.execute("SELECT firmName FROM firms WHERE tallyPortNo = %s LIMIT 1", (override,))
    else:
        cursor.execute("""SELECT firmName, tallyPortNo FROM firms
            WHERE COALESCE(TRIM(tallyPortNo), '') <> ''
              AND (LOWER(REPLACE(REPLACE(REPLACE(TRIM(firmName), '-', ''), ' ', ''), '_', '')) = 'unitii'
                   OR UPPER(TRIM(COALESCE(shortName, ''))) IN ('LNCB-2', 'UNIT-2', 'UNIT2'))
            ORDER BY id LIMIT 1""")
    rows = dict_rows(cursor, cursor.fetchall()); cursor.close()
    if not rows:
        raise RuntimeError("Configure Unit-II firms.tallyPortNo or set MFJ_FIRM2_TALLY_PORT.")
    return override or str(rows[0]["tallyPortNo"]), str(rows[0].get("firmName") or "Firm-2")


def get_rows(connection, date_filter=None, job_filter=None, retry=False):
    clauses = [
        "LOWER(TRIM(COALESCE(pp.machineName, ''))) = 'printing'",
        "LOWER(TRIM(COALESCE(pp.completionStatus, 'Full'))) = 'full'",
    ]
    if not retry:
        clauses.append("LOWER(TRIM(COALESCE(pp.tallyPostingStatus, ''))) NOT IN ('posted', 'completed')")
    params = []
    if date_filter:
        clauses.append("pp.date = %s"); params.append(date_filter)
    if job_filter:
        clauses.append("CAST(pp.jobNo AS CHAR) = %s"); params.append(job_filter)
    sql = f"""SELECT pp.id, pp.productionId, pp.date, pp.jobNo, pp.qty, pp.completionStatus,
        pp.tallyPostingStatus, p.itemId, p.itemSource, p.erpCode, p.masterErp, p.remarks, p.rate, p.uom
        FROM production_processing pp LEFT JOIN productions p ON p.id = pp.productionId
        WHERE {' AND '.join(clauses)} ORDER BY pp.date, pp.id"""
    cursor = connection.cursor(); cursor.execute(sql, tuple(params))
    rows = dict_rows(cursor, cursor.fetchall()); cursor.close()
    return [resolve_item(connection, row) for row in rows]


def save_result(connection, row_id, result, timestamp):
    cursor = connection.cursor()
    cursor.execute("""UPDATE production_processing SET tallyPostingStatus=%s, tallyTimestamp=%s,
        tallyVoucherNo=%s, tallyVoucherDate=%s, tallyPostingRemark=%s, tallyPostingError=%s WHERE id=%s""",
        (result["status"], timestamp, result.get("voucher"), timestamp[:10],
         "Firm-2 Printing Manufacturing Journal", result.get("error"), row_id))
    connection.commit(); cursor.close()


def main():
    load_env()
    parser = argparse.ArgumentParser(description="Post Firm-2 Printing entries to Tally")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date")
    parser.add_argument("--job")
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    connection = connect_db()
    try:
        port, company = get_port_and_company(connection)
        rows = get_rows(connection, args.date, args.job, args.retry)
        print(f"Firm-2 Tally port: {port}; eligible rows: {len(rows)}")
        for row in rows:
            try:
                existing = None if args.dry_run else find_existing_voucher(port, company, row.get("jobNo"), row.get("date"), args.timeout)
                payload = voucher_xml(row, company, existing or {})
                if args.dry_run:
                    print(f"DRY-RUN job={row.get('jobNo')}\n{payload}")
                    continue
                ensure_stock_items(port, company, {"uom": row.get("uom"), "components": [{"materialName": "Corrugated Board"}]}, args.timeout)
                try:
                    create_stock_item(port, company, row.get("itemName") or row.get("erpCode"), row.get("uom") or "PCS", args.timeout)
                except RuntimeError as exc:
                    if not any(text in str(exc).lower() for text in ("already exist", "duplicate entry")):
                        raise
                result = post_tally(port, payload, company, row.get("jobNo"), row.get("date"), args.timeout)
                save_result(connection, row["id"], result, dt.datetime.now(dt.timezone.utc).isoformat())
                print(f"job={row.get('jobNo')} status={result['status']} voucher={result.get('voucher') or '-'} error={result.get('error') or '-'}")
            except Exception as exc:
                if not args.dry_run:
                    save_result(connection, row["id"], {"status": "Failed", "voucher": None, "error": str(exc)}, dt.datetime.now(dt.timezone.utc).isoformat())
                print(f"job={row.get('jobNo')} status=Failed error={exc}")
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
