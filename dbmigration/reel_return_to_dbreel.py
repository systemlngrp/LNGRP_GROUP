#!/usr/bin/env python3
"""Create reel returns from CSV input and refresh DBREEL status rows.

Dry-run is the default. Use --apply only after reviewing the decision log.
"""

from __future__ import annotations

import argparse
import csv
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_automation import (
    DEFAULT_START_DATE,
    apply_db_rows,
    apply_return_rows,
    as_date,
    authorize,
    build_plans,
    clean,
    load_source_book,
    make_batches,
    number,
    preflight_apply,
    resolve_credentials_path,
)


REQUIRED_COLUMNS = {"job_no", "our_reel_no", "weight", "return_date"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and report only (default).")
    mode.add_argument("--apply", action="store_true", help="Write return and DBREEL rows.")
    parser.add_argument("--return-csv", required=True, help="CSV containing return transactions.")
    parser.add_argument("--credentials", default="", help="Service-account JSON path.")
    parser.add_argument(
        "--spreadsheet-id",
        default="1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ",
    )
    parser.add_argument("--start-date", default=DEFAULT_START_DATE.isoformat())
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--log", default="reel_return_to_dbreel_log.csv")
    return parser.parse_args()


def load_return_csv(path: str) -> list[dict[str, str]]:
    with Path(path).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        headers = {clean(value).casefold() for value in (reader.fieldnames or [])}
        missing = REQUIRED_COLUMNS - headers
        if missing:
            raise SystemExit(f"Return CSV is missing required columns: {', '.join(sorted(missing))}")
        return [{clean(key).casefold(): clean(value) for key, value in row.items()} for row in reader]


def return_key(row: Mapping[str, Any]) -> tuple[str, str, float, str]:
    return (
        clean(row.get("job_no")),
        clean(row.get("our_reel_no")),
        number(row.get("weight")),
        clean(row.get("return_date")),
    )


def validate_and_filter_returns(
    requested: Sequence[Mapping[str, Any]],
    source_data: Mapping[str, tuple[list[str], list[list[str]]]],
) -> tuple[list[dict[str, str]], list[str]]:
    issue_headers, issue_rows = source_data["REEL ISSUE"]
    issued_by_job: dict[str, set[str]] = defaultdict(set)
    issue_header_map = {clean(value).casefold(): index for index, value in enumerate(issue_headers)}
    job_index = issue_header_map.get("job no.")
    reel_index = issue_header_map.get("qr scan")
    if job_index is None or reel_index is None:
        raise SystemExit("REEL ISSUE must contain JOB NO. and QR Scan columns")
    for row in issue_rows:
        if len(row) > max(job_index, reel_index):
            job_no = clean(row[job_index])
            reel_no = clean(row[reel_index])
            if job_no and reel_no:
                issued_by_job[job_no].add(reel_no)

    return_headers, return_rows = source_data["REEL RETURN"]
    return_header_map = {clean(value).casefold(): index for index, value in enumerate(return_headers)}
    existing_keys: set[tuple[str, str, float, str]] = set()
    for row in return_rows:
        job_index = return_header_map.get("job")
        reel_index = return_header_map.get("qr scan")
        weight_index = return_header_map.get("weight")
        date_index = return_header_map.get("return date")
        if None not in (job_index, reel_index, weight_index, date_index) and len(row) > max(job_index, reel_index, weight_index, date_index):
            existing_keys.add(return_key({
                "job_no": row[job_index],
                "our_reel_no": row[reel_index],
                "weight": row[weight_index],
                "return_date": row[date_index],
            }))

    accepted: list[dict[str, str]] = []
    skipped: list[str] = []
    seen = set(existing_keys)
    for raw in requested:
        row = {clean(key).casefold(): clean(value) for key, value in raw.items()}
        key = return_key(row)
        job_no, reel_no, weight, return_date = key
        if not job_no or not reel_no or weight <= 0 or not return_date:
            raise SystemExit(f"Invalid return row: {dict(raw)}")
        if reel_no not in issued_by_job.get(job_no, set()):
            raise SystemExit(f"Return reel {reel_no} was not issued to job {job_no}")
        if key in seen:
            skipped.append(f"duplicate {job_no}/{reel_no}/{return_date}/{weight:g}")
            continue
        seen.add(key)
        accepted.append(row)
    return accepted, skipped


def write_log(path: str, accepted: Sequence[Mapping[str, Any]], skipped: Sequence[str]) -> None:
    with Path(path).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["job_no", "our_reel_no", "weight", "return_date", "status", "detail"])
        writer.writeheader()
        for row in accepted:
            writer.writerow({**{field: row.get(field, "") for field in ("job_no", "our_reel_no", "weight", "return_date")}, "status": "ACCEPTED", "detail": ""})
        for detail in skipped:
            writer.writerow({"status": "SKIPPED", "detail": detail})


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args() if argv is None else parse_args_from(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    start_date = as_date(args.start_date)
    if not start_date:
        raise SystemExit(f"Invalid --start-date: {args.start_date}")
    requested = load_return_csv(args.return_csv)
    credentials = resolve_credentials_path(args.credentials)
    if not credentials.exists():
        raise SystemExit(f"Credentials not found: {credentials}")

    book = authorize(str(credentials)).open_by_key(args.spreadsheet_id)
    source_data = load_source_book(book)
    accepted, skipped = validate_and_filter_returns(requested, source_data)
    write_log(args.log, accepted, skipped)
    logging.info("Accepted return rows: %d; skipped duplicates: %d", len(accepted), len(skipped))
    if not args.apply:
        logging.info("DRY RUN: no Google Sheet cells were changed")
        return 0

    preflight_apply(book, [], accepted)
    if accepted:
        apply_return_rows(book, accepted)

    refreshed = build_plans(load_source_book(book), start_date)
    affected_jobs = {clean(row["job_no"]) for row in accepted}
    affected_plans = [plan for plan in refreshed if plan.job_no in affected_jobs]
    missing_jobs = affected_jobs - {plan.job_no for plan in affected_plans}
    if missing_jobs:
        raise SystemExit("Return jobs not found in DAILY PRODUCTION MASTER: " + ", ".join(sorted(missing_jobs)))
    for batch_number, batch in make_batches(affected_plans, args.batch_size, 1, 0):
        for plan in batch:
            apply_db_rows(book, [[
                plan.job_no,
                plan.issue_status,
                plan.return_status,
                plan.material_status,
                plan.reel_status,
                plan.final_status,
                ", ".join(plan.qc_scans),
            ]])
            logging.info("Batch %d job %s: DBREEL refreshed", batch_number, plan.job_no)
    return 0


def parse_args_from(argv: Sequence[str]) -> argparse.Namespace:
    import sys

    original = sys.argv
    try:
        sys.argv = [original[0], *argv]
        return parse_args()
    finally:
        sys.argv = original


if __name__ == "__main__":
    raise SystemExit(main())
