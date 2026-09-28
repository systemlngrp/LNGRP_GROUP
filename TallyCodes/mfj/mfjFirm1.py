#!/usr/bin/env python3
"""Post completed Unit-1 Corrugation Liner processing to Tally."""
from __future__ import annotations

import argparse
import datetime as dt
import os
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal
from xml.sax.saxutils import escape


def load_env():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def connect_db():
    try:
        import mysql.connector as mysql
        return mysql.connect(
            host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT", "3306")),
            user=os.environ["DB_USER"], password=os.environ.get("DB_PASSWORD", ""),
            database=os.environ["DB_NAME"], autocommit=False,
        )
    except ImportError:
        try:
            import pymysql
            return pymysql.connect(
                host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT", "3306")),
                user=os.environ["DB_USER"], password=os.environ.get("DB_PASSWORD", ""),
                database=os.environ["DB_NAME"], autocommit=False,
                cursorclass=pymysql.cursors.DictCursor,
            )
        except ImportError as exc:
            raise RuntimeError("Install mysql-connector-python or PyMySQL.") from exc


def dict_rows(cursor, rows):
    rows = list(rows)
    if not rows or isinstance(rows[0], dict):
        return rows
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in rows]


def tally_date(value):
    return dt.datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%d-%m-%Y")


def _money(value):
    return format(Decimal(str(value or "0")).quantize(Decimal("0.01")), "f")


def voucher_xml(row, company):
    job = str(row.get("jobNo") or "").strip()
    qty = Decimal(str(row.get("qty") or "0"))
    components = row.get("components") or []
    if not job or qty <= 0:
        raise ValueError("Job number and positive quantity are required")
    if not components:
        raise ValueError("No reel component remains after subtracting returned reel weight")
    quantity = format(qty, "f")
    uom = str(row.get("uom") or "PCS")
    narration = f"Unit-1 Corrugation Liner | Job {job}"
    component_xml = []
    for component in components:
        item = str(component.get("materialName") or component.get("erpCode") or "").strip()
        component_qty = Decimal(str(component.get("quantityKg") or "0"))
        rate = Decimal(str(component.get("rate") or "0"))
        if not item:
            raise ValueError(f"Material ERP/name is missing for reel {component.get('ourReelNo') or component.get('packingSlipId')}")
        if component_qty <= 0:
            continue
        if rate <= 0:
            raise ValueError(f"Material rate is missing for {item}")
        component_quantity = _money(component_qty)
        component_rate = _money(rate)
        amount = _money(component_qty * rate)
        component_xml.append(
            f"<INVENTORYENTRIESOUT.LIST><STOCKITEMNAME>{escape(item)}</STOCKITEMNAME>"
            f"<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>"
            f"<ISTRACKPRODUCTION>No</ISTRACKPRODUCTION><ISPRIMARYITEM>No</ISPRIMARYITEM>"
            f"<ACTUALQTY>{component_quantity} KGS</ACTUALQTY><BILLEDQTY>{component_quantity} KGS</BILLEDQTY>"
            f"<RATE>{component_rate}/KGS</RATE><AMOUNT>{amount}</AMOUNT>"
            f"<BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME>"
            f"<BATCHNAME>{escape(str(component.get('ourReelNo') or component.get('packingSlipId') or 'Primary Batch'))}</BATCHNAME>"
            f"<ACTUALQTY>{component_quantity} KGS</ACTUALQTY><BILLEDQTY>{component_quantity} KGS</BILLEDQTY>"
            f"<RATE>{component_rate}/KGS</RATE><AMOUNT>{amount}</AMOUNT></BATCHALLOCATIONS.LIST></INVENTORYENTRIESOUT.LIST>"
        )
    if not component_xml:
        raise ValueError("No positive reel component remains after subtracting returned reel weight")
    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><VOUCHER ACTION=\"Create\" VCHTYPE=\"Manufacturing Journal\" OBJVIEW=\"Multi Consumption Voucher View\"><DATE>{tally_date(row.get('date'))}</DATE><VOUCHERNUMBER>{escape(job)}</VOUCHERNUMBER><VOUCHERTYPENAME>Manufacturing Journal</VOUCHERTYPENAME><PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW><NARRATION>{escape(narration)}</NARRATION><REFERENCE>{escape(job)}</REFERENCE><ISINVOICE>No</ISINVOICE>{''.join(component_xml)}<INVENTORYENTRIESIN.LIST><STOCKITEMNAME>Corrugated Board</STOCKITEMNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT><ISTRACKPRODUCTION>Yes</ISTRACKPRODUCTION><ISPRIMARYITEM>Yes</ISPRIMARYITEM><ACTUALQTY>{escape(quantity)} {escape(uom)}</ACTUALQTY><BILLEDQTY>{escape(quantity)} {escape(uom)}</BILLEDQTY><BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME><BATCHNAME>{escape(job)}</BATCHNAME><ACTUALQTY>{escape(quantity)} {escape(uom)}</ACTUALQTY><BILLEDQTY>{escape(quantity)} {escape(uom)}</BILLEDQTY></BATCHALLOCATIONS.LIST></INVENTORYENTRIESIN.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""


