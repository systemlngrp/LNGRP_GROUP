"""Normalize production transactionNo values from Daily Production Master.

Dry-run is the default. Only productions whose job card is present in the
source sheet are considered; transactionNo and all other fields are preserved.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict

import pymysql

from migrate_daily_bk_orders_jobs import connect, load_runtime_env, sheet_rows, safe_rollback

PREFIX = "JOB/26-27/"


def normalize_job_card(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    match = re.search(r"(?:job/\d{2}-\d{2}/)?([^/]+)$", raw, re.IGNORECASE)
    card = (match.group(1) if match else raw).strip()
    if re.fullmatch(r"\d+\.0+", card):
        card = card.split(".", 1)[0]
    return f"{PREFIX}{card}" if card else ""


def source_cards() -> tuple[dict[str, str], dict[str, list[str]]]:
    _, _, daily = sheet_rows(include_all_daily=True)
    cards: dict[str, str] = {}
    duplicates: dict[str, list[str]] = defaultdict(list)
    for row in daily:
        formatted = normalize_job_card(row.get("jobcard"))
        if not formatted:
            continue
        card_key = formatted.casefold()
        duplicates[card_key].append(str(row.get("jobcard", "")).strip())
        cards[card_key] = formatted
    conflicts = {key: values for key, values in duplicates.items() if len(set(values)) > 1}
    for key in conflicts:
        cards.pop(key, None)
    return cards, conflicts


def load_candidates(db, cards: dict[str, str]):
    with db.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT id, jobCardNo, transactionNo, status FROM productions")
        candidates = []
        unmatched = []
        for row in cur.fetchall():
            current = str(row.get("jobCardNo") or "").strip()
            formatted = cards.get(current.casefold()) or cards.get(normalize_job_card(current).casefold())
            if not formatted:
                continue
            transaction = str(row.get("transactionNo") or "").strip()
            if transaction.casefold() == formatted.casefold():
                continue
            status = str(row.get("status") or "").strip().casefold()
            if status in {"completed", "cancelled"}:
                unmatched.append({"id": row["id"], "jobCardNo": current, "status": row.get("status"), "reason": "protected status"})
                continue
            candidates.append({"id": row["id"], "jobCardNo": current, "old": transaction, "new": formatted})
        return candidates, unmatched


def chunks(values, size):
    for i in range(0, len(values), size):
        yield values[i:i + size]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--start-batch", type=int, default=1)
    parser.add_argument("--max-batches", type=int, default=0)
    args = parser.parse_args()
    if args.batch_size <= 0 or args.start_batch <= 0 or args.max_batches < 0:
        parser.error("batch-size/start-batch must be positive and max-batches cannot be negative")
    try:
        load_runtime_env()
        cards, conflicts = source_cards()
        db = connect()
        try:
            candidates, protected = load_candidates(db, cards)
        finally:
            db.close()
        batches = list(chunks(candidates, args.batch_size))
        end = len(batches) if not args.max_batches else min(len(batches), args.start_batch + args.max_batches - 1)
        selected = list(enumerate(batches[args.start_batch - 1:end], start=args.start_batch))
        print(f"Source job cards: {len(cards)}; matching updates: {len(candidates)}; protected skips: {len(protected)}")
        print(f"Conflicting source cards skipped: {len(conflicts)}; batches: {len(batches)}; selected: {len(selected)}")
        if conflicts:
            print("Conflicts: " + ", ".join(sorted(conflicts)))
        if not args.apply:
            for number, batch in selected:
                print(f"Batch {number}: rows={len(batch)}; updates={len(batch)}; dry-run only")
            print("DRY RUN: no database changes committed.")
            return 0
        for number, batch in selected:
            db = connect()
            try:
                db.begin()
                with db.cursor() as cur:
                    for row in batch:
                        cur.execute("UPDATE productions SET transactionNo=%s WHERE id=%s", (row["new"], row["id"]))
                db.commit()
                print(f"Batch {number}: committed updates={len(batch)}")
            except Exception as exc:
                safe_rollback(db)
                raise RuntimeError(f"Batch {number} rolled back: {exc}") from exc
            finally:
                db.close()
        print("Migration completed.")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
