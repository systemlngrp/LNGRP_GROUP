#!/usr/bin/env python3
"""Unified executable for the Unit-1, Unit-2, and Firm-3 invoice syncs."""

import os
import subprocess
import sys


FIRM_NAMES = {
    "1": "Unit-1 (LNCB-1)",
    "2": "Unit-2 (LNCB-2)",
    "3": "Firm-3 (LNKI)",
}


def parse_args():
    import argparse

    parser = argparse.ArgumentParser(description="Post app invoices to Tally for selected firm(s).")
    parser.add_argument(
        "--firm",
        choices=("1", "2", "3", "all"),
        default="all",
        help="firm to run (default: all)",
    )
    parser.add_argument("--watch", action="store_true", help="keep checking for new invoices")
    parser.add_argument("--interval", type=float, default=20.0, help="seconds between checks")
    parser.add_argument("--retry-after-issue", type=float, default=20.0, help="seconds to retry after an issue")
    return parser.parse_args()


def run_one_firm(firm, args):
    module_name = {
        "1": "invFirm1",
        "2": "invFirm2",
        "3": "invFirm3",
    }[firm]

    try:
        module = __import__(module_name)
    except ModuleNotFoundError:
        invoice_dir = os.path.dirname(os.path.abspath(__file__))
        if invoice_dir not in sys.path:
            sys.path.insert(0, invoice_dir)
        module = __import__(module_name)

    cli_args = []
    if args.watch:
        cli_args.append("--watch")
    cli_args.extend(["--interval", str(args.interval)])
    cli_args.extend(["--retry-after-issue", str(args.retry_after_issue)])
    module.run_cli(cli_args)


def run_all(args):
    if getattr(sys, "frozen", False):
        command = [sys.executable]
    else:
        command = [sys.executable, os.path.abspath(__file__)]

    while True:
        cycle_had_issue = False
        for firm in ("1", "2", "3"):
            child_args = command + [
                "--firm",
                firm,
                "--interval",
                str(args.interval),
                "--retry-after-issue",
                str(args.retry_after_issue),
            ]
            print(f"\nStarting {FIRM_NAMES[firm]} (one pass)...", flush=True)
            result = subprocess.run(child_args, check=False)
            if result.returncode:
                print(f"{FIRM_NAMES[firm]} exited with code {result.returncode}.")
                cycle_had_issue = True

        if not args.watch:
            return

        wait_seconds = args.retry_after_issue if cycle_had_issue else args.interval
        import time

        time.sleep(max(wait_seconds, 5.0))


def main():
    args = parse_args()
    if args.firm == "all":
        run_all(args)
    else:
        print(f"Invoice sync: {FIRM_NAMES[args.firm]}")
        run_one_firm(args.firm, args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")
