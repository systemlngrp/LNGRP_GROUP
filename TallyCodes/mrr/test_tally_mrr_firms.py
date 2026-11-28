import os
import importlib
import xml.etree.ElementTree as ET
from pathlib import Path
from decimal import Decimal
import runpy
import unittest
from unittest.mock import Mock, patch

import tally_mrr
import mrr_posting


PURCHASE_MRR = {
    "id": "mrr-1",
    "transactionNo": "LNCB-1/MRR/26-27/00001",
    "mrrType": "Reel",
    "date": "2026-04-04",
    "invDate": "2026-04-04",
    "invoiceNo": "INV-001",
    "supplierId": "supplier-1",
    "totalInvoiceValue": "100.00",
    "totalCgst": "5.00",
    "totalSgst": "5.00",
    "totalIgst": "0.00",
    "insurance": "0.00",
    "otherCharges": "0.00",
    "roundOff": "0.00",
    "tdsAmount": "0.00",
    "totalAmount": "110.00",
    "lines": [],
}


class MrrFirmRoutingTests(unittest.TestCase):
    def test_resolve_firm_uses_firms_master_and_selected_identity(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchone.return_value = {
            "id": "firm-2-id",
            "firmName": "Unit-II",
            "shortName": "LNCB-2",
            "tallyPortNo": "9002",
        }

        firm = tally_mrr.resolve_firm(connection, 2)

        query, params = cursor.execute.call_args.args
        self.assertIn("FROM firms", query)
        self.assertIn("tallyPortNo", query)
        self.assertIn("unitii", params)
        self.assertIn("LNCB-2", params)
        self.assertEqual(firm["id"], "firm-2-id")
        self.assertEqual(firm["firmName"], "Unit-II")
        self.assertEqual(firm["tallyPortNo"], 9002)

    def test_resolve_firm_reports_missing_firms_table_as_database_config_error(self):
        connection = Mock()
        connection.cursor.return_value.execute.side_effect = tally_mrr.mysql.connector.Error(
            msg="table does not exist", errno=1146
        )
        with self.assertRaisesRegex(RuntimeError, "does not contain the `firms` table"):
            tally_mrr.resolve_firm(connection, 1)

    def test_database_connection_refuses_missing_configuration_without_fallback(self):
        incomplete_config = {"host": "", "user": "", "password": "", "database": ""}
        with patch.dict(tally_mrr.DB_CONFIG, incomplete_config), \
             patch.object(tally_mrr.mysql.connector, "connect") as connect:
            with self.assertRaisesRegex(RuntimeError, "DB_HOST.*DB_USER.*DB_PASSWORD.*DB_NAME"):
                tally_mrr.get_db_connection()
        connect.assert_not_called()

    def test_pending_mrr_query_filters_to_selected_firm(self):
        connection = Mock()
        connection.cursor.return_value.fetchall.return_value = []

        self.assertEqual(tally_mrr.get_pending_mrrs(connection, "firm-3-id"), [])

        query, params = connection.cursor.return_value.execute.call_args.args
        self.assertIn("`firmId` = %s", query)
        self.assertIn("`tdsAmount`", query)
        self.assertIn("'pending tally'", query)
        self.assertIn("'direct service'", query)
        self.assertEqual(params, ("firm-3-id",))

    def test_tally_urls_are_bound_to_firm_port(self):
        self.assertEqual(
            tally_mrr.build_tally_url_candidates(9003),
            ["http://localhost:9003", "http://127.0.0.1:9003"],
        )

    def test_duplicate_check_export_is_filtered_to_supplier(self):
        supplier_name = 'Supplier & "Sons"'
        with patch.object(tally_mrr, "post_xml_to_tally", return_value="<ENVELOPE />") as post:
            result = tally_mrr.fetch_tally_vouchers_for_duplicate_check(
                company_name="Test Company",
                voucher_type="Purchase",
                supplier_name=supplier_name,
                from_date="20260401",
                to_date="20270331",
            )

        payload = post.call_args.args[0]
        self.assertIn("<FILTERS>OnlyTargetParty</FILTERS>", payload)
        self.assertIn(
            '$$StringEqual:$PartyLedgerName:"Supplier &amp; &quot;Sons&quot;"',
            payload,
        )
        self.assertEqual(result, [])

    def test_duplicate_check_fails_closed_when_tally_rejects_export(self):
        response = "<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER></ENVELOPE>"
        with patch.object(tally_mrr, "post_xml_to_tally", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "rejected"):
                tally_mrr.fetch_tally_vouchers_for_duplicate_check(
                    "Unit-I", "Purchase", "Supplier", "20260401", "20270331"
                )

    def test_database_config_prefers_repository_db_environment(self):
        repository_db_environment = {
            "DB_HOST": "db.example.test",
            "DB_USER": "test-user",
            "DB_NAME": "test-database",
            "DB_PORT": "3307",
            "DB_PASSWORD": "test-password",
        }
        original_db_config = tally_mrr.DB_CONFIG
        try:
            with patch.dict(os.environ, repository_db_environment, clear=False):
                importlib.reload(tally_mrr)
                self.assertEqual(tally_mrr.DB_CONFIG["host"], repository_db_environment["DB_HOST"])
                self.assertEqual(tally_mrr.DB_CONFIG["user"], repository_db_environment["DB_USER"])
                self.assertEqual(tally_mrr.DB_CONFIG["database"], repository_db_environment["DB_NAME"])
                self.assertEqual(tally_mrr.DB_CONFIG["port"], int(repository_db_environment["DB_PORT"]))
                self.assertEqual(tally_mrr.DB_CONFIG["password"], repository_db_environment["DB_PASSWORD"])
        finally:
            tally_mrr.DB_CONFIG = original_db_config

    def test_main_delegates_to_mrr_posting_runner(self):
        with patch.object(mrr_posting, "run_pending_mrrs") as run:
            tally_mrr.main(firm_number=2, dry_run=True, mrr_no="MRR-2")
        run.assert_called_once_with(firm_number=2, dry_run=True, mrr_no="MRR-2")

    def test_purchase_xml_posts_inventory_and_balanced_ledgers(self):
        inventory_lines = [{
            "name": 'Reel & "Paper"',
            "quantity": Decimal("10.00"),
            "rate": Decimal("10.00"),
            "amount": Decimal("100.00"),
            "unit": "KGS",
            "batches": [{"name": "REEL-001", "qty": Decimal("10.00")}],
        }]
        xml = mrr_posting.build_purchase_mrr_xml(
            "Unit-I", PURCHASE_MRR, "Supplier & Sons", inventory_lines
        )
        voucher = ET.fromstring(xml).find(".//VOUCHER")
        self.assertEqual(voucher.attrib["VCHTYPE"], "Purchase")
        self.assertEqual(voucher.findtext("VOUCHERTYPENAME"), "Purchase")
        self.assertEqual(voucher.findtext("REFERENCE"), "INV-001")
        item = voucher.find(".//ALLINVENTORYENTRIES.LIST")
        self.assertEqual(item.findtext("STOCKITEMNAME"), 'Reel & "Paper"')
        self.assertEqual(item.findtext("ACTUALQTY"), "10 KGS")
        self.assertEqual(item.findtext("AMOUNT"), "-100.00")
        self.assertEqual(item.findtext(".//BATCHNAME"), "REEL-001")
        ledger_names = [entry.findtext("LEDGERNAME") for entry in voucher.findall("LEDGERENTRIES.LIST")]
        self.assertEqual(
            ledger_names,
            ["Supplier & Sons", "Input CGST", "Input SGST"],
        )

    def test_purchase_validation_rejects_unbalanced_mrr(self):
        inventory_lines = [{
            "name": "Paper",
            "quantity": Decimal("10.00"),
            "rate": Decimal("10.00"),
            "amount": Decimal("100.00"),
            "unit": "KGS",
            "batches": [{"name": "Primary Batch", "qty": Decimal("10.00")}],
        }]
        with self.assertRaisesRegex(RuntimeError, "out of balance"):
            mrr_posting.validate_purchase_mrr({**PURCHASE_MRR, "totalAmount": "109.00"}, inventory_lines)

    def test_purchase_post_timeout_is_not_retried(self):
        with patch.object(tally_mrr, "TALLY_URL_CANDIDATES", ["http://localhost:9002", "http://127.0.0.1:9002"]), \
             patch.object(
                 tally_mrr.requests,
                 "post",
                 side_effect=tally_mrr.requests_exceptions.ReadTimeout,
             ) as post:
            with self.assertRaisesRegex(RuntimeError, "result is unknown"):
                mrr_posting.post_purchase_xml("<ENVELOPE/>")
        post.assert_called_once()

    def test_each_wrapper_selects_its_own_firm(self):
        wrapper_dir = Path(__file__).resolve().parent
        for firm_number in (1, 2, 3):
            with self.subTest(firm_number=firm_number):
                wrapper = wrapper_dir / f"tally_mrr_firm{firm_number}.py"
                with patch.object(tally_mrr, "main") as main:
                    runpy.run_path(str(wrapper), run_name="__main__")
                main.assert_called_once_with(firm_number=firm_number)


if __name__ == "__main__":
    unittest.main()