def _local_name(tag):
    return str(tag).rsplit("}", 1)[-1].upper()


def _first_text(root, names):
    wanted = {name.upper() for name in names}
    for element in root.iter():
        if _local_name(element.tag) in wanted and (element.text or "").strip():
            return element.text.strip()
    return None


def fetch_voucher_number(port, company, job_no, date_value, timeout):
    """Ask Tally's Voucher Register for the auto-generated number."""
    try:
        tally_day = tally_date(date_value)
        request_xml = f'''<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY><SVFROMDATE>{tally_day}</SVFROMDATE><SVTODATE>{tally_day}</SVTODATE><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC><REQUESTDATA></REQUESTDATA></EXPORTDATA></BODY></ENVELOPE>'''
        request = urllib.request.Request(f"http://127.0.0.1:{port}", data=request_xml.encode("utf-8"), headers={"Content-Type": "text/xml; charset=utf-8"}, method="POST")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            root = ET.fromstring(response.read().decode("utf-8", errors="replace"))
        for voucher in root.iter():
            if _local_name(voucher.tag) != "VOUCHER":
                continue
            reference = _first_text(voucher, ("REFERENCE", "REFERENCE NUMBER"))
            if reference and reference.strip() == str(job_no).strip():
                return _first_text(voucher, ("VOUCHERNUMBER", "VOUCHERNO", "NUMBER"))
        return None
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError):
        return None


def post_tally(port, payload, company, job_no, date_value, timeout):
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}", data=payload.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
        root = ET.fromstring(body)
        errors = root.findtext(".//ERRORS") or "0"
        created = root.findtext(".//CREATED") or "0"
        altered = _first_text(root, ("ALTERED",)) or "0"
        error = root.findtext(".//LINEERROR") or root.findtext(".//ERROR")
        voucher = _first_text(root, ("VOUCHERNUMBER", "VOUCHERNO", "LASTVOUCHERNO", "NUMBER"))
        if errors != "0" or (created == "0" and altered == "0" and not error):
            return {"status": "Failed", "voucher": voucher, "error": error or f"Tally did not create the voucher. CREATED={created}, ALTERED={altered}, ERRORS={errors}"}
        if created == "0" and error:
            return {"status": "Failed", "voucher": voucher, "error": error}
        if not voucher:
            voucher = fetch_voucher_number(port, company, job_no, date_value, timeout)
        return {"status": "Posted", "voucher": voucher or job_no, "error": None}
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        return {"status": "Failed", "voucher": None, "error": str(exc)}


def create_stock_item(port, company, item_name, uom, timeout):
    """Create a minimal Tally stock item when the company does not have it yet."""
    item = str(item_name or "").strip()
    units = str(uom or "PCS").strip() or "PCS"
    if not item:
        raise ValueError("Cannot create a stock item without a name")
    payload = f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><STOCKITEM NAME=\"{escape(item)}\" ACTION=\"Create\"><NAME.LIST><NAME>{escape(item)}</NAME></NAME.LIST><BASEUNITS>{escape(units)}</BASEUNITS><ISBATCHWISEON>No</ISBATCHWISEON><ISPERISHABLEON>No</ISPERISHABLEON><GSTAPPLICABLE>Not Applicable</GSTAPPLICABLE></STOCKITEM></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}", data=payload.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
        root = ET.fromstring(body)
        errors = root.findtext(".//ERRORS") or "0"
        line_error = root.findtext(".//LINEERROR") or root.findtext(".//ERROR")
        if errors != "0" or line_error:
            raise RuntimeError(line_error or f"Tally could not create stock item {item} (ERRORS={errors})")
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        raise RuntimeError(f"Unable to create Tally stock item {item}: {exc}") from exc


