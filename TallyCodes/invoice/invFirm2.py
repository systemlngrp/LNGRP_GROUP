#!/usr/bin/env python3
"""Post Unit-2 to LNKI inter-firm invoices to Unit-2 Tally."""

import sys

try:
    import invFirm1 as invoice_engine
except ModuleNotFoundError:
    # Also support launching this file from the repository root.
    from TallyCodes.invoice import invFirm1 as invoice_engine


def resolve_source_unit2(conn):
    """Resolve Unit-2 and configure it as the Tally posting company."""
    firm = invoice_engine.resolve_firm(
        conn,
        "Unit-2",
        ("unitii", "unit2"),
        ("LNCB-2", "UNIT-2", "UNIT2"),
    )
    invoice_engine.UNIT1_FIRM_ID = firm["id"]
    invoice_engine.UNIT1_FIRM_NAME = firm["firmName"]
    invoice_engine.TALLY_COMPANY_NAME = firm["firmName"]
    invoice_engine.TALLY_URL = f"http://127.0.0.1:{firm['tallyPortNo']}"
    return firm


def resolve_destination_lnki(conn):
    return invoice_engine.resolve_firm(
        conn,
        "LNKI",
        ("lnki",),
        ("LNKI",),
    )


def preserve_actual_item_lines(item_lines, source_firm_id, destination_firm_id):
    """Keep the original ERP item name for Unit-2 -> LNKI billing."""
    preserved = []
    for line in item_lines or []:
        copied = dict(line)
        copied["originalItemName"] = str(copied.get("itemName") or "").strip()
        copied["skipTallyPartNoCheck"] = False
        if copied["originalItemName"]:
            invoice_engine.log_terminal(
                "MAPPING",
                f"Item retained: {copied['originalItemName']} (Unit-2 -> LNKI)",
            )
        preserved.append(copied)
    return preserved


# Reconfigure the shared, tested engine for Unit-2 -> LNKI. The engine's
# sync function resolves these callables from its own module globals, so the
# replacements apply to the complete precheck/posting lifecycle.
invoice_engine.resolve_unit1_firm = resolve_source_unit2
invoice_engine.resolve_unit2_firm = resolve_destination_lnki
invoice_engine.map_unit1_to_unit2_invoice_lines = preserve_actual_item_lines
invoice_engine.SKIP_ASSIGNED_NUMBER_DUPLICATE_CHECKS = True


if __name__ == "__main__":
    # Same options as invFirm1.py: run once, or keep running with --watch.
    invoice_engine.run_cli()
