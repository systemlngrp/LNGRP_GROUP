import argparse
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

import mysql.connector
import requests
from requests import exceptions as requests_exceptions


SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent
REQUEST_TIMEOUT = 30
MONEY_Q = Decimal("0.01")


class TallyUnavailableError(RuntimeError):
    pass


class TallyImportError(RuntimeError):
    pass


@dataclass
class CreditNoteLine:
    item_name: str
    qty: Decimal
    rate: Decimal
    gst_rate: Decimal
    unit: str = "NOS"

    @property
    def amount(self) -> Decimal:
        return round_money(self.qty * self.rate)


@dataclass
class CreditNote:
    mrr_id: str
    mrr_no: str
    voucher_no: str
    date: str
    invoice_no: str
    party_ledger: str
    sales_ledger: str
    cgst_ledger: str
    sgst_ledger: str
    igst_ledger: str
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    round_off: Decimal
    lines: list[CreditNoteLine]

    @property
    def taxable_amount(self) -> Decimal:
        return round_money(sum((line.amount for line in self.lines), Decimal("0")))

    @property
    def total_amount(self) -> Decimal:
        return round_money(self.taxable_amount + self.cgst_amount + self.sgst_amount + self.igst_amount + self.round_off)


def candidate_env_paths() -> list[Path]:
    paths: list[Path] = []
    explicit_env = os.getenv("LNPI_ENV_FILE")
    if explicit_env:
        paths.append(Path(explicit_env).expanduser())

    paths.extend(
        [
            Path.cwd() / ".env",
            SCRIPT_DIR / ".env",
            SCRIPT_DIR / "Data Backups" / ".env",
            BASE_DIR / ".env",
            Path("D:/lnpi/.env"),
        ]
    )

    unique_paths: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        try:
            key = str(path.resolve())
        except OSError:
            key = str(path)
        if key not in seen:
            seen.add(key)
            unique_paths.append(path)
    return unique_paths


def find_env_file() -> Path | None:
    for env_path in candidate_env_paths():
        if env_path.is_file():
            return env_path
    return None


def load_env_file() -> Path | None:
    env_path = find_env_file()
    if env_path is None:
        return None

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
    return env_path


LOADED_ENV_PATH = load_env_file()

BUILTIN_DB_CONFIG = {
    "host": "193.203.184.152",
    "port": "3306",
    "user": "u380633007_lnpidata",
    "password": "!Office1@",
    "database": "u380633007_lnpidata",
}

COMPANY_NAME = os.getenv("LNPI_TALLY_COMPANY", "")
TALLY_ACTION = os.getenv("LNPI_TALLY_ACTION", "Create")
SALES_LEDGER_NAME = os.getenv("SALES_LEDGER_NAME", "Sales")
SALES_5_LEDGER_NAME = os.getenv("SALES_5_LEDGER_NAME", "SALES 5%")
SALES_18_LEDGER_NAME = os.getenv("SALES_18_LEDGER_NAME", "SALES 18%")
ROUND_OFF_LEDGER_NAME = os.getenv("SALES_ROUND_OFF_LEDGER_NAME", "Round Off")
CGST_LEDGER_NAME = os.getenv("OUTPUT_CGST_LEDGER_NAME", "Output CGST")
SGST_LEDGER_NAME = os.getenv("OUTPUT_SGST_LEDGER_NAME", "Output SGST")
IGST_LEDGER_NAME = os.getenv("OUTPUT_IGST_LEDGER_NAME", "Output IGST")
CGST_LEDGER_PREFIX = os.getenv("CGST_LEDGER_PREFIX", "Tax - CGST @")
SGST_LEDGER_PREFIX = os.getenv("SGST_LEDGER_PREFIX", "Tax - SGST @")
IGST_LEDGER_PREFIX = os.getenv("IGST_LEDGER_PREFIX", "Tax - IGST @")



def format_tax_rate(rate: Any) -> str:
    value = to_decimal(rate)
    if value == value.to_integral_value():
        return f"{value:.1f}%"
    return f"{value.normalize()}%"


