#!/usr/bin/env python3
"""Safely reconcile reel issue/return activity from a Google Sheet.

Dry-run is the default. Use --apply only after reviewing the CSV log produced by
the dry run. Credentials are intentionally kept outside the repository.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import logging
import os
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import gspread
from google.oauth2.service_account import Credentials
from gspread.exceptions import APIError


SPREADSHEET_ID = os.getenv(
    "REEL_SPREADSHEET_ID",
    "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ",
)
DEFAULT_START_DATE = dt.date(2026, 4, 1)
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

SHEET_DAILY = "DAILY PRODUCTION MASTER"
SHEET_PENDING = "PENDING JOBS FOR REEL ISSUE"
SHEET_ITEMS = "ITEM MASTER"
SHEET_STOCK = "REEL WISE STOCK"
SHEET_ISSUE = "REEL ISSUE"
SHEET_RETURN = "REEL RETURN"
SHEET_DB = "DBREEL"


def clean(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float:
    try:
        return float(clean(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def as_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = clean(value)
    if not text:
        return None
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return dt.datetime.strptime(text[:10], fmt).date()
        except ValueError:
            pass
    # Google Sheets serial date, relative to 1899-12-30.
    try:
        return dt.date(1899, 12, 30) + dt.timedelta(days=float(text))
    except (TypeError, ValueError, OverflowError):
        return None


def header_map(headers: Sequence[Any]) -> dict[str, int]:
    return {clean(value).casefold(): index for index, value in enumerate(headers)}


def get(row: Sequence[Any], headers: Mapping[str, int], name: str) -> str:
    index = headers.get(name.casefold())
    return clean(row[index]) if index is not None and index < len(row) else ""


def get_any(row: Sequence[Any], headers: Mapping[str, int], *names: str) -> str:
    for name in names:
        value = get(row, headers, name)
        if value:
            return value
    return ""


def pad(row: Sequence[Any], width: int) -> list[Any]:
    return list(row) + [""] * max(0, width - len(row))


def parse_reel_codes(value: Any) -> list[str]:
    """Extract ERP codes from one or multiple 'ERP - Size...' descriptions."""
    text = clean(value)
    if not text:
        return []
    parts = re.split(r"\s*,\s*|\s*;\s*|\n+", text)
    codes: list[str] = []
    for part in parts:
        match = re.search(r"(?<!\d)(\d{5,})(?=\s*-|\s*$)", part)
        if not match:
            match = re.search(r"(?<!\d)(\d{5,})", part)
        if match and match.group(1) not in codes:
            codes.append(match.group(1))
    return codes


def unique_values(values: Iterable[Any]) -> list[str]:
    """Return non-empty values once, preserving their original order."""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = clean(value)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


@dataclass
class StockReel:
    our_reel_no: str
    erp: str
    supplier: str
    size: str
    gsm: str
    bf: str
    available_weight: float
    rate: float
    supplier_reel_no: str = ""


@dataclass
class JobPlan:
    job_no: str
    production_date: dt.date
    reel_codes: list[str]
    required_weight: float
    material_missing: list[str] = field(default_factory=list)
    reel_missing: list[str] = field(default_factory=list)
    no_stock: list[str] = field(default_factory=list)
    qc_scans: list[str] = field(default_factory=list)
    material_create_rows: list[list[Any]] = field(default_factory=list)
    reel_create_rows: list[list[Any]] = field(default_factory=list)
    issue_rows: list[dict[str, Any]] = field(default_factory=list)
    existing_issue_weight: float = 0.0
    existing_return_weight: float = 0.0
    existing_issue_count: int = 0
    existing_return_count: int = 0
    messages: list[str] = field(default_factory=list)

    @property
    def material_status(self) -> str:
        return "PRESENT" if not self.material_missing else "MISSING: " + ", ".join(self.material_missing)

    @property
    def reel_status(self) -> str:
        problems = []
        if self.reel_missing:
            problems.append("MISSING: " + ", ".join(self.reel_missing))
        if self.no_stock:
            problems.append("NO STOCK: " + ", ".join(self.no_stock))
        return "PRESENT" if not problems else "; ".join(problems)

    @property
    def issue_status(self) -> str:
        if self.material_missing:
            return "BLOCKED - MATERIAL MASTER REVIEW"
        if self.reel_missing or self.no_stock:
            return "BLOCKED - REEL STOCK REVIEW"
        if self.issue_rows:
            return f"CREATE {len(self.issue_rows)} ISSUE ROW(S)"
        if self.existing_issue_count:
            return "ALREADY ISSUED"
        return "PENDING - REQUIRED WEIGHT UNKNOWN"

    @property
    def return_status(self) -> str:
        if self.existing_return_count and self.existing_return_weight >= self.existing_issue_weight > 0:
            return "COMPLETE"
        if self.existing_return_count:
            return "PARTIAL / REVIEW"
        return "PENDING - REAL RETURN DATA REQUIRED"

    @property
    def final_status(self) -> str:
        if self.material_missing:
            return "BLOCKED - MATERIAL MASTER REVIEW"
        if self.reel_missing or self.no_stock:
            return "BLOCKED - REEL STOCK REVIEW"
        if self.issue_rows and not self.existing_issue_count:
            return "PENDING - ISSUE CREATION"
        if self.return_status == "COMPLETE":
            return "COMPLETE"
        return "PENDING - REAL RETURN DATA REQUIRED"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and report only (default).")
    mode.add_argument("--apply", action="store_true", help="Write issue rows and DBREEL statuses.")
    parser.add_argument(
        "--credentials",
        default=os.getenv("GOOGLE_SERVICE_ACCOUNT", ""),
        help="Service-account JSON path. Defaults to dbmigration/service-account.json or service_account.json.",
    )
    parser.add_argument("--spreadsheet-id", default=SPREADSHEET_ID)
    parser.add_argument("--start-date", default=DEFAULT_START_DATE.isoformat())
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--start-batch", type=int, default=1)
    parser.add_argument(
        "--resume-from-job",
        default="",
        help=(
            "Resume at this production job number. Use AUTO (or omit this option) "
            "to use DAILY PRODUCTION MASTER order."
        ),
    )
    parser.add_argument("--max-batches", type=int, default=0, help="0 processes all batches; use 1 for a controlled first batch.")
    parser.add_argument("--log", default="reel_automation_log.csv")
    parser.add_argument(
        "--return-source",
        help=(
            "Optional CSV of real return transactions. Required columns: job_no, our_reel_no, "
            "weight, return_date. Optional: supplier_reel_no, erp, size, gsm, bf, rate, corrugation."
        ),
    )
    return parser.parse_args()


def resolve_credentials_path(requested: str) -> Path:
    if requested:
        return Path(requested).expanduser()
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir / ".venv" / "db-migrations.json",
        script_dir / "service-account.json",
        script_dir / "service_account.json",
        Path.cwd() / "service-account.json",
        Path.cwd() / "service_account.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    # Return the conventional project path so the error points to one clear location.
    return script_dir / "service-account.json"


def authorize(credentials_path: str) -> gspread.Client:
    credentials = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return gspread.authorize(credentials)


def records(worksheet: gspread.Worksheet) -> tuple[list[str], list[list[str]]]:
    # Keep raw numeric precision; formatted cells such as 0.4 kg may display as 0.
    values = worksheet.get_all_values(value_render_option="UNFORMATTED_VALUE")
    return (values[0] if values else [], values[1:] if len(values) > 1 else [])


def load_source_book(book: gspread.Spreadsheet) -> dict[str, tuple[list[str], list[list[str]]]]:
    names = ["HELPER SHEET", SHEET_DAILY, SHEET_PENDING, SHEET_ITEMS, SHEET_STOCK, SHEET_ISSUE, SHEET_RETURN, SHEET_DB]
    return {name: records(book.worksheet(name)) for name in names}


def load_return_csv(path: str | None) -> list[dict[str, str]]:
    if not path:
        return []
    with open(path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    required = {"job_no", "our_reel_no", "weight", "return_date"}
    if rows and not required.issubset({clean(k).casefold() for k in rows[0]}):
        raise ValueError(f"Return CSV must contain columns: {', '.join(sorted(required))}")
    return rows


def build_plans(data: dict[str, tuple[list[str], list[list[str]]]], start_date: dt.date) -> list[JobPlan]:
    daily_headers, daily_rows = data[SHEET_DAILY]
    daily = header_map(daily_headers)
    jobs: dict[str, JobPlan] = {}
    for raw in daily_rows:
        row = pad(raw, len(daily_headers))
        production_date = as_date(get_any(row, daily, "Date"))
        job_no = get_any(row, daily, "Job Card No.", "JOB NO.")
        if not production_date or production_date < start_date or not job_no:
            continue
        reel_codes = parse_reel_codes(get_any(row, daily, "ERP CODE REEL"))
        plan = jobs.get(job_no)
        if plan is None:
            plan = JobPlan(job_no, production_date, reel_codes, 0.0)
            jobs[job_no] = plan
        elif reel_codes:
            plan.reel_codes = reel_codes

    pending_headers, pending_rows = data[SHEET_PENDING]
    pending = header_map(pending_headers)
    for raw in pending_rows:
        row = pad(raw, len(pending_headers))
        job_no = get_any(row, pending, "JOB No.", "JOB NO.")
        if job_no in jobs:
            jobs[job_no].required_weight = max(jobs[job_no].required_weight, number(get_any(row, pending, "REQUIRED REEL")))

    item_headers, item_rows = data[SHEET_ITEMS]
    item = header_map(item_headers)
    material_erps = {get(row, item, "ERP") for row in item_rows if get(row, item, "ERP")}

    helper_headers, helper_rows = data["HELPER SHEET"]
    helper = header_map(helper_headers)
    helper_by_erp: dict[str, list[dict[str, str]]] = defaultdict(list)
    helper_by_reel: dict[str, dict[str, str]] = {}
    for raw in helper_rows:
        row = pad(raw, len(helper_headers))
        record = {
            "our_reel_no": get(row, helper, "Our Reel Number"),
            "supplier_reel_no": get(row, helper, "Supplier Reel No."),
            "erp": get(row, helper, "ERP Code"),
            "supplier": get(row, helper, "SUPPLIER"),
            "size": get(row, helper, "Size"),
            "gsm": get(row, helper, "GSM"),
            "bf": get(row, helper, "BF"),
            "weight": get(row, helper, "Weight"),
            "rate": get(row, helper, "Rate"),
        }
        if record["erp"]:
            helper_by_erp[record["erp"]].append(record)
        if record["our_reel_no"]:
            helper_by_reel[record["our_reel_no"]] = record

    stock_headers, stock_rows = data[SHEET_STOCK]
    stock = header_map(stock_headers)
    stock_by_erp: dict[str, list[StockReel]] = defaultdict(list)
    for raw in stock_rows:
        row = pad(raw, len(stock_headers))
        erp = get(row, stock, "ERP")
        if not erp:
            continue
        stock_by_erp[erp].append(
            StockReel(
                our_reel_no=get(row, stock, "Our Reel No."),
                erp=erp,
                supplier=get(row, stock, "Suppliers Name"),
                size=get(row, stock, "SIZE"),
                gsm=get(row, stock, "GSM"),
                bf=get(row, stock, "BF"),
                available_weight=number(get(row, stock, "Available Weight")),
                rate=number(get_any(row, stock, "Invoice Rate", "Opening Rate")),
                supplier_reel_no=get(row, stock, "SUPLIEER REEL"),
            )
        )

    issue_headers, issue_rows = data[SHEET_ISSUE]
    issue = header_map(issue_headers)
    issue_by_job: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for raw in issue_rows:
        row = pad(raw, len(issue_headers))
        job_no = get_any(row, issue, "JOB NO.", "JOB")
        reel_no = get_any(row, issue, "QR Scan", "Our Reel Number")
        if job_no:
            issue_by_job[job_no].append((reel_no, number(get(row, issue, "Weight"))))

    return_headers, return_rows = data[SHEET_RETURN]
    returned = header_map(return_headers)
    return_by_job: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for raw in return_rows:
        row = pad(raw, len(return_headers))
        job_no = get_any(row, returned, "JOB", "JOB NO.")
        reel_no = get_any(row, returned, "QR Scan", "Our Reel Number")
        if job_no:
            return_by_job[job_no].append((reel_no, number(get(row, returned, "Weight"))))

    for plan in jobs.values():
        existing_issue = issue_by_job.get(plan.job_no, [])
        issue_reels = {reel_no for reel_no, _ in existing_issue if reel_no}
        existing_return = [
            item for item in return_by_job.get(plan.job_no, [])
            if item[0] and item[0] in issue_reels
        ]
        plan.existing_issue_count = len(existing_issue)
        plan.existing_return_count = len(existing_return)
        plan.existing_issue_weight = sum(weight for _, weight in existing_issue)
        plan.existing_return_weight = sum(weight for _, weight in existing_return)
        plan.qc_scans = unique_values(reel_no for reel_no, _ in existing_issue)

        plan.material_missing = []
        for code in plan.reel_codes:
            if code in material_erps:
                continue
            helper_record = next((r for r in helper_by_erp.get(code, []) if all(r[k] for k in ("supplier", "size", "gsm", "bf"))), None)
            if helper_record:
                plan.material_create_rows.append([
                    code, helper_record["supplier"], helper_record["size"], helper_record["gsm"], helper_record["bf"],
                ])
                material_erps.add(code)
            else:
                plan.material_missing.append(code)

        available_reels: list[StockReel] = []
        for code in plan.reel_codes:
            candidates = stock_by_erp.get(code, [])
            if not candidates:
                for qc_scan in plan.qc_scans:
                    helper_record = helper_by_reel.get(qc_scan)
                    if helper_record and helper_record["erp"] == code and all(helper_record[k] for k in ("size", "gsm", "bf", "weight", "rate")):
                        created = {
                            "our_reel_no": helper_record["our_reel_no"],
                            "erp": code,
                            "supplier": helper_record["supplier"],
                            "size": helper_record["size"],
                            "gsm": helper_record["gsm"],
                            "bf": helper_record["bf"],
                            "weight": number(helper_record["weight"]),
                            "rate": number(helper_record["rate"]),
                            "supplier_reel_no": helper_record["supplier_reel_no"],
                        }
                        plan.reel_create_rows.append(created)
                        candidates = [StockReel(
                            our_reel_no=created["our_reel_no"],
                            erp=created["erp"],
                            supplier=created["supplier"],
                            size=created["size"],
                            gsm=created["gsm"],
                            bf=created["bf"],
                            available_weight=created["weight"],
                            rate=created["rate"],
                            supplier_reel_no=created["supplier_reel_no"],
                        )]
                        stock_by_erp[code].extend(candidates)
                        break
            if not candidates:
                plan.reel_missing.append(code)
            elif not any(reel.available_weight > 0 for reel in candidates):
                plan.no_stock.append(code)
            available_reels.extend(reel for reel in candidates if reel.available_weight > 0)

        if plan.material_missing or plan.reel_missing or plan.no_stock or plan.required_weight <= 0:
            continue
        remaining = max(0.0, plan.required_weight - plan.existing_issue_weight)
        existing_reels = {reel_no for reel_no, _ in existing_issue if reel_no}
        for reel in available_reels:
            if remaining <= 0:
                break
            if not reel.our_reel_no or reel.our_reel_no in existing_reels:
                continue
            issue_weight = min(remaining, reel.available_weight)
            plan.issue_rows.append(
                {
                    "job_no": plan.job_no,
                    "our_reel_no": reel.our_reel_no,
                    "weight": round(issue_weight, 3),
                    "issue_date": plan.production_date.isoformat(),
                    "erp": reel.erp,
                    "size": reel.size,
                    "gsm": reel.gsm,
                    "bf": reel.bf,
                    "rate": reel.rate,
                }
            )
            plan.qc_scans = unique_values([*plan.qc_scans, reel.our_reel_no])
            remaining -= issue_weight
        if remaining > 0:
            plan.messages.append(f"Insufficient available stock for {remaining:.3f} kg")

    return sorted(jobs.values(), key=lambda plan: (plan.production_date, plan.job_no))


def make_db_rows(plans: Iterable[JobPlan]) -> list[list[Any]]:
    rows = []
    for plan in plans:
        action = plan.final_status
        rows.append([
            plan.job_no,
            plan.issue_status,
            plan.return_status,
            plan.material_status,
            plan.reel_status,
            action,
            ", ".join(plan.qc_scans),
        ])
    return rows


def read_existing_db_rows(headers: Sequence[Any], rows: Sequence[Sequence[Any]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    header = header_map(headers)
    job_index = header.get("job no")
    if job_index is None:
        return mapping
    for offset, row in enumerate(rows, start=2):
        job_no = clean(row[job_index]) if job_index < len(row) else ""
        if job_no:
            mapping[job_no] = offset
    return mapping


def write_values_batch(book: gspread.Spreadsheet, updates: list[dict[str, Any]]) -> None:
    for start in range(0, len(updates), 200):
        chunk = updates[start : start + 200]
        book.values_batch_update({"valueInputOption": "USER_ENTERED", "data": chunk})


def ensure_rows(worksheet: gspread.Worksheet, required_last_row: int) -> None:
    """Expand a worksheet grid before writing past its current row limit."""
    if required_last_row > worksheet.row_count:
        try:
            worksheet.add_rows(required_last_row - worksheet.row_count)
        except APIError as exc:
            raise SystemExit(
                f"Cannot expand {worksheet.title} to row {required_last_row}. "
                "The service account may lack edit permission for the protected range or sheet grid."
            ) from exc


def apply_issue_rows(book: gspread.Spreadsheet, plans: Sequence[JobPlan]) -> int:
    worksheet = book.worksheet(SHEET_ISSUE)
    existing = worksheet.get_all_values()
    last_row = max((index for index, row in enumerate(existing, start=1) if len(row) > 1 and clean(row[1])), default=1)
    updates: list[dict[str, Any]] = []
    next_row = last_row + 1
    for plan in plans:
        for issue in plan.issue_rows:
            issue_id = uuid.uuid4().hex[:8]
            item_id = uuid.uuid4().hex[:8]
            updates.extend([
                {"range": f"'REEL ISSUE'!B{next_row}:C{next_row}", "values": [[issue["job_no"], issue["our_reel_no"]]]},
                {"range": f"'REEL ISSUE'!V{next_row}:V{next_row}", "values": [[issue["weight"]]]},
                {"range": f"'REEL ISSUE'!AE{next_row}:AG{next_row}", "values": [[issue["issue_date"], issue_id, item_id]]},
            ])
            next_row += 1
    ensure_rows(worksheet, next_row - 1)
    write_values_batch(book, updates)
    return len(updates) // 3


def apply_material_rows(book: gspread.Spreadsheet, plans: Sequence[JobPlan]) -> int:
    worksheet = book.worksheet(SHEET_ITEMS)
    headers, existing_rows = records(worksheet)
    existing_erps = {clean(row[0]) for row in existing_rows if row}
    rows: list[list[Any]] = []
    seen: set[str] = set()
    for plan in plans:
        for row in plan.material_create_rows:
            erp = clean(row[0])
            if erp and erp not in existing_erps and erp not in seen:
                rows.append(row)
                seen.add(erp)
    if not rows:
        return 0
    last_row = max((index for index, row in enumerate(existing_rows, start=2) if row and clean(row[0])), default=1)
    updates = []
    for offset, row in enumerate(rows, start=last_row + 1):
        updates.append({"range": f"'ITEM MASTER'!A{offset}:E{offset}", "values": [row]})
    ensure_rows(worksheet, last_row + len(rows))
    write_values_batch(book, updates)
    return len(rows)


def apply_reel_rows(book: gspread.Spreadsheet, plans: Sequence[JobPlan]) -> int:
    worksheet = book.worksheet(SHEET_STOCK)
    headers, existing_rows = records(worksheet)
    existing_reels = {clean(row[0]) for row in existing_rows if row}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for plan in plans:
        for row in plan.reel_create_rows:
            reel_no = clean(row["our_reel_no"])
            if reel_no and reel_no not in existing_reels and reel_no not in seen:
                rows.append(row)
                seen.add(reel_no)
    if not rows:
        return 0
    last_row = max((index for index, row in enumerate(existing_rows, start=2) if row and clean(row[0])), default=1)
    updates = []
    for offset, row in enumerate(rows, start=last_row + 1):
        updates.extend([
            {"range": f"'REEL WISE STOCK'!A{offset}:H{offset}", "values": [[
                row["our_reel_no"], row["erp"], row["supplier"], row["size"], row["gsm"], row["bf"], row["weight"], row["rate"],
            ]]},
            {"range": f"'REEL WISE STOCK'!J{offset}:J{offset}", "values": [[row["rate"]]]},
            {"range": f"'REEL WISE STOCK'!R{offset}:R{offset}", "values": [[row["supplier_reel_no"]]]},
        ])
    ensure_rows(worksheet, last_row + len(rows))
    write_values_batch(book, updates)
    return len(rows)


def apply_return_rows(book: gspread.Spreadsheet, return_rows: Sequence[Mapping[str, Any]]) -> int:
    if not return_rows:
        return 0
    worksheet = book.worksheet(SHEET_RETURN)
    existing = worksheet.get_all_values()
    last_row = max((index for index, row in enumerate(existing, start=1) if len(row) > 2 and clean(row[2])), default=1)
    updates: list[dict[str, Any]] = []
    next_row = last_row + 1
    for item in return_rows:
        return_id = uuid.uuid4().hex[:8]
        item_id = uuid.uuid4().hex[:8]
        updates.extend([
            {"range": f"'REEL RETURN'!B{next_row}:C{next_row}", "values": [[clean(item["job_no"]), clean(item["our_reel_no"])]]},
            {"range": f"'REEL RETURN'!I{next_row}:K{next_row}", "values": [[number(item["weight"]), number(item.get("rate")), clean(item["return_date"])]]},
            {"range": f"'REEL RETURN'!M{next_row}:N{next_row}", "values": [[item_id, return_id]]},
        ])
        next_row += 1
    ensure_rows(worksheet, next_row - 1)
    write_values_batch(book, updates)
    return len(return_rows)


def apply_db_rows(book: gspread.Spreadsheet, rows: Sequence[Sequence[Any]]) -> int:
    worksheet = book.worksheet(SHEET_DB)
    headers, existing_rows = records(worksheet)
    existing_map = read_existing_db_rows(headers, existing_rows)
    last_row = max((index for index, row in enumerate(existing_rows, start=2) if row and clean(row[0])), default=1)
    updates: list[dict[str, Any]] = []
    if header_map(headers).get("qc scan / our reel no.") is None:
        updates.append({"range": "DBREEL!G1", "values": [["QC SCAN / OUR REEL NO."]]})
    for row in rows:
        job_no = clean(row[0])
        target = existing_map.get(job_no)
        if target is None:
            last_row += 1
            target = last_row
        updates.append({"range": f"DBREEL!A{target}:G{target}", "values": [list(row)]})
    ensure_rows(worksheet, last_row)
    write_values_batch(book, updates)
    return len(rows)


def write_log(path: str, plans: Sequence[JobPlan], batch_size: int) -> None:
    fields = [
        "batch_number", "job_no", "production_date", "reel_codes", "required_weight", "material_status",
        "reel_status", "issue_status", "return_status", "issue_rows", "material_rows", "reel_rows",
        "existing_issue_weight", "existing_return_weight", "qc_scans", "messages",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, plan in enumerate(plans):
            writer.writerow({
                "batch_number": (index // batch_size) + 1,
                "job_no": plan.job_no,
                "production_date": plan.production_date.isoformat(),
                "reel_codes": ", ".join(plan.reel_codes),
                "required_weight": f"{plan.required_weight:.3f}",
                "material_status": plan.material_status,
                "reel_status": plan.reel_status,
                "issue_status": plan.issue_status,
                "return_status": plan.return_status,
                "issue_rows": len(plan.issue_rows),
                "material_rows": len(plan.material_create_rows),
                "reel_rows": len(plan.reel_create_rows),
                "existing_issue_weight": f"{plan.existing_issue_weight:.3f}",
                "existing_return_weight": f"{plan.existing_return_weight:.3f}",
                "qc_scans": ", ".join(plan.qc_scans),
                "messages": "; ".join(plan.messages),
            })


def protected_sheet_access(
    metadata: Mapping[str, Any],
    title: str,
    service_account_email: str,
) -> tuple[bool, bool]:
    """Return (has_protection, can_edit) for a sheet from Sheets metadata."""
    for sheet in metadata.get("sheets", []):
        if sheet.get("properties", {}).get("title") != title:
            continue
        ranges = sheet.get("protectedRanges", [])
        if not ranges:
            return False, True
        for protected_range in ranges:
            if protected_range.get("requestingUserCanEdit") is True:
                continue
            editors = protected_range.get("editors", {}).get("users", [])
            if service_account_email and service_account_email in editors:
                continue
            return True, False
        return True, True
    return False, True


def protected_sheet_titles(book: gspread.Spreadsheet) -> set[str]:
    metadata = book.fetch_sheet_metadata({
        "includeGridData": False,
        "fields": "sheets(properties(title),protectedRanges(requestingUserCanEdit,editors/users,range))",
    })
    return {
        sheet["properties"]["title"]
        for sheet in metadata.get("sheets", [])
        if sheet.get("protectedRanges")
    }


def preflight_apply(book: gspread.Spreadsheet, plans: Sequence[JobPlan], return_rows: Sequence[Mapping[str, Any]]) -> None:
    metadata = book.fetch_sheet_metadata({
        "includeGridData": False,
        "fields": "sheets(properties(title),protectedRanges(requestingUserCanEdit,editors/users,range))",
    })
    service_account_email = getattr(book.client.auth, "service_account_email", "")
    required = []
    if any(plan.issue_rows for plan in plans):
        required.append(SHEET_ISSUE)
    if any(plan.material_create_rows for plan in plans):
        required.append(SHEET_ITEMS)
    if any(plan.reel_create_rows for plan in plans):
        required.append(SHEET_STOCK)
    if return_rows:
        required.append(SHEET_RETURN)
    blocked = []
    authorized_protection = []
    for sheet in required:
        has_protection, can_edit = protected_sheet_access(metadata, sheet, service_account_email)
        if has_protection and can_edit:
            authorized_protection.append(sheet)
        elif has_protection and not can_edit:
            blocked.append(sheet)
    if authorized_protection:
        logging.info("Protected sheet(s) authorized for service account: %s", ", ".join(authorized_protection))
    if blocked:
        names = ", ".join(blocked)
        raise SystemExit(
            f"Apply blocked before any write: protected sheet(s) not authorized for this service account: {names}. "
            "Add the service account as an editor of the protected range or remove the protection."
        )


def make_batches(plans: Sequence[JobPlan], batch_size: int, start_batch: int, max_batches: int) -> list[tuple[int, list[JobPlan]]]:
    if batch_size <= 0:
        raise SystemExit("--batch-size must be greater than zero")
    if start_batch <= 0:
        raise SystemExit("--start-batch must be at least 1")
    first = (start_batch - 1) * batch_size
    selected = plans[first:]
    batches = []
    for offset in range(0, len(selected), batch_size):
        if max_batches and len(batches) >= max_batches:
            break
        batches.append((start_batch + len(batches), list(selected[offset : offset + batch_size])))
    return batches


def is_production_order_resume(value: Any) -> bool:
    """Return true when the CLI value means 'take jobs from production order'."""
    token = re.sub(r"[^A-Z0-9]+", "", clean(value).upper())
    return token in {"", "AUTO", "PRODUCTION", "PRODUCTIONORDER", "JOBNUMBER", "JOBNO"}


def apply_issue_result(plan: JobPlan, issue_count: int) -> None:
    if issue_count:
        plan.existing_issue_count += issue_count
        plan.existing_issue_weight += sum(number(row["weight"]) for row in plan.issue_rows)
        plan.issue_rows = []


RUNTIME_LOG_FIELDS = [
    "batch_number", "job_no", "material_action", "reel_action", "issue_action",
    "return_action", "final_status", "qc_scans", "error",
]


def initialize_runtime_log(path: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        csv.DictWriter(handle, fieldnames=RUNTIME_LOG_FIELDS).writeheader()


def append_runtime_log(path: str, batch_number: int, plan: JobPlan, material_action: str, reel_action: str, issue_action: str, error: str = "") -> None:
    with open(path, "a", newline="", encoding="utf-8") as handle:
        csv.DictWriter(handle, fieldnames=RUNTIME_LOG_FIELDS).writerow({
            "batch_number": batch_number,
            "job_no": plan.job_no,
            "material_action": material_action,
            "reel_action": reel_action,
            "issue_action": issue_action,
            "return_action": plan.return_status,
            "final_status": plan.final_status,
            "qc_scans": ", ".join(plan.qc_scans),
            "error": error,
        })


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    start_date = as_date(args.start_date)
    if not start_date:
        raise SystemExit(f"Invalid --start-date: {args.start_date}")
    credentials = resolve_credentials_path(args.credentials)
    if not credentials.exists():
        raise SystemExit(
            f"Credentials not found: {credentials}. Download a Google service-account key, save it there, "
            "and share the workbook with the service-account email."
        )

    book = authorize(str(credentials)).open_by_key(args.spreadsheet_id)
    data = load_source_book(book)
    plans = build_plans(data, start_date)
    if args.return_source:
        raise SystemExit("--return-source is not supported in this workflow; returns come only from existing REEL RETURN rows.")
    if is_production_order_resume(args.resume_from_job):
        logging.info("Using job numbers from DAILY PRODUCTION MASTER in production order")
        args.resume_from_job = ""
    if args.resume_from_job:
        requested_job = clean(args.resume_from_job)
        resume_index = next((index for index, plan in enumerate(plans) if plan.job_no == requested_job), None)
        if resume_index is None:
            examples = ", ".join(plan.job_no for plan in plans[:10]) or "none"
            raise SystemExit(
                f"--resume-from-job not found in DAILY PRODUCTION MASTER: {requested_job}. "
                f"Example production jobs: {examples}"
            )
        plans = plans[resume_index:]
    batches = make_batches(plans, args.batch_size, args.start_batch, args.max_batches)
    selected_plans = [plan for _, batch in batches for plan in batch]
    write_log(args.log, plans, args.batch_size)

    logging.info("Found %d jobs from %s onward", len(plans), start_date.isoformat())
    logging.info("Batch size: %d; batches selected: %d", args.batch_size, len(batches))
    logging.info("Wrote decision log: %s", args.log)
    logging.info("Selected issue rows planned: %d", sum(len(plan.issue_rows) for plan in selected_plans))
    logging.info("Returns: existing REEL RETURN rows only; no return rows will be invented")
    if not args.apply:
        logging.info("DRY RUN: no Google Sheet cells were changed")
        return 0

    preflight_apply(book, selected_plans, [])
    initialize_runtime_log(args.log)
    total_materials = total_reels = total_issues = total_db = 0
    for batch_number, batch in batches:
        logging.info("Starting batch %d (%d jobs)", batch_number, len(batch))
        batch_materials = batch_reels = batch_issues = batch_db = 0
        for plan in batch:
            material_count = reel_count = issue_count = db_count = 0
            try:
                material_count = apply_material_rows(book, [plan])
                material_action = f"CREATED {material_count}" if material_count else plan.material_status
                reel_count = apply_reel_rows(book, [plan])
                reel_action = f"CREATED {reel_count}" if reel_count else plan.reel_status
                issue_count = apply_issue_rows(book, [plan])
                issue_action = f"CREATED {issue_count}" if issue_count else plan.issue_status
                apply_issue_result(plan, issue_count)
                # Returns are read from the source snapshot; no synthetic return is created.
                db_count = apply_db_rows(book, make_db_rows([plan]))
                append_runtime_log(args.log, batch_number, plan, material_action, reel_action, issue_action)
            except (Exception, SystemExit) as exc:
                append_runtime_log(
                    args.log,
                    batch_number,
                    plan,
                    f"CREATED {material_count}" if material_count else plan.material_status,
                    f"CREATED {reel_count}" if reel_count else plan.reel_status,
                    f"CREATED {issue_count}" if issue_count else plan.issue_status,
                    str(exc),
                )
                raise SystemExit(f"Batch {batch_number} stopped at job {plan.job_no}: {exc}") from exc
            batch_materials += material_count
            batch_reels += reel_count
            batch_issues += issue_count
            batch_db += db_count
        total_materials += batch_materials
        total_reels += batch_reels
        total_issues += batch_issues
        total_db += batch_db
        logging.info(
            "Completed batch %d: materials=%d reels=%d issues=%d DBREEL=%d",
            batch_number, batch_materials, batch_reels, batch_issues, batch_db,
        )
    logging.info(
        "Applied totals: materials=%d reels=%d issues=%d returns=0 DBREEL=%d",
        total_materials, total_reels, total_issues, total_db,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
