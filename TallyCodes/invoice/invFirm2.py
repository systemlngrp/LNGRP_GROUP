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


if __name__ == "__main__":
    try:
        invoice_engine.print_tally_sync_config_summary()
        run_had_issue, final_issue_message = invoice_engine.sync_invoices_to_tally()
        if run_had_issue:
            invoice_engine.report_stopped()
            sys.exit(1)
    except invoice_engine.mysql.connector.Error as exc:
        invoice_engine.append_failure_text_log("RUNTIME", str(exc))
        print(f"Database connection failed: {exc}")
        sys.exit(1)
    except Exception as exc:
        invoice_engine.append_failure_text_log("RUNTIME", str(exc))
        print(f"Invoice sync failed: {exc}")
        invoice_engine.report_stopped()
        sys.exit(1)