def resolve_tax_ledger_name(prefix: str, rate: Any, fallback_name: str) -> str:
    rate_value = round_money(rate)
    if rate_value <= 0:
        return fallback_name
    return f"{prefix} {format_tax_rate(rate_value)}"


def derive_tax_rate(lines: list[CreditNoteLine], tax_type: str) -> Decimal:
    gst_rates = [line.gst_rate for line in lines if line.gst_rate > 0]
    if not gst_rates:
        return Decimal("0")
    gst_rate = max(gst_rates)
    if tax_type in ("cgst", "sgst"):
        return round_money(gst_rate / Decimal("2"))
    return round_money(gst_rate)


def resolve_sales_ledger_name(lines: list[CreditNoteLine]) -> str:
    gst_rates = [line.gst_rate for line in lines if line.gst_rate > 0]
    effective_gst_rate = max(gst_rates) if gst_rates else Decimal("0")
    if abs(effective_gst_rate - Decimal("5")) < Decimal("0.01"):
        return SALES_5_LEDGER_NAME
    if abs(effective_gst_rate - Decimal("18")) < Decimal("0.01"):
        return SALES_18_LEDGER_NAME
    return SALES_LEDGER_NAME

def build_tally_url_candidates(port: int | str = 9004) -> list[str]:
    candidates: list[str] = []
    for url in (f"http://localhost:{port}", f"http://127.0.0.1:{port}"):
        cleaned = str(url or "").strip()
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
    return candidates


TALLY_URL_CANDIDATES = build_tally_url_candidates()
ACTIVE_TALLY_URL: str | None = None


def get_db_config() -> dict[str, Any]:
    def configured_value(*keys: str, fallback: str) -> str:
        for key in keys:
            value = str(os.getenv(key) or "").strip()
            if value and not value.lower().startswith("your-"):
                return value
        return fallback

    config = {
        "host": configured_value("LNPI_DB_HOST", "DB_HOST", fallback=BUILTIN_DB_CONFIG["host"]),
        "user": configured_value("LNPI_DB_USER", "DB_USER", fallback=BUILTIN_DB_CONFIG["user"]),
        "password": configured_value("LNPI_DB_PASSWORD", "DB_PASSWORD", fallback=BUILTIN_DB_CONFIG["password"]),
        "database": configured_value("LNPI_DB_NAME", "DB_NAME", fallback=BUILTIN_DB_CONFIG["database"]),
        "port": int(configured_value("LNPI_DB_PORT", "DB_PORT", fallback=BUILTIN_DB_CONFIG["port"])),
        "use_pure": True,
    }
    missing = [key for key in ("host", "user", "password", "database") if not config.get(key)]
    if missing:
        checked_paths = ", ".join(str(path) for path in candidate_env_paths())
        raise RuntimeError(
            "Missing DB config: "
            + ", ".join(missing)
            + ". Set LNPI_DB_HOST, LNPI_DB_USER, LNPI_DB_PASSWORD, LNPI_DB_NAME "
            + "in PowerShell or an .env file. Checked: "
            + checked_paths
        )
    return config


def get_db_connection():
    config = get_db_config()
    try:
        return mysql.connector.connect(**config)
    except mysql.connector.Error as error:
        raise RuntimeError(
            f"Cannot connect Hostinger MySQL {config['host']}:{config['port']} DB={config['database']} USER={config['user']}. Error: {error}"
        ) from error


def esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=False)


def to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def round_money(value: Any) -> Decimal:
    return to_decimal(value).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def money(value: Any) -> str:
    return f"{round_money(value):.2f}"


def narration_money(value: Any) -> str:
    return f"{round_money(value):,.2f}"


def narration_date(tally_date: str) -> str:
    try:
        return datetime.strptime(str(tally_date), "%Y%m%d").strftime("%d-%b-%Y")
    except ValueError:
        return str(tally_date or "")


def normalize_date_for_tally(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return datetime.now().strftime("%Y%m%d")
    if re.fullmatch(r"\d{8}", text):
        return text
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text[:19], fmt).strftime("%Y%m%d")
        except ValueError:
            pass
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        return "".join(match.groups())
    return datetime.now().strftime("%Y%m%d")


