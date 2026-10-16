"""Offline checks for Unit-2 Manufacturing Journal posting decisions."""

import io
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

import mfjFirm1
import mfjFirm2


JOB = "LNKI/JOB/26-27/17"
ROW = {
    "id": "printing-1",
    "jobNo": JOB,
    "date": "2026-10-16",
    "qty": "12.5",
    "rate": "8",
    "uom": "PCS",
    "itemName": "Finished Item",
}


def register_response(vouchers="", status="1"):
    return f"<ENVELOPE><HEADER><STATUS>{status}</STATUS></HEADER><BODY><DATA>{vouchers}</DATA></BODY></ENVELOPE>"


class Firm2JournalTests(unittest.TestCase):
    def post_response(self, response):
        with patch.object(mfjFirm1.urllib.request, "urlopen", return_value=io.BytesIO(response.encode())), \
             patch.object(mfjFirm1, "fetch_voucher_number") as fetch:
            result = mfjFirm1.post_tally(9002, "<ENVELOPE/>", "Unit-2", JOB, ROW["date"], 1)
        fetch.assert_not_called()
        return result

    def lookup(self, response):
        with patch.object(mfjFirm2.urllib.request, "urlopen", return_value=io.BytesIO(response.encode())) as urlopen:
            result = mfjFirm2.find_existing_voucher(9002, "Unit-2", JOB, ROW["date"], 1)
            request = urlopen.call_args.args[0]
        self.assertIn(b"<SVFROMDATE>20261016</SVFROMDATE>", request.data)
        return result

    def test_missing_voucher_is_safe_to_create(self):
        self.assertIsNone(self.lookup(register_response()))

    def test_invalid_character_reference_is_cleaned_before_matching(self):
        voucher = (
            "<VOUCHER VCHTYPE='Manufacturing Journal' MASTERID='42'>"
            f"<REFERENCE>{JOB}</REFERENCE><VOUCHERNUMBER>MJ-42</VOUCHERNUMBER>"
            "<NARRATION>Bad &#x1F; reference</NARRATION></VOUCHER>"
        )
        self.assertEqual(self.lookup(register_response(voucher))["voucher"], "MJ-42")

    def test_lookup_can_match_the_voucher_number(self):
        voucher = (
            "<VOUCHER VCHTYPE='Manufacturing Journal' MASTERID='43'>"
            f"<VOUCHERNUMBER>{JOB}</VOUCHERNUMBER></VOUCHER>"
        )
        self.assertEqual(self.lookup(register_response(voucher))["MASTERID"], "43")

    def test_unreadable_or_rejected_register_stops_creation(self):
        for response in ("<ENVELOPE><BODY>", register_response(status="0"), "<HTML/>"):
            with self.subTest(response=response):
                with self.assertRaises(RuntimeError):
                    self.lookup(response)

    def test_import_exception_reports_tally_exception_instead_of_zero_error(self):
        response = (
            "<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><IMPORTRESULT>"
            "<CREATED>0</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS>"
            "<EXCEPTIONS>1</EXCEPTIONS></IMPORTRESULT></DATA></BODY></ENVELOPE>"
        )
        result = self.post_response(response)
        self.assertEqual(result["status"], "Failed")
        self.assertIn("EXCEPTIONS=1", result["error"])
        self.assertIn("Import > Exceptions", result["error"])

    def test_import_status_and_data_error_are_not_hidden(self):
        response = "<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER><BODY><DATA>DESC not found</DATA></BODY></ENVELOPE>"
        result = self.post_response(response)
        self.assertEqual(result["status"], "Failed")
        self.assertIn("DESC not found", result["error"])
        self.assertIn("STATUS=0", result["error"])

    def test_successful_import_keeps_posted_status(self):
        result = self.post_response("<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED>"
                                    "<ERRORS>0</ERRORS><VOUCHERNUMBER>MJ-42</VOUCHERNUMBER></RESPONSE>")
        self.assertEqual(result, {"status": "Posted", "voucher": "MJ-42", "error": None})

    def test_create_and_alter_xml_use_full_printing_value(self):
        for existing, action in (({}, "Create"), ({"voucher": "MJ-42", "MASTERID": "42"}, "Alter")):
            with self.subTest(action=action):
                root = ET.fromstring(mfjFirm2.voucher_xml(ROW, "Unit-2", existing))
                voucher = root.find(".//VOUCHER")
                self.assertEqual(voucher.attrib["ACTION"], action)
                self.assertEqual(voucher.findtext("DATE"), "20261016")
                self.assertEqual(voucher.findtext("REFERENCE"), JOB)
                self.assertEqual(voucher.findtext(".//INVENTORYENTRIESOUT.LIST/AMOUNT"), "100.00")
                self.assertEqual(voucher.findtext(".//INVENTORYENTRIESOUT.LIST/RATE"), "8.00/PCS")
                self.assertEqual(voucher.findtext("VOUCHERNUMBER"), existing.get("voucher") or JOB)
                self.assertEqual(voucher.attrib.get("MASTERID"), existing.get("MASTERID"))

    def test_missing_rate_fails_before_posting(self):
        with self.assertRaisesRegex(ValueError, "rate is missing"):
            mfjFirm2.voucher_xml({**ROW, "rate": 0}, "Unit-2", {})

    def test_row_query_includes_lnki_and_skips_posted_unless_retry(self):
        connection = Mock()
        connection.cursor.return_value.fetchall.return_value = []
        mfjFirm2.get_rows(connection)
        query = connection.cursor.return_value.execute.call_args.args[0]
        self.assertIn("machineName", query)
        self.assertIn("'printing'", query)
        self.assertIn("'posted', 'completed'", query)
        self.assertNotIn("LNKI", query)
        connection.cursor.return_value.execute.reset_mock()
        mfjFirm2.get_rows(connection, retry=True)
        query = connection.cursor.return_value.execute.call_args.args[0]
        self.assertNotIn("'posted', 'completed'", query)

    def test_dry_run_does_not_query_or_write_tally_or_database(self):
        connection = Mock()
        with patch.object(mfjFirm2, "load_env"), \
             patch.object(mfjFirm2, "connect_db", return_value=connection), \
             patch.object(mfjFirm2, "get_port_and_company", return_value=("9002", "Unit-2")), \
             patch.object(mfjFirm2, "get_rows", return_value=[ROW.copy()]), \
             patch.object(mfjFirm2, "find_existing_voucher") as find, \
             patch.object(mfjFirm2, "ensure_stock_items") as ensure, \
             patch.object(mfjFirm2, "post_tally") as post, \
             patch.object(mfjFirm2, "save_result") as save, \
             patch("sys.argv", ["mfjFirm2.py", "--dry-run"]), \
             redirect_stdout(io.StringIO()) as output:
            mfjFirm2.main()
        self.assertIn("[DRY-RUN] Firm-2", output.getvalue())
        find.assert_not_called()
        ensure.assert_not_called()
        post.assert_not_called()
        save.assert_not_called()
        connection.close.assert_called_once()

    def test_run_uses_create_or_alter_and_never_posts_when_lookup_fails(self):
        for existing, expected_action in ((None, "Create"), ({"voucher": "MJ-42"}, "Alter")):
            with self.subTest(action=expected_action):
                connection = Mock()
                with patch.object(mfjFirm2, "load_env"), \
                     patch.object(mfjFirm2, "connect_db", return_value=connection), \
                     patch.object(mfjFirm2, "get_port_and_company", return_value=("9002", "Unit-2")), \
                     patch.object(mfjFirm2, "get_rows", return_value=[ROW.copy()]), \
                     patch.object(mfjFirm2, "find_existing_voucher", return_value=existing), \
                     patch.object(mfjFirm2, "ensure_stock_items"), \
                     patch.object(mfjFirm2, "create_stock_item"), \
                     patch.object(mfjFirm2, "post_tally", return_value={"status": "Posted", "voucher": "MJ-42"}) as post, \
                     patch.object(mfjFirm2, "save_result") as save, \
                     patch("sys.argv", ["mfjFirm2.py"]), \
                     redirect_stdout(io.StringIO()) as output:
                    mfjFirm2.main()
                payload = ET.fromstring(post.call_args.args[1])
                self.assertEqual(payload.find(".//VOUCHER").attrib["ACTION"], expected_action)
                self.assertIn("[SUCCESS] Firm-2", output.getvalue())
                self.assertEqual(save.call_args.args[2]["status"], "Posted")

        with patch.object(mfjFirm2, "load_env"), \
             patch.object(mfjFirm2, "connect_db", return_value=Mock()), \
             patch.object(mfjFirm2, "get_port_and_company", return_value=("9002", "Unit-2")), \
             patch.object(mfjFirm2, "get_rows", return_value=[ROW.copy()]), \
             patch.object(mfjFirm2, "find_existing_voucher", side_effect=RuntimeError("Unreadable register")), \
             patch.object(mfjFirm2, "post_tally") as post, \
             patch.object(mfjFirm2, "save_result") as save, \
             patch("sys.argv", ["mfjFirm2.py"]), \
             redirect_stdout(io.StringIO()) as output:
            mfjFirm2.main()
        post.assert_not_called()
        self.assertEqual(save.call_args.args[2]["status"], "Failed")
        self.assertIn("[FAILED] Firm-2", output.getvalue())


if __name__ == "__main__":
    unittest.main()
