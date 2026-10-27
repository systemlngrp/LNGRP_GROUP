#!/usr/bin/env python3
"""Post daily material consumption issues for any configured firm to Tally."""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import OrderedDict
from decimal import Decimal
from xml.sax.saxutils import escape

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MFJ_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "mfj"))
if MFJ_DIR not in sys.path:
    sys.path.insert(0, MFJ_DIR)

from mfjFirm1 import (  # noqa: E402
    connect_db,
    create_stock_item,
    dict_rows,
    ensure_voucher_type,
    load_env,
    post_tally,
)


VOUCHER_TYPE = "Consumption Journal"


def _local_name(tag):
    return str(tag).rsplit("}", 1)[-1].upper()


def _first_text(element, names):
    if element is None:
        return None
    wanted = {str(name).upper() for name in names}
    for child in element.iter():
        if _local_name(child.tag) in wanted and (child.text or "").strip():
            return child.text.strip()
    return None


def _valid_xml_character(codepoint):
    return codepoint in (0x09, 0x0A, 0x0D) or (
        0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def clean_tally_xml(response_text):
    cleaned = "".join(char for char in response_text if _valid_xml_character(ord(char)))

    def clean_reference(match):
        value = match.group(1)
        codepoint = int(value[1:], 16) if value.lower().startswith("x") else int(value)
        return match.group(0) if _valid_xml_character(codepoint) else ""

    return re.sub(r"&#(x[0-9a-fA-F]+|[0-9]+);", clean_reference, cleaned, flags=re.IGNORECASE)


def tally_xml_date(value):
    return dt.datetime.strptime(str(value)[:10], "%Y-%m-%d").strftime("%Y%m%d")


def _money(value):
    return format(Decimal(str(value or "0")).quantize(Decimal("0.01")), "f")


def normalize_uom(value):
    uom = str(value or "").strip()
    return "KGS" if uom.upper() == "KG" else uom


def _is_without_job(issue_type):
    normalized = str(issue_type or "").strip().lower().replace("_", " ")
    return normalized in {"general", "without job", "withoutjob"}


def get_port_and_company(connection, firm_number=1):
    firms = {
        1: {
            "label": "Firm-1",
            "unit": "Unit-I",
            "env": "CONSUMPTION_FIRM1_TALLY_PORT",
            "names": ("uniti", "unit1"),
            "short_names": ("LNCB-1", "UNIT-1", "UNIT1"),
        },
        2: {
            "label": "Firm-2",
            "unit": "Unit-II",
            "env": "CONSUMPTION_FIRM2_TALLY_PORT",
            "names": ("unitii", "unit2"),
            "short_names": ("LNCB-2", "UNIT-2", "UNIT2"),
        },
        3: {
            "label": "Firm-3",
            "unit": "Firm-3 (LNKI)",
            "env": "CONSUMPTION_FIRM3_TALLY_PORT",
            "names": ("laxminarayankraftindustries", "lnki"),
            "short_names": ("LNKI",),
        },
    }
    if firm_number not in firms:
        raise ValueError(f"Unsupported consumption firm number: {firm_number}")
    firm = firms[firm_number]
    override = os.environ.get(firm["env"], "").strip()
    cursor = connection.cursor()
    if override:
        cursor.execute("SELECT firmName FROM firms WHERE tallyPortNo = %s LIMIT 1", (override,))
    else:
        name_conditions = " OR ".join(
            "LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(firmName, '')), '-', ''), ' ', ''), '_', '')) = %s"
            for _ in firm["names"]
        )
        short_placeholders = ", ".join("%s" for _ in firm["short_names"])
        cursor.execute(
            f"""SELECT firmName, tallyPortNo FROM firms
               WHERE COALESCE(TRIM(tallyPortNo), '') <> ''
                 AND ({name_conditions}
                      OR UPPER(TRIM(COALESCE(shortName, ''))) IN ({short_placeholders}))
               ORDER BY id LIMIT 1""",
            (*firm["names"], *(name.upper() for name in firm["short_names"])),
        )
    rows = dict_rows(cursor, cursor.fetchall())
    cursor.close()
    if not rows:
        raise RuntimeError(
            f"Configure {firm['unit']} firms.tallyPortNo or set {firm['env']}."
        )
    return override or str(rows[0]["tallyPortNo"]), str(rows[0].get("firmName") or firm["label"])


def get_rows(connection, date_filter=None, transaction_filter=None, retry=False):
    clauses = [
        "LOWER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(mi.issueType, '')), '_', ' '), '-', ' '), '  ', ' ')) IN ('general', 'without job', 'withoutjob')",
        "COALESCE(TRIM(mi.consumptionTransactionNo), '') <> ''",
        "COALESCE(TRIM(mi.tallyTimestamp), '') = ''",
        "LOWER(TRIM(COALESCE(mi.tallyPostingStatus, ''))) NOT IN ('cancelled', 'not applicable')",
    ]
    if not retry:
        clauses.append("LOWER(TRIM(COALESCE(mi.tallyPostingStatus, ''))) NOT IN ('posted', 'completed')")
    params = []
    if date_filter:
        clauses.append("mi.date = %s")
        params.append(date_filter)
    if transaction_filter:
        clauses.append("CAST(mi.consumptionTransactionNo AS CHAR) = %s")
        params.append(transaction_filter)
    sql = f"""SELECT mi.id AS issueId, mi.issueNo, mi.consumptionTransactionNo,
        mi.date, mi.issueType, mi.jobNo, mi.remarks, mi.tallyPostingStatus,
        mil.id AS lineId, mil.materialId, mil.qty, mil.uom,
        COALESCE(NULLIF(mil.rate, 0), NULLIF(mil.lastPurchaseRate, 0),
                 NULLIF(m.openingRate, 0),
                 NULLIF(m.openingValue, 0) / NULLIF(m.openingQty, 0), 0) AS rate,
        mil.amount, m.name AS materialName, m.erpCode AS materialErp
        FROM material_issues mi
        JOIN material_issue_lines mil ON mil.materialIssueId = mi.id
        LEFT JOIN materials m ON m.id = mil.materialId
        WHERE {' AND '.join(clauses)}
        ORDER BY mi.date, mi.id, mil.id"""
    cursor = connection.cursor()
    cursor.execute(sql, tuple(params))
    rows = dict_rows(cursor, cursor.fetchall())
    cursor.close()
    return rows


def group_rows(rows):
    grouped = OrderedDict()
    for row in rows:
        issue_id = str(row.get("issueId") or "").strip()
        if not issue_id:
            continue
        issue = grouped.setdefault(
            issue_id,
            {
                "id": issue_id,
                "issueNo": row.get("issueNo"),
                "consumptionTransactionNo": row.get("consumptionTransactionNo"),
                "date": row.get("date"),
                "issueType": row.get("issueType"),
                "jobNo": row.get("jobNo"),
                "remarks": row.get("remarks"),
                "lines": [],
            },
        )
        issue["lines"].append(row)
    return list(grouped.values())


def voucher_xml(issue, company):
    transaction_no = str(issue.get("consumptionTransactionNo") or "").strip()
    issue_no = str(issue.get("issueNo") or "").strip()
    date_value = issue.get("date")
    if not transaction_no or not issue_no or not date_value:
        raise ValueError("Consumption transaction number, issue number, and date are required")
    if not issue.get("lines"):
        raise ValueError(f"No material lines found for issue {issue_no}")

    narration = str(issue.get("remarks") or "").strip() or f"Daily Consumption | Issue {issue_no}"
    entries = []
    for line in issue["lines"]:
        item = str(line.get("materialName") or line.get("materialErp") or "").strip()
        uom = normalize_uom(line.get("uom"))
        qty = Decimal(str(line.get("qty") or "0"))
        rate = Decimal(str(line.get("rate") or "0"))
        if not item:
            raise ValueError(f"Material name is missing for issue {issue_no}")
        if not uom:
            raise ValueError(f"UOM is missing for {item}")
        if qty <= 0:
            raise ValueError(f"Positive quantity is required for {item}")
        if rate <= 0:
            raise ValueError(f"Material rate is missing for {item}")
        quantity = _money(qty)
        item_rate = _money(rate)
        amount = _money(qty * rate)
        entries.append(
            f"<INVENTORYENTRIESOUT.LIST><STOCKITEMNAME>{escape(item)}</STOCKITEMNAME>"
            f"<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><ISTRACKCOMPONENT>No</ISTRACKCOMPONENT>"
            f"<ISTRACKPRODUCTION>No</ISTRACKPRODUCTION><ISPRIMARYITEM>No</ISPRIMARYITEM>"
            f"<ACTUALQTY>{quantity} {escape(uom)}</ACTUALQTY><BILLEDQTY>{quantity} {escape(uom)}</BILLEDQTY>"
            f"<RATE>{item_rate}/{escape(uom)}</RATE><AMOUNT>{amount}</AMOUNT></INVENTORYENTRIESOUT.LIST>"
        )

    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF=\"TallyUDF\"><VOUCHER ACTION=\"Create\" VCHTYPE=\"{VOUCHER_TYPE}\" OBJVIEW=\"Consumption Voucher View\"><DATE>{tally_xml_date(date_value)}</DATE><VOUCHERNUMBER>{escape(transaction_no)}</VOUCHERNUMBER><VOUCHERTYPENAME>{VOUCHER_TYPE}</VOUCHERTYPENAME><PERSISTEDVIEW>Consumption Voucher View</PERSISTEDVIEW><NARRATION>{escape(narration)}</NARRATION><REFERENCE>{escape(issue_no)}</REFERENCE><ISINVOICE>No</ISINVOICE><ISINVENTORYVOUCHER>Yes</ISINVENTORYVOUCHER>{''.join(entries)}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"""


def find_existing_voucher(port, company, transaction_no, issue_no, date_value, timeout):
    tally_day = tally_xml_date(date_value)
    request_xml = f'''<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{escape(company)}</SVCURRENTCOMPANY><SVFROMDATE>{tally_day}</SVFROMDATE><SVTODATE>{tally_day}</SVTODATE><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC><REQUESTDATA></REQUESTDATA></EXPORTDATA></BODY></ENVELOPE>'''
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        data=request_xml.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
        root = ET.fromstring(clean_tally_xml(body))
        if _local_name(root.tag) != "ENVELOPE" or root.find("BODY") is None:
            raise RuntimeError("Tally Voucher Register returned an unexpected response")
        header = root.find("HEADER")
        if _first_text(header, ("STATUS",)) == "0":
            raise RuntimeError("Tally Voucher Register rejected the query")
        error = _first_text(root, ("LINEERROR", "ERROR"))
        if error:
            raise RuntimeError(f"Tally Voucher Register rejected the query: {error}")
    except (urllib.error.URLError, TimeoutError, OSError, ET.ParseError) as exc:
        raise RuntimeError(f"Unable to query Tally Voucher Register: {exc}") from exc

    wanted_transaction = str(transaction_no).strip()
    wanted_issue = str(issue_no).strip()
    for voucher in root.iter():
        if _local_name(voucher.tag) != "VOUCHER":
            continue
        voucher_type = _first_text(voucher, ("VOUCHERTYPENAME", "VCHTYPE")) or voucher.attrib.get("VCHTYPE")
        if voucher_type and voucher_type.strip().lower() != VOUCHER_TYPE.lower():
            continue
        reference = _first_text(voucher, ("REFERENCE", "REFERENCE NUMBER"))
        number = _first_text(voucher, ("VOUCHERNUMBER", "VOUCHERNO", "NUMBER"))
        if (reference and reference.strip() == wanted_issue) or (number and number.strip() == wanted_transaction):
            identity = {
                name: voucher.attrib.get(name) or _first_text(voucher, (name,))
                for name in ("REMOTEID", "VCHKEY", "MASTERID", "ALTERID")
            }
            return {"voucher": number or wanted_transaction, **{k: v for k, v in identity.items() if v}}
    return None


def _ignore_duplicate_error(error):
    return any(text in str(error).lower() for text in ("already exist", "duplicate entry"))


def ensure_issue_stock_items(port, company, issue, timeout):
    seen = set()
    for line in issue["lines"]:
        item = str(line.get("materialName") or line.get("materialErp") or "").strip()
        if item.lower() in seen:
            continue
        seen.add(item.lower())
        try:
            create_stock_item(port, company, item, normalize_uom(line.get("uom")) or "PCS", timeout)
        except RuntimeError as exc:
            if not _ignore_duplicate_error(exc):
                raise


def save_result(connection, issue_id, result, timestamp, voucher_date=None, firm_label="Firm-1"):
    cursor = connection.cursor()
    status = str(result.get("status") or "Failed")
    posted = status.lower() == "posted"
    cursor.execute(
        """UPDATE material_issues SET tallyTimestamp=%s, tallyPostingStatus=%s,
           tallyVoucherNo=%s, tallyVoucherDate=%s, tallyVoucherType=%s,
           tallyPostingRemark=%s, tallyPostingError=%s, tallyLastAttemptAt=%s,
           tallyPostingAttemptCount=COALESCE(tallyPostingAttemptCount, 0) + 1
           WHERE id=%s""",
        (
            timestamp if posted else None,
            "Posted" if posted else "Failed",
            result.get("voucher"),
            str(voucher_date or timestamp[:10])[:10] if posted else None,
            VOUCHER_TYPE,
            f"{firm_label} Daily Consumption Journal",
            None if posted else result.get("error"),
            timestamp,
            issue_id,
        ),
    )
    connection.commit()
    cursor.close()


def print_result(issue, result, firm_label="Firm-1"):
    transaction_no = str(issue.get("consumptionTransactionNo") or issue.get("issueNo") or "-").strip()
    if str(result.get("status") or "").lower() == "posted":
        print(f"[SUCCESS] {firm_label} | Consumption: {transaction_no} | Consumption Journal posted | Voucher: {result.get('voucher') or '-'}")
    else:
        print(f"[FAILED] {firm_label} | Consumption: {transaction_no} | {result.get('error') or 'Tally did not post the voucher'}")


def main(firm_number=None):
    load_env()
    default_firm = firm_number or 1
    parser = argparse.ArgumentParser(description="Post daily consumption issues for a configured firm to Tally")
    parser.add_argument("--firm", type=int, choices=(1, 2, 3), default=default_firm, help="Firm number (default: 1)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date")
    parser.add_argument("--transaction")
    parser.add_argument("--retry", action="store_true")
    parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args()
    firm_number = args.firm
    firm_label = f"Firm-{firm_number}"

    connection = connect_db()
    try:
        port, company = get_port_and_company(connection, firm_number)
        issues = group_rows(get_rows(connection, args.date, args.transaction, args.retry))
        print(f"{firm_label} Consumption Tally port: {port}; eligible issues: {len(issues)}")
        for issue in issues:
            try:
                payload = voucher_xml(issue, company)
                if args.dry_run:
                    print(f"[DRY-RUN] {firm_label} | Consumption: {issue.get('consumptionTransactionNo') or '-'}\n{payload}")
                    continue

                existing = find_existing_voucher(
                    port,
                    company,
                    issue.get("consumptionTransactionNo"),
                    issue.get("issueNo"),
                    issue.get("date"),
                    args.timeout,
                )
                if existing:
                    result = {"status": "Posted", "voucher": existing.get("voucher"), "error": None}
                else:
                    ensure_voucher_type(port, company, VOUCHER_TYPE, args.timeout)
                    ensure_issue_stock_items(port, company, issue, args.timeout)
                    result = post_tally(
                        port,
                        payload,
                        company,
                        issue.get("consumptionTransactionNo"),
                        issue.get("date"),
                        args.timeout,
                    )
                timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
                save_result(connection, issue["id"], result, timestamp, issue.get("date"), firm_label)
                print_result(issue, result, firm_label)
            except Exception as exc:
                if not args.dry_run:
                    save_result(
                        connection,
                        issue["id"],
                        {"status": "Failed", "voucher": None, "error": str(exc)},
                        dt.datetime.now(dt.timezone.utc).isoformat(),
                        issue.get("date"),
                        firm_label,
                    )
                print(f"[FAILED] {firm_label} | Consumption: {issue.get('consumptionTransactionNo') or '-'} | {exc}")
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
