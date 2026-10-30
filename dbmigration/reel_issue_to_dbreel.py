#!/usr/bin/env python3
"""Create missing reel issues and refresh DBREEL status rows.

Dry-run is the default. Use --apply only after reviewing the decision log.
The existing reel_automation.py entry point is intentionally left unchanged.
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from typing import Any, Mapping, Sequence

from reel_automation import (
    DEFAULT_START_DATE,
    JobPlan,
    apply_db_rows,
    apply_issue_result,
    apply_issue_rows,
    apply_material_rows,
    apply_reel_rows,
    as_date,
    authorize,
    build_plans,
    clean,
    is_production_order_resume,
    load_source_book,
    make_batches,
    number,
    preflight_apply,
    resolve_credentials_path,
    write_log,
)


def stock_block_diagnostics(
    source_data: Mapping[str, tuple[list[str], list[list[str]]]],
    plans: Sequence[JobPlan],
) -> list[dict[str, Any]]:
    """Return one diagnostic per plan/ERP with no positive stock available."""
    headers, rows = source_data["REEL WISE STOCK"]
    indexes = {clean(value).casefold(): index for index, value in enumerate(headers)}
    erp_index = indexes.get("erp")
    available_index = indexes.get("available weight")
    if erp_index is None or available_index is None:
        raise SystemExit("REEL WISE STOCK must contain ERP and Available Weight columns")

    stock_by_erp: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        if len(row) <= max(erp_index, available_index):
            continue
        erp = clean(row[erp_index])
        if erp:
            stock_by_erp[erp].append(number(row[available_index]))

    diagnostics: list[dict[str, Any]] = []
    for plan in plans:
        for erp in plan.reel_codes:
            values = stock_by_erp.get(erp, [])
            available = sum(value for value in values if value > 0)
            if values and available <= 0:
                reason = "all matching reels are exhausted (available weight is zero)"
            elif not values:
                reason = "no matching reel exists in REEL WISE STOCK"
            else:
                continue
            diagnostics.append({
                "job_no": plan.job_no,
                "erp": erp,
                "required_weight": plan.required_weight,
                "matching_reel_count": len(values),
                "available_weight": available,
                "reason": reason,
            })
    return diagnostics


def block_apply_for_zero_stock(diagnostics: Sequence[Mapping[str, Any]]) -> None:
    """Stop before any write when the selected batch contains stock blockers."""
    if not diagnostics:
        return
    details = "; ".join(
        f"job {item['job_no']} ERP {item['erp']} "
        f"required {number(item['required_weight']):g} kg, "
        f"available {number(item['available_weight']):g} kg ({item['reason']})"
        for item in diagnostics
    )
    raise SystemExit(
        "Apply blocked before any write because selected jobs have no usable stock: "
        + details
        + ". Add/receive unused reels in REEL WISE STOCK and rerun --dry-run."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read and report only (default).")
    mode.add_argument("--apply", action="store_true", help="Write issue/master/DBREEL rows.")
    parser.add_argument("--credentials", default="", help="Service-account JSON path.")
    parser.add_argument(
        "--spreadsheet-id",
        default="1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ",
    )
    parser.add_argument("--start-date", default=DEFAULT_START_DATE.isoformat())
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--start-batch", type=int, default=1)
    parser.add_argument("--max-batches", type=int, default=0)
    parser.add_argument("--resume-from-job", default="")
    parser.add_argument("--log", default="reel_issue_to_dbreel_log.csv")
    return parser.parse_args()


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args() if argv is None else parse_args_from(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    start_date = as_date(args.start_date)
    if not start_date:
        raise SystemExit(f"Invalid --start-date: {args.start_date}")

    credentials = resolve_credentials_path(args.credentials)
    if not credentials.exists():
        raise SystemExit(
            f"Credentials not found: {credentials}. Download a Google service-account key, "
            "save it there, and share the workbook with the service-account email."
        )

    book = authorize(str(credentials)).open_by_key(args.spreadsheet_id)
    source_data = load_source_book(book)
    plans = build_plans(source_data, start_date)

    if is_production_order_resume(args.resume_from_job):
        args.resume_from_job = ""
    if args.resume_from_job:
        requested_job = clean(args.resume_from_job)
        resume_index = next((i for i, plan in enumerate(plans) if plan.job_no == requested_job), None)
        if resume_index is None:
            raise SystemExit(f"--resume-from-job not found in DAILY PRODUCTION MASTER: {requested_job}")
        plans = plans[resume_index:]

    batches = make_batches(plans, args.batch_size, args.start_batch, args.max_batches)
    selected_plans = [plan for _, batch in batches for plan in batch]
    diagnostics = stock_block_diagnostics(source_data, selected_plans)
    write_log(args.log, plans, args.batch_size)
    logging.info("Found %d jobs from %s onward", len(plans), start_date.isoformat())
    logging.info("Planned issue rows: %d", sum(len(plan.issue_rows) for plan in selected_plans))
    if diagnostics:
        logging.info("Stock-block diagnostics:")
        for item in diagnostics:
            logging.info(
                "  job=%s ERP=%s required_kg=%g matching_reels=%d available_kg=%g reason=%s",
                item["job_no"], item["erp"], number(item["required_weight"]),
                item["matching_reel_count"], number(item["available_weight"]), item["reason"],
            )

    if not args.apply:
        logging.info("DRY RUN: no Google Sheet cells were changed")
        return 0

    block_apply_for_zero_stock(diagnostics)
    preflight_apply(book, selected_plans, [])
    total_issues = total_db = 0
    for batch_number, batch in batches:
        for plan in batch:
            material_count = apply_material_rows(book, [plan])
            reel_count = apply_reel_rows(book, [plan])
            issue_count = apply_issue_rows(book, [plan])
            apply_issue_result(plan, issue_count)
            db_count = apply_db_rows(book, [[
                plan.job_no,
                plan.issue_status,
                plan.return_status,
                plan.material_status,
                plan.reel_status,
                plan.final_status,
                ", ".join(plan.qc_scans),
            ]])
            logging.info(
                "Batch %d job %s: materials=%d reels=%d issues=%d DBREEL=%d",
                batch_number, plan.job_no, material_count, reel_count, issue_count, db_count,
            )
            total_issues += issue_count
            total_db += db_count
    logging.info("Applied totals: issues=%d DBREEL=%d", total_issues, total_db)
    return 0


def parse_args_from(argv: Sequence[str]) -> argparse.Namespace:
    """Parse an explicit argv sequence for tests and embedding."""
    import sys

    original = sys.argv
    try:
        sys.argv = [original[0], *argv]
        return parse_args()
    finally:
        sys.argv = original


if __name__ == "__main__":
    raise SystemExit(main())