def create_voucher_type(port, company, voucher_type, timeout):
    """Create the inventory-enabled Manufacturing Journal voucher type if needed."""
    name = str(voucher_type or "").strip()
    if not name:
        raise ValueError("Cannot create a voucher type without a name")
    payload = f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><VOUCHERTYPE NAME=\"{escape(name)}\" ACTION=\"Create\"><NAME.LIST><NAME>{escape(name)}</NAME></NAME.LIST><PARENT>Journal</PARENT><NUMBERINGMETHOD>Automatic</NUMBERINGMETHOD><PREVENTDUPLICATES>Yes</PREVENTDUPLICATES><ISOPTIONAL>No</ISOPTIONAL><ISINVOICE>No</ISINVOICE><ISACCOUNTINGVOUCHER>Yes</ISACCOUNTINGVOUCHER><ISINVENTORYVOUCHER>Yes</ISINVENTORYVOUCHER><USEFORITEMCOSTING>No</USEFORITEMCOSTING><USEFORJOBWORK>No</USEFORJOBWORK></VOUCHERTYPE></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}", data=payload.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
        root = ET.fromstring(body)
        errors = root.findtext(".//ERRORS") or "0"
        line_error = root.findtext(".//LINEERROR") or root.findtext(".//ERROR")
        if errors != "0" or line_error:
            raise RuntimeError(line_error or f"Tally could not create voucher type {name} (ERRORS={errors})")
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        raise RuntimeError(f"Unable to create Tally voucher type {name}: {exc}") from exc


def ensure_voucher_type(port, company, voucher_type, timeout):
    try:
        create_voucher_type(port, company, voucher_type, timeout)
    except RuntimeError as exc:
        if not any(text in str(exc).lower() for text in ("already exist", "duplicate entry")):
            raise


def ensure_stock_items(port, company, row, timeout):
    required = {"Corrugated Board": str(row.get("uom") or "PCS").strip() or "PCS"}
    for component in row.get("components") or []:
        item = str(component.get("materialName") or component.get("erpCode") or "").strip()
        if item:
            required[item] = "KGS"
    for item, uom in required.items():
        try:
            create_stock_item(port, company, item, uom, timeout)
        except RuntimeError as exc:
            if not any(text in str(exc).lower() for text in ("already exist", "duplicate entry")):
                raise


def get_port_and_company(connection):
    port_override = os.environ.get("MFJ_FIRM1_TALLY_PORT", "").strip()
    cursor = connection.cursor()
    if port_override:
        cursor.execute("SELECT firmName FROM firms WHERE tallyPortNo = %s LIMIT 1", (port_override,))
    else:
        cursor.execute("""SELECT firmName, tallyPortNo FROM firms
            WHERE COALESCE(TRIM(tallyPortNo), '') <> ''
              AND (LOWER(REPLACE(REPLACE(REPLACE(TRIM(firmName), '-', ''), ' ', ''), '_', '')) = 'uniti'
                   OR UPPER(TRIM(COALESCE(shortName, ''))) IN ('LNCB-1', 'UNIT-1', 'UNIT1'))
            ORDER BY id LIMIT 1""")
    rows = dict_rows(cursor, cursor.fetchall())
    cursor.close()
    if not rows:
        raise RuntimeError("Configure firms.tallyPortNo or set MFJ_FIRM1_TALLY_PORT.")
    return port_override or str(rows[0]["tallyPortNo"]), str(rows[0].get("firmName") or "Firm-1")


def get_rows(connection, date_filter=None, job_filter=None, retry=False):
    clauses = [
        "LOWER(TRIM(COALESCE(pp.machineName, ''))) IN ('corrugation liner', 'corrugation linear')",
        "LOWER(TRIM(COALESCE(pp.completionStatus, 'Full'))) = 'full'",
    ]
    if not retry:
        clauses.append("LOWER(TRIM(COALESCE(pp.tallyPostingStatus, ''))) NOT IN ('posted', 'completed')")
    params = []
    if date_filter:
        clauses.append("pp.date = %s"); params.append(date_filter)
    if job_filter:
        clauses.append("CAST(pp.jobNo AS CHAR) = %s"); params.append(job_filter)
    sql = f"""SELECT pp.id, pp.productionId, pp.date, pp.jobNo, pp.qty, pp.completionStatus, pp.tallyPostingStatus, p.erpCode AS productionErp, p.itemId, p.uom FROM production_processing pp LEFT JOIN productions p ON p.id = pp.productionId WHERE {' AND '.join(clauses)} ORDER BY pp.date, pp.id"""
    cursor = connection.cursor(); cursor.execute(sql, tuple(params))
    rows = dict_rows(cursor, cursor.fetchall()); cursor.close()
    return rows


