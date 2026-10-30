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


@dataclass
class JobPlan:
    job_no: str
    production_date: dt.date
    reel_codes: list[str]
    required_weight: float
    material_missing: list[str] = field(default_factory=list)
    reel_missing: list[str] = field(default_factory=list)
    no_stock: list[str] = field(default_factory=list)
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and report only (default).")
    mode.add_argument("--apply", action="store_true", help="Write issue rows and DBREEL statuses.")
    parser.add_argument("--credentials", default=os.getenv("GOOGLE_SERVICE_ACCOUNT", "service_account.json"))
    parser.add_argument("--spreadsheet-id", default=SPREADSHEET_ID)
    parser.add_argument("--start-date", default=DEFAULT_START_DATE.isoformat())
    parser.add_argument("--log", default="reel_automation_log.csv")
    parser.add_argument(
        "--return-source",
        help=(
            "Optional CSV of real return transactions. Required columns: job_no, our_reel_no, "
            "weight, return_date. Optional: supplier_reel_no, erp, size, gsm, bf, rate, corrugation."
        ),
    )
    return parser.parse_args()


def authorize(credentials_path: str) -> gspread.Client:
    credentials = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return gspread.authorize(credentials)


def records(worksheet: gspread.Worksheet) -> tuple[list[str], list[list[str]]]:
    values = worksheet.get_all_values()
    return (values[0] if values else [], values[1:] if len(values) > 1 else [])


def load_source_book(book: gspread.Spreadsheet) -> dict[str, tuple[list[str], list[list[str]]]]:
    names = [SHEET_DAILY, SHEET_PENDING, SHEET_ITEMS, SHEET_STOCK, SHEET_ISSUE, SHEET_RETURN, SHEET_DB]
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
        jobs.setdefault(
            job_no,
            JobPlan(job_no, production_date, reel_codes, 0.0),
        ).reel_codes = reel_codes or jobs[job_no].reel_codes

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
                rate=number(get(row, stock, "Invoice Rate", "Opening Rate")),
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
        plan.material_missing = [code for code in plan.reel_codes if code not in material_erps]
        available_reels: list[StockReel] = []
        for code in plan.reel_codes:
            candidates = stock_by_erp.get(code, [])
            if not candidates:
                plan.reel_missing.append(code)
            elif not any(reel.available_weight > 0 for reel in candidates):
                plan.no_stock.append(code)
            available_reels.extend(reel for reel in candidates if reel.available_weight > 0)

        existing_issue = issue_by_job.get(plan.job_no, [])
        existing_return = return_by_job.get(plan.job_no, [])
        plan.existing_issue_count = len(existing_issue)
        plan.existing_return_count = len(existing_return)
        plan.existing_issue_weight = sum(weight for _, weight in existing_issue)
        plan.existing_return_weight = sum(weight for _, weight in existing_return)

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
            remaining -= issue_weight
        if remaining > 0:
            plan.messages.append(f"Insufficient available stock for {remaining:.3f} kg")

    return sorted(jobs.values(), key=lambda plan: (plan.production_date, plan.job_no))


def make_db_rows(plans: Iterable[JobPlan]) -> list[list[Any]]:
    rows = []
    for plan in plans:
        action = "; ".join(plan.messages) if plan.messages else plan.issue_status
        rows.append([
            plan.job_no,
            plan.issue_status,
            plan.return_status,
            plan.material_status,
            plan.reel_status,
            action,
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
    if not updates:
        return
    book.values_batch_update({"valueInputOption": "USER_ENTERED", "data": updates})


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
    write_values_batch(book, updates)
    return len(updates) // 3


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
    write_values_batch(book, updates)
    return len(return_rows)


def apply_db_rows(book: gspread.Spreadsheet, rows: Sequence[Sequence[Any]]) -> int:
    worksheet = book.worksheet(SHEET_DB)
    headers, existing_rows = records(worksheet)
    existing_map = read_existing_db_rows(headers, existing_rows)
    last_row = max((index for index, row in enumerate(existing_rows, start=2) if row and clean(row[0])), default=1)
    updates: list[dict[str, Any]] = []
    for row in rows:
        job_no = clean(row[0])
        target = existing_map.get(job_no)
        if target is None:
            last_row += 1
            target = last_row
        updates.append({"range": f"DBREEL!A{target}:F{target}", "values": [list(row)]})
    write_values_batch(book, updates)
    return len(rows)


def write_log(path: str, plans: Sequence[JobPlan]) -> None:
    fields = [
        "job_no", "production_date", "reel_codes", "required_weight", "material_status",
        "reel_status", "issue_status", "return_status", "issue_rows", "existing_issue_weight",
        "existing_return_weight", "messages",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for plan in plans:
            writer.writerow({
                "job_no": plan.job_no,
                "production_date": plan.production_date.isoformat(),
                "reel_codes": ", ".join(plan.reel_codes),
                "required_weight": f"{plan.required_weight:.3f}",
                "material_status": plan.material_status,
                "reel_status": plan.reel_status,
                "issue_status": plan.issue_status,
                "return_status": plan.return_status,
                "issue_rows": len(plan.issue_rows),
                "existing_issue_weight": f"{plan.existing_issue_weight:.3f}",
                "existing_return_weight": f"{plan.existing_return_weight:.3f}",
                "messages": "; ".join(plan.messages),
            })


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    start_date = as_date(args.start_date)
    if not start_date:
        raise SystemExit(f"Invalid --start-date: {args.start_date}")
    credentials = Path(args.credentials)
    if not credentials.exists():
        raise SystemExit(
            f"Credentials not found: {credentials}. Download a Google service-account key and share the workbook with its email."
        )

    book = authorize(str(credentials)).open_by_key(args.spreadsheet_id)
    data = load_source_book(book)
    plans = build_plans(data, start_date)
    return_rows = load_return_csv(args.return_source)
    db_rows = make_db_rows(plans)
    write_log(args.log, plans)

    logging.info("Found %d jobs from %s onward", len(plans), start_date.isoformat())
    logging.info("Wrote decision log: %s", args.log)
    logging.info("Issue rows planned: %d", sum(len(plan.issue_rows) for plan in plans))
    logging.info("Return rows supplied: %d", len(return_rows))
    if not args.apply:
        logging.info("DRY RUN: no Google Sheet cells were changed")
        return 0

    issue_count = apply_issue_rows(book, plans)
    return_count = apply_return_rows(book, return_rows)
    db_count = apply_db_rows(book, db_rows)
    logging.info("Applied %d issue rows, %d return rows, %d DBREEL rows", issue_count, return_count, db_count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
