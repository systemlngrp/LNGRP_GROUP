#!/usr/bin/env python3
"""One-time Firm-1 invoice sync without Tally master validation."""

import invFirm1


if __name__ == "__main__":
    engine = invFirm1
    engine.SKIP_TALLY_MASTER_VALIDATION = True
    print(
        "WARNING: one-time Firm-1 run with customer/ledger, stock-item, UOM, "
        "and part-number validation disabled."
    )
    print(
        "Tally numbering and voucher import are still required. Check Tally "
        "before retrying if the result is uncertain."
    )
    engine.run_cli([])
