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


def voucher_xml(row, company):
    job = str(row.get("jobNo") or "").strip()
    item = str(row.get("itemName") or row.get("erp") or row.get("productionErp") or "").strip()
    qty = Decimal(str(row.get("qty") or "0"))
    if not job or not item or qty <= 0:
        raise ValueError("Job number, item/ERP, and positive quantity are required")
    quantity = format(qty, "f")
    uom = str(row.get("uom") or "PCS")
    narration = f"Unit-1 Corrugation Liner | Job {job}"
    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><VOUCHER ACTION=\"Create\" VCHTYPE=\"Manufacturing Journal\" OBJVIEW=\"Multi Consumption Voucher View\"><DATE>{tally_date(row.get('date'))}</DATE><VOUCHERNUMBER>{escape(job)}</VOUCHERNUMBER><VOUCHERTYPENAME>Manufacturing Journal</VOUCHERTYPENAME><PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW><NARRATION>{escape(narration)}</NARRATION><REFERENCE>{escape(job)}</REFERENCE><ISINVOICE>No</ISINVOICE><INVENTORYENTRIESIN.LIST><STOCKITEMNAME>{escape(item)}</STOCKITEMNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT><ISTRACKPRODUCTION>No</ISTRACKPRODUCTION><ISPRIMARYITEM>No</ISPRIMARYITEM><ACTUALQTY>{escape(quantity)} {escape(uom)}</ACTUALQTY><BILLEDQTY>{escape(quantity)} {escape(uom)}</BILLEDQTY><BATCHALLOCATIONS.LIST><GODOWNNAME>Main Location</GODOWNNAME><BATCHNAME>Primary Batch</BATCHNAME><ACTUALQTY>{escape(quantity)} {escape(uom)}</ACTUALQTY><BILLEDQTY>{escape(quantity)} {escape(uom)}</BILLEDQTY></BATCHALLOCATIONS.LIST></INVENTORYENTRIESIN.LIST></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""


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
    sql = f"""SELECT pp.id, pp.date, pp.jobNo, pp.qty, pp.completionStatus, pp.tallyPostingStatus, p.erpCode AS productionErp, p.itemId, p.uom FROM production_processing pp LEFT JOIN productions p ON p.id = pp.productionId WHERE {' AND '.join(clauses)} ORDER BY pp.date, pp.id"""
    cursor = connection.cursor(); cursor.execute(sql, tuple(params))
    rows = dict_rows(cursor, cursor.fetchall()); cursor.close()
    return rows


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
                payload = voucher_xml(row, company)
                if args.dry_run:
                    print(f"DRY-RUN job={row.get('jobNo')}\n{payload}")
                    continue
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