def get_components(connection, row):
    """Return net reel consumption, matching returns by production/job and reel identity."""
    production_id = str(row.get("productionId") or "").strip()
    job_no = str(row.get("jobNo") or "").strip()
    cursor = connection.cursor()
    cursor.execute("""SELECT mir.packingSlipId, mir.ourReelNo, mir.weightKg, mir.materialId,
                             m.erpCode, m.name AS materialName, m.uom,
                             COALESCE(NULLIF(mil.rate, 0), NULLIF(mil.lastPurchaseRate, 0),
                                      NULLIF(mil.openingRate, 0), NULLIF(ps.openingRate, 0),
                                      NULLIF(m.openingRate, 0), 32) AS rate
                      FROM material_issue_reel_lines mir
                      LEFT JOIN material_issue_lines mil ON mil.id = mir.materialIssueLineId
                      LEFT JOIN materials m ON m.id = mir.materialId
                      LEFT JOIN material_in_packing_slips ps ON ps.id = mir.packingSlipId
                      WHERE mir.productionId = %s OR LOWER(TRIM(mir.jobNo)) = LOWER(TRIM(%s))
                      ORDER BY mir.id""", (production_id, job_no))
    issues = dict_rows(cursor, cursor.fetchall())
    cursor.execute("""SELECT packingSlipId, ourReelNo, weightKg
                      FROM material_return_reel_lines
                      WHERE productionId = %s OR LOWER(TRIM(jobNo)) = LOWER(TRIM(%s))""", (production_id, job_no))
    returns = dict_rows(cursor, cursor.fetchall())
    cursor.close()

    returned_by_slip = {}
    returned_by_reel = {}
    for returned in returns:
        weight = Decimal(str(returned.get("weightKg") or "0"))
        returned_by_slip[str(returned.get("packingSlipId") or "").strip()] = returned_by_slip.get(str(returned.get("packingSlipId") or "").strip(), Decimal("0")) + weight
        reel_no = str(returned.get("ourReelNo") or "").strip().lower()
        if reel_no:
            returned_by_reel[reel_no] = returned_by_reel.get(reel_no, Decimal("0")) + weight

    components = []
    for issue in issues:
        issued = Decimal(str(issue.get("weightKg") or "0"))
        slip = str(issue.get("packingSlipId") or "").strip()
        reel_no = str(issue.get("ourReelNo") or "").strip()
        returned = returned_by_slip.get(slip, returned_by_reel.get(reel_no.lower(), Decimal("0")))
        remaining = issued - returned
        if remaining > 0:
            components.append({**issue, "quantityKg": remaining})
    return components


def save_result(connection, row_id, result, timestamp):
    cursor = connection.cursor()
    cursor.execute("""UPDATE production_processing SET tallyPostingStatus=%s, tallyTimestamp=%s, tallyVoucherNo=%s, tallyVoucherDate=%s, tallyPostingRemark=%s, tallyPostingError=%s WHERE id=%s""", (result["status"], timestamp, result.get("voucher"), timestamp[:10], "Firm-1 Corrugation Liner Manufacturing Journal", result.get("error"), row_id))
    connection.commit(); cursor.close()


def main():
    load_env()
    parser = argparse.ArgumentParser(description="Post Firm-1 Corrugation Liner entries to Tally")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date")
    parser.add_argument("--job")
    parser.add_argument("--retry", action="store_true", help="Retry rows already marked Posted/Completed")
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    connection = connect_db()
    try:
        port, company = get_port_and_company(connection)
        rows = get_rows(connection, args.date, args.job, args.retry)
        print(f"Firm-1 Tally port: {port}; eligible rows: {len(rows)}")
        for row in rows:
            try:
                row["components"] = get_components(connection, row)
                payload = voucher_xml(row, company)
                if args.dry_run:
                    print(f"DRY-RUN job={row.get('jobNo')}\n{payload}")
                    continue
                ensure_stock_items(port, company, row, args.timeout)
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
