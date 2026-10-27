"""Offline tests for Firm-1 daily Consumption Journal posting."""

import io
import sys
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import consuption as sync
import mfjFirm1


ISSUE = {
    "id": "issue-1",
    "issueNo": "MIS/26-27/1",
    "consumptionTransactionNo": "CON/26-27/1",
    "date": "2026-10-17",
    "issueType": "General",
    "remarks": "Daily paper consumption",
    "lines": [
        {"materialName": "Kraft Paper", "materialErp": "MAT001", "qty": "12.5", "uom": "KGS", "rate": "32"},
        {"materialName": "Glue", "materialErp": "MAT002", "qty": "2", "uom": "KGS", "rate": "40"},
    ],
}


def register_response(vouchers="", status="1"):
    return f"<ENVELOPE><HEADER><STATUS>{status}</STATUS></HEADER><BODY><DATA>{vouchers}</DATA></BODY></ENVELOPE>"


class ConsumptionFirm1Tests(unittest.TestCase):
    def test_voucher_xml_contains_inventory_entries(self):
        root = ET.fromstring(sync.voucher_xml(ISSUE, "Unit-I"))
        voucher = root.find(".//VOUCHER")
        self.assertEqual(voucher.attrib["VCHTYPE"], "Consumption Journal")
        self.assertEqual(voucher.findtext("ISINVENTORYVOUCHER"), "Yes")
        self.assertEqual(voucher.findtext("VOUCHERNUMBER"), "CON/26-27/1")
        self.assertEqual(voucher.findtext("REFERENCE"), "MIS/26-27/1")
        self.assertEqual(len(voucher.findall("INVENTORYENTRIESOUT.LIST")), 2)
        self.assertEqual(voucher.find(".//INVENTORYENTRIESOUT.LIST/STOCKITEMNAME").text, "Kraft Paper")

    def test_kg_is_normalized_to_kgs_for_voucher_xml(self):
        issue = {**ISSUE, "lines": [{**ISSUE["lines"][0], "uom": "Kg"}]}
        root = ET.fromstring(sync.voucher_xml(issue, "Unit-I"))
        entry = root.find(".//INVENTORYENTRIESOUT.LIST")
        self.assertEqual(entry.findtext("ACTUALQTY"), "12.50 KGS")
        self.assertEqual(entry.findtext("BILLEDQTY"), "12.50 KGS")
        self.assertEqual(entry.findtext("RATE"), "32.00/KGS")

    def test_kg_is_normalized_when_creating_tally_stock_item(self):
        issue = {"lines": [{"materialName": "Kraft Paper", "uom": "Kg"}]}
        with patch.object(sync, "create_stock_item") as create:
            sync.ensure_issue_stock_items(9001, "Unit-I", issue, 1)
        create.assert_called_once_with(9001, "Unit-I", "Kraft Paper", "KGS", 1)

    def test_missing_values_fail_before_posting(self):
        for field, value, message in (("materialName", "", "Material name"), ("uom", "", "UOM"), ("qty", "0", "quantity"), ("rate", "0", "rate")):
            with self.subTest(field=field):
                issue = {**ISSUE, "lines": [{**ISSUE["lines"][0], field: value}]}
                if field == "materialName":
                    issue["lines"][0]["materialErp"] = ""
                with self.assertRaisesRegex(ValueError, message):
                    sync.voucher_xml(issue, "Unit-I")

    def test_group_rows_groups_lines_by_issue(self):
        rows = [
            {"issueId": "a", "issueNo": "MIS/1", "consumptionTransactionNo": "CON/1", "date": "2026-10-17", "lineId": "1"},
            {"issueId": "a", "issueNo": "MIS/1", "consumptionTransactionNo": "CON/1", "date": "2026-10-17", "lineId": "2"},
            {"issueId": "b", "issueNo": "MIS/2", "consumptionTransactionNo": "CON/2", "date": "2026-10-17", "lineId": "3"},
        ]
        grouped = sync.group_rows(rows)
        self.assertEqual(len(grouped), 2)
        self.assertEqual(len(grouped[0]["lines"]), 2)

    def test_get_rows_filters_general_without_job_and_pending_statuses(self):
        connection = Mock()
        connection.cursor.return_value.fetchall.return_value = []
        sync.get_rows(connection)
        query = connection.cursor.return_value.execute.call_args.args[0]
        self.assertIn("material_issues", query)
        self.assertIn("material_issue_lines", query)
        self.assertIn("consumptionTransactionNo", query)
        self.assertIn("tallyTimestamp", query)
        self.assertIn("cancelled", query)
        self.assertIn("not applicable", query)

    def test_get_rows_selects_one_oldest_issue_with_all_its_lines(self):
        connection = Mock()
        connection.cursor.return_value.fetchall.return_value = []
        sync.get_rows(connection, date_filter="2026-10-17", transaction_filter="CON/1")
        query, params = connection.cursor.return_value.execute.call_args.args
        self.assertIn("WHERE mi.id = (SELECT mi_candidate.id", query)
        self.assertIn("ORDER BY mi_candidate.date, mi_candidate.id", query)
        self.assertIn("LIMIT 1", query)
        self.assertIn("FROM material_issue_lines mil_candidate", query)
        self.assertIn("JOIN material_issue_lines mil ON mil.materialIssueId = mi.id", query)
        self.assertEqual(params, ("2026-10-17", "CON/1"))

    def test_firm_port_lookup_uses_firm_specific_identifiers(self):
        cases = (
            (1, "uniti", "LNCB-1"),
            (2, "unitii", "LNCB-2"),
            (3, "laxminarayankraftindustries", "LNKI"),
        )
        for firm_number, normalized_name, short_name in cases:
            with self.subTest(firm_number=firm_number):
                connection = Mock()
                cursor = connection.cursor.return_value
                cursor.fetchall.return_value = [{"firmName": "Configured Firm", "tallyPortNo": "9002"}]
                port, company = sync.get_port_and_company(connection, firm_number)
                query, params = cursor.execute.call_args.args
                self.assertEqual((port, company), ("9002", "Configured Firm"))
                self.assertIn(normalized_name, params)
                self.assertIn(short_name, params)
                self.assertIn("tallyPortNo", query)

    def test_existing_voucher_type_is_not_recreated(self):
        with patch.object(
            mfjFirm1,
            "create_voucher_type",
            side_effect=RuntimeError("Cannot change Type of Voucher!"),
        ) as create:
            sync.ensure_voucher_type(9001, "Unit-I", sync.VOUCHER_TYPE, 1)
        create.assert_called_once_with(9001, "Unit-I", sync.VOUCHER_TYPE, 1)

    def test_unrelated_voucher_type_errors_are_preserved(self):
        with patch.object(
            mfjFirm1,
            "create_voucher_type",
            side_effect=RuntimeError("Tally connection failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "Tally connection failed"):
                sync.ensure_voucher_type(9001, "Unit-I", sync.VOUCHER_TYPE, 1)

    def test_register_lookup_matches_consumption_number(self):
        voucher = "<VOUCHER VCHTYPE='Consumption Journal'><VOUCHERNUMBER>CON/26-27/1</VOUCHERNUMBER></VOUCHER>"
        with patch.object(sync.urllib.request, "urlopen", return_value=io.BytesIO(register_response(voucher).encode())):
            result = sync.find_existing_voucher(9001, "Unit-I", "CON/26-27/1", "MIS/26-27/1", ISSUE["date"], 1)
        self.assertEqual(result["voucher"], "CON/26-27/1")

    def test_register_lookup_matches_issue_reference(self):
        voucher = "<VOUCHER VCHTYPE='Consumption Journal'><REFERENCE>MIS/26-27/1</REFERENCE><VOUCHERNUMBER>1</VOUCHERNUMBER></VOUCHER>"
        with patch.object(sync.urllib.request, "urlopen", return_value=io.BytesIO(register_response(voucher).encode())):
            result = sync.find_existing_voucher(9001, "Unit-I", "CON/26-27/1", "MIS/26-27/1", ISSUE["date"], 1)
        self.assertEqual(result["voucher"], "1")

    def test_dry_run_does_not_post_or_save(self):
        connection = Mock()
        flat_rows = [{**ISSUE, **ISSUE["lines"][0], "issueId": ISSUE["id"], "lineId": "1"}]
        with patch.object(sync, "load_env"), patch.object(sync, "connect_db", return_value=connection), \
             patch.object(sync, "get_port_and_company", return_value=("9001", "Unit-I")), \
             patch.object(sync, "get_rows", return_value=flat_rows), \
             patch.object(sync, "find_existing_voucher") as lookup, patch.object(sync, "post_tally") as post, \
             patch.object(sync, "save_result") as save, patch("sys.argv", ["consuptionfirm1.py", "--dry-run"]), \
             redirect_stdout(io.StringIO()) as output:
            sync.main()
        self.assertIn("[DRY-RUN] Firm-1", output.getvalue())
        lookup.assert_not_called()
        post.assert_not_called()
        save.assert_not_called()
        connection.close.assert_called_once()

    def test_cli_selects_firm(self):
        connection = Mock()
        with patch.object(sync, "load_env"), \
             patch.object(sync, "connect_db", return_value=connection), \
             patch.object(sync, "get_port_and_company", return_value=("9002", "Unit-II")) as get_firm, \
             patch.object(sync, "get_rows", return_value=[]), \
             patch("sys.argv", ["consuptionfirm1.py", "--firm", "2"]), \
             redirect_stdout(io.StringIO()) as output:
            sync.main()
        get_firm.assert_called_once_with(connection, 2)
        self.assertIn("Firm-2 Consumption Tally port", output.getvalue())

    def test_explicit_tally_exception_is_preserved(self):
        response = "<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><LINEERROR>No accounting entries are available</LINEERROR></DATA></BODY></ENVELOPE>"
        with patch.object(sync.urllib.request, "urlopen", return_value=io.BytesIO(response.encode())):
            result = sync.post_tally(9001, "<ENVELOPE/>", "Unit-I", ISSUE["consumptionTransactionNo"], ISSUE["date"], 1)
        self.assertEqual(result["status"], "Failed")
        self.assertIn("No accounting entries are available", result["error"])


if __name__ == "__main__":
    unittest.main()