def parse_lines(raw_lines: Any) -> list[dict[str, Any]]:
    if isinstance(raw_lines, list):
        return raw_lines
    if not raw_lines:
        return []
    try:
        parsed = json.loads(raw_lines)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def first_non_empty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def resolve_party_name(conn, party_id: str) -> str:
    cursor = conn.cursor(dictionary=True)
    try:
        for table in ("suppliers", "companies"):
            cursor.execute(f"SELECT `name` FROM `{table}` WHERE `id` = %s LIMIT 1", (party_id,))
            row = cursor.fetchone()
            name = str((row or {}).get("name") or "").strip()
            if name:
                return name
    finally:
        cursor.close()
    return party_id


def resolve_item_name(conn, line: dict[str, Any]) -> str:
    direct_name = first_non_empty(line.get("itemName"), line.get("materialName"), line.get("name"), line.get("description"))
    if direct_name:
        return direct_name

    item_id = str(line.get("itemId") or line.get("materialId") or line.get("npdId") or "").strip()
    if not item_id:
        return "FG Item"

    cursor = conn.cursor(dictionary=True)
    try:
        for table in ("items", "npd", "php_item_master", "plate_item_master", "materials"):
            try:
                cursor.execute(f"SELECT `name` FROM `{table}` WHERE `id` = %s LIMIT 1", (item_id,))
                row = cursor.fetchone()
                name = str((row or {}).get("name") or "").strip()
                if name:
                    return name
            except mysql.connector.Error:
                continue
    finally:
        cursor.close()
    return item_id



def ensure_credit_tracking_columns(conn) -> None:
    cursor = conn.cursor()
    try:
        for column, column_type in (("creditTallySync", "VARCHAR(255)"), ("creditTallyTimestamp", "VARCHAR(255)"), ("creditRemarkTally", "TEXT")):
            try:
                cursor.execute(f"ALTER TABLE `material_in` ADD COLUMN `{column}` {column_type}")
                conn.commit()
                print(f"Hostinger DB updated: material_in.{column} column added.")
            except mysql.connector.Error as error:
                if getattr(error, "errno", None) == 1060:
                    continue
                raise
    finally:
        cursor.close()
def get_firms(conn) -> list[dict[str, Any]]:
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT id, firmName, shortName, tallyPortNo
               FROM firms
               ORDER BY firmName, id"""
        )
        return list(cursor.fetchall() or [])
    finally:
        cursor.close()


def resolve_firm(
    conn,
    selector: str | None,
    firms: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    firms = get_firms(conn) if firms is None else list(firms)
    if not firms:
        raise RuntimeError("No firms are configured in the firms table.")

    wanted = str(selector or "").strip().casefold()
    matches = [
        firm for firm in firms
        if wanted and wanted in {
            str(firm.get("id") or "").strip().casefold(),
            str(firm.get("firmName") or "").strip().casefold(),
            str(firm.get("shortName") or "").strip().casefold(),
        }
    ]
    if not matches and wanted.isdigit():
        position = int(wanted)
        if 1 <= position <= len(firms):
            matches = [firms[position - 1]]
    if not matches:
        options = ", ".join(
            f"{index}: {firm.get('firmName')} [{firm.get('shortName') or firm.get('id')}]"
            for index, firm in enumerate(firms, 1)
        )
        raise RuntimeError(f"Firm '{selector}' was not found. Available firms: {options}")
    if len(matches) > 1:
        raise RuntimeError(f"Firm selector '{selector}' matches multiple firms; select a firm ID.")

    firm = matches[0]
    firm_id = str(firm.get("id") or "").strip()
    firm_name = str(firm.get("firmName") or "").strip()
    if not firm_id or not firm_name:
        raise RuntimeError("Selected firm configuration is incomplete: firm ID and name are required.")
    try:
        port = int(str(firm.get("tallyPortNo") or "").strip())
    except ValueError as error:
        raise RuntimeError(f"Selected firm '{firm_name}' has no valid Tally port configured.") from error
    if not 1 <= port <= 65535:
        raise RuntimeError(f"Selected firm '{firm_name}' has an invalid Tally port configured.")
    return {**firm, "id": firm_id, "firmName": firm_name, "tallyPortNo": port}


def get_pending_credit_note_rows(
    conn,
    firm_id: str,
    mrr_no: str | None = None,
    limit: int = 1,
) -> list[dict[str, Any]]:
    cursor = conn.cursor(dictionary=True)
    where = [
        "`mrrType` = 'Rejection In'",
        "COALESCE(NULLIF(TRIM(`creditTallyTimestamp`), ''), '') = ''",
        "`firmId` = %s",
    ]
    params: list[Any] = [firm_id]
    if mrr_no:
        where.append("`transactionNo` = %s")
        params.append(mrr_no)

    query = f"""
        SELECT `id`, `transactionNo`, `mrrType`, `date`, `timestamp`, `invoiceNo`, `invDate`,
               `supplierId`, `lines`, `totalCgst`, `totalSgst`, `totalIgst`, `roundOff`, `creditTallySync`, `creditTallyTimestamp`, `creditRemarkTally`
        FROM `material_in`
        WHERE {' AND '.join(where)}
        ORDER BY `date` ASC, `timestamp` ASC, `transactionNo` ASC
        LIMIT %s
    """
    params.append(max(1, int(limit or 1)))
    try:
        cursor.execute(query, tuple(params))
        return list(cursor.fetchall() or [])
    finally:
        cursor.close()


def build_note_lines(conn, raw_lines: list[dict[str, Any]]) -> list[CreditNoteLine]:
    note_lines: list[CreditNoteLine] = []
    for line in raw_lines:
        qty = to_decimal(line.get("actualQty") or line.get("qty") or line.get("invoiceQty"))
        rate = to_decimal(line.get("invoiceRate") or line.get("rate") or line.get("poRate"))
        if qty <= 0 or rate <= 0:
            continue
        note_lines.append(
            CreditNoteLine(
                item_name=resolve_item_name(conn, line),
                qty=qty,
                rate=rate,
                gst_rate=to_decimal(line.get("gstRate")),
                unit=first_non_empty(line.get("uom"), line.get("unit"), "NOS"),
            )
        )
    if not note_lines:
        raise RuntimeError("Rejection In MRR has no valid positive-quantity/rate lines for Credit Note.")
    return note_lines


def build_note_from_db_row(conn, row: dict[str, Any]) -> CreditNote:
    lines = build_note_lines(conn, parse_lines(row.get("lines")))
    party_name = resolve_party_name(conn, str(row.get("supplierId") or ""))
    return CreditNote(
        mrr_id=str(row.get("id") or ""),
        mrr_no=str(row.get("transactionNo") or ""),
        voucher_no="",
        date=datetime.now().strftime("%Y%m%d"),
        invoice_no=str(row.get("invoiceNo") or ""),
        party_ledger=party_name,
        sales_ledger=resolve_sales_ledger_name(lines),
        cgst_ledger=resolve_tax_ledger_name(CGST_LEDGER_PREFIX, derive_tax_rate(lines, "cgst"), CGST_LEDGER_NAME),
        sgst_ledger=resolve_tax_ledger_name(SGST_LEDGER_PREFIX, derive_tax_rate(lines, "sgst"), SGST_LEDGER_NAME),
        igst_ledger=resolve_tax_ledger_name(IGST_LEDGER_PREFIX, derive_tax_rate(lines, "igst"), IGST_LEDGER_NAME),
        cgst_amount=round_money(row.get("totalCgst")),
        sgst_amount=round_money(row.get("totalSgst")),
        igst_amount=round_money(row.get("totalIgst")),
        round_off=round_money(row.get("roundOff")),
        lines=lines,
    )


def build_company_xml() -> str:
    if not COMPANY_NAME.strip():
        return ""
    return f"""
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>{esc(COMPANY_NAME)}</SVCURRENTCOMPANY>
          </STATICVARIABLES>"""


def build_credit_note_narration(note: CreditNote) -> str:
    return (
        f"MRR No: {note.mrr_no} | "
        f"Date: {narration_date(note.date)} | "
        f"Amount: {narration_money(note.total_amount)}"
    )


def build_inventory_entries(note: CreditNote) -> str:
    entries: list[str] = []
    for line in note.lines:
        entries.append(
            f"""
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>{esc(line.item_name)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
              <RATE>{money(line.rate)}/{esc(line.unit)}</RATE>
              <AMOUNT>-{money(line.amount)}</AMOUNT>
              <ACTUALQTY>{money(line.qty)} {esc(line.unit)}</ACTUALQTY>
              <BILLEDQTY>{money(line.qty)} {esc(line.unit)}</BILLEDQTY>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>{esc(note.sales_ledger)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-{money(line.amount)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>"""
        )
    return "\n".join(entries)


def build_credit_note_xml(note: CreditNote) -> str:
    reversal_ledgers = ""
    for ledger, amount in (
        (note.cgst_ledger, note.cgst_amount),
        (note.sgst_ledger, note.sgst_amount),
        (note.igst_ledger, note.igst_amount),
    ):
        if amount:
            reversal_ledgers += f"""
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>{esc(ledger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <LEDGERFROMITEM>No</LEDGERFROMITEM>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <AMOUNT>-{money(amount)}</AMOUNT>
            </LEDGERENTRIES.LIST>"""

    if note.round_off:
        reversal_ledgers += f"""
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>{esc(ROUND_OFF_LEDGER_NAME)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <LEDGERFROMITEM>No</LEDGERFROMITEM>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <AMOUNT>{money(-note.round_off)}</AMOUNT>
            </LEDGERENTRIES.LIST>"""

    inventory_entries = build_inventory_entries(note)

    return f"""<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>{build_company_xml()}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Credit Note" ACTION="{esc(TALLY_ACTION)}" OBJVIEW="Invoice Voucher View">
            <OLDAUDITENTRYIDS.LIST TYPE="Number">
              <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
            </OLDAUDITENTRYIDS.LIST>
            <DATE>{esc(note.date)}</DATE>
            <REFERENCEDATE>{esc(note.date)}</REFERENCEDATE>
            <VCHSTATUSDATE>{esc(note.date)}</VCHSTATUSDATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>{esc(note.voucher_no)}</VOUCHERNUMBER>
            <PARTYNAME>{esc(note.party_ledger)}</PARTYNAME>
            <PARTYLEDGERNAME>{esc(note.party_ledger)}</PARTYLEDGERNAME>
            <REFERENCE>{esc(note.invoice_no or note.mrr_no)}</REFERENCE>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
            <ISINVOICE>Yes</ISINVOICE>
            <EFFECTIVEDATE>{esc(note.date)}</EFFECTIVEDATE>
            <NARRATION>{esc(build_credit_note_narration(note))}</NARRATION>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>{esc(note.party_ledger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <LEDGERFROMITEM>No</LEDGERFROMITEM>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>{money(note.total_amount)}</AMOUNT>
            </LEDGERENTRIES.LIST>{inventory_entries}{reversal_ledgers}
            <GST.LIST></GST.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>"""

def parse_import_summary(response_text: str) -> dict[str, int]:
    summary: dict[str, int] = {}
    for tag in ("CREATED", "ALTERED", "COMBINED", "IGNORED", "DELETED", "CANCELLED", "ERRORS", "EXCEPTIONS"):
        match = re.search(rf"<{tag}>\s*([^<]+?)\s*</{tag}>", response_text or "", flags=re.IGNORECASE)
        if match:
            try:
                summary[tag] = int(str(match.group(1)).strip())
            except ValueError:
                summary[tag] = 0
    return summary


def response_error_message(response_text: str) -> str:
    line_errors = re.findall(r"<LINEERROR>(.*?)</LINEERROR>", response_text or "", flags=re.IGNORECASE | re.DOTALL)
    if line_errors:
        cleaned_errors = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", error))).strip() for error in line_errors]
        return "; ".join(error for error in cleaned_errors if error) or "Tally import failed."

    summary = parse_import_summary(response_text)
    failing_counts = {key: value for key, value in summary.items() if key in ("ERRORS", "EXCEPTIONS", "IGNORED") and value > 0}
    if failing_counts:
        return "Tally import failed: " + ", ".join(f"{key}={value}" for key, value in failing_counts.items())

    compact = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", response_text or ""))).strip()
    return compact[:500] or "Tally returned an empty response."


def assert_tally_import_success(response_text: str) -> None:
    summary = parse_import_summary(response_text)
    if summary.get("CREATED", 0) > 0 or summary.get("ALTERED", 0) > 0:
        return
    if any(summary.get(key, 0) > 0 for key in ("ERRORS", "EXCEPTIONS", "IGNORED")) or "<LINEERROR" in (response_text or "").upper():
        raise TallyImportError(response_error_message(response_text))
    raise TallyImportError("Tally did not confirm credit note creation. " + response_error_message(response_text))


def post_to_tally(xml: str) -> str:
    global ACTIVE_TALLY_URL

    urls_to_try = [ACTIVE_TALLY_URL] if ACTIVE_TALLY_URL else []
    urls_to_try.extend(url for url in TALLY_URL_CANDIDATES if url not in urls_to_try)
    last_error: Exception | None = None

    for url in urls_to_try:
        try:
            response = requests.post(
                url,
                data=xml.encode("utf-8"),
                headers={"Content-Type": "text/xml"},
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            ACTIVE_TALLY_URL = url
            return response.text
        except requests_exceptions.Timeout as error:
            last_error = error
        except requests_exceptions.ConnectionError as error:
            last_error = error
        except requests_exceptions.RequestException as error:
            last_error = error

    raise TallyUnavailableError(
        "Cannot connect to Tally on: "
        + ", ".join(urls_to_try)
        + ". Start Tally, open the correct company, and enable XML/HTTP on one of these ports. "
        + "If Tally is running on another port, set LNPI_TALLY_URL in an .env file or PowerShell."
    ) from last_error


def get_financial_year_bounds(tally_date: str) -> tuple[str, str]:
    parsed = datetime.strptime(tally_date, "%Y%m%d")
    start_year = parsed.year if parsed.month >= 4 else parsed.year - 1
    return f"{start_year}0401", f"{start_year + 1}0331"


def get_next_credit_note_voucher_number(tally_date: str) -> str:
    from_date, to_date = get_financial_year_bounds(tally_date)
    company_variable = (
        f"<SVCURRENTCOMPANY>{esc(COMPANY_NAME)}</SVCURRENTCOMPANY>"
        if COMPANY_NAME.strip()
        else ""
    )
    request_xml = f"""<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>CreditNoteNumbers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        {company_variable}
        <SVFROMDATE>{from_date}</SVFROMDATE>
        <SVTODATE>{to_date}</SVTODATE>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CreditNoteNumbers" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FILTERS>OnlyCreditNotes</FILTERS>
            <FETCH>VoucherNumber</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="OnlyCreditNotes">$VoucherTypeName = "Credit Note"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>"""
    response_text = post_to_tally(request_xml)
    try:
        root = ET.fromstring(response_text.lstrip("\ufeff").strip())
    except ET.ParseError as error:
        raise TallyImportError(f"Cannot read existing Credit Note numbers from Tally: {error}") from error

    numbers: list[int] = []
    for element in root.iter("VOUCHERNUMBER"):
        value = str(element.text or "").strip()
        if re.fullmatch(r"\d+", value):
            numbers.append(int(value))
    highest_number = max(numbers, default=0)
    next_number = highest_number + 1
    print(f"Highest Credit Note voucher number in Tally: {highest_number}")
    print(f"Next Credit Note voucher number: {next_number}")
    return str(next_number)

def mark_posted(conn, note: CreditNote, response_text: str) -> None:
    cursor = conn.cursor()
    try:
        sync_timestamp = datetime.now().isoformat(timespec="seconds")
        cursor.execute(
            """
            UPDATE `material_in`
            SET `creditTallySync` = %s, `creditTallyTimestamp` = %s, `creditRemarkTally` = %s
            WHERE `id` = %s
            """,
            (sync_timestamp, sync_timestamp, f"Credit Note posted to Tally. Response: {response_text[:500]}", note.mrr_id),
        )
        conn.commit()
    finally:
        cursor.close()


def mark_failed(conn, note: CreditNote, error_message: str) -> None:
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE `material_in`
            SET `creditRemarkTally` = %s
            WHERE `id` = %s
            """,
            (f"Credit Note Tally post failed at {datetime.now().isoformat(timespec='seconds')}: {error_message[:700]}", note.mrr_id),
        )
        conn.commit()
    finally:
        cursor.close()


def process_row(conn, row: dict[str, Any], dry_run: bool) -> None:
    note = build_note_from_db_row(conn, row)
    note.voucher_no = "DRY-RUN" if dry_run else get_next_credit_note_voucher_number(note.date)
    xml = build_credit_note_xml(note)
    print(f"MRR: {note.mrr_no}")
    print(f"Credit Note: {note.voucher_no}")
    print(f"Party: {note.party_ledger}")
    print(f"Ledger: {note.sales_ledger}")
    print(f"Lines: {len(note.lines)}")
    print(f"Taxable: {money(note.taxable_amount)}")
    print(f"CGST: {money(note.cgst_amount)} SGST: {money(note.sgst_amount)} IGST: {money(note.igst_amount)} Round Off: {money(note.round_off)}")
    print(f"Total: {money(note.total_amount)}")
    print(xml)
    if dry_run:
        return

    try:
        response_text = post_to_tally(xml)
        assert_tally_import_success(response_text)
    except (TallyUnavailableError, TallyImportError) as error:
        mark_failed(conn, note, str(error))
        print(f"ERROR: {error}")
        raise SystemExit(1) from error

    print("Tally Response:")
    print(response_text)
    mark_posted(conn, note, response_text)
    print("Hostinger DB updated: material_in.creditTallyTimestamp set.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Post Rejection In MRR Credit Note from Hostinger DB to Tally")
    parser.add_argument("--firm", help="Firm ID, name, short name, or number from --list-firms")
    parser.add_argument("--list-firms", action="store_true", help="List configured firms and their Tally ports")
    parser.add_argument("--mrr", help="MRR transaction number")
    parser.add_argument("--dry-run", action="store_true", help="Print XML only; do not post to Tally or update DB")
    parser.add_argument("--limit", type=int, default=1, help="Maximum pending Rejection In MRR rows to process")
    args = parser.parse_args()

    global COMPANY_NAME, TALLY_URL_CANDIDATES, ACTIVE_TALLY_URL
    conn = get_db_connection()
    try:
        firms = get_firms(conn)
        if args.list_firms:
            for index, firm in enumerate(firms, 1):
                print(
                    f"{index}: {firm.get('firmName') or '-'} | "
                    f"Short name: {firm.get('shortName') or '-'} | "
                    f"ID: {firm.get('id') or '-'} | Tally port: {firm.get('tallyPortNo') or '-'}"
                )
            return

        selector = args.firm or os.getenv("LNPI_FIRM_ID")
        if not selector and COMPANY_NAME.strip():
            selector = COMPANY_NAME
        if not selector and len(firms) == 1:
            selector = str(firms[0].get("id") or "")
        if not selector:
            raise RuntimeError(
                "Select a firm with --firm. Run with --list-firms to see firm IDs, names, and Tally ports."
            )
        firm = resolve_firm(conn, selector, firms)
        COMPANY_NAME = firm["firmName"]
        TALLY_URL_CANDIDATES = build_tally_url_candidates(firm["tallyPortNo"])
        ACTIVE_TALLY_URL = None
        print(f"Selected firm: {COMPANY_NAME} | Tally port: {firm['tallyPortNo']}")

        ensure_credit_tracking_columns(conn)
        rows = get_pending_credit_note_rows(conn, firm_id=firm["id"], mrr_no=args.mrr, limit=args.limit)
        if not rows:
            print("No pending Rejection In MRR found for Credit Note posting.")
            return
        for row in rows:
            process_row(conn, row, args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()