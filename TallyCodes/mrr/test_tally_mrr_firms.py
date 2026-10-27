import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock, patch

import tally_mrr


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

    def test_pending_mrr_query_filters_to_selected_firm(self):
        connection = Mock()
        connection.cursor.return_value.fetchall.return_value = []

        self.assertEqual(tally_mrr.get_pending_mrrs(connection, "firm-3-id"), [])

        query, params = connection.cursor.return_value.execute.call_args.args
        self.assertIn("`firmId` = %s", query)
        self.assertIn("0 AS `tdsAmount`", query)
        self.assertNotIn("`roundOff`, `tdsAmount`", query)
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

    def test_database_config_prefers_repository_db_environment(self):
        self.assertEqual(tally_mrr.DB_CONFIG["host"], os.environ["DB_HOST"])
        self.assertEqual(tally_mrr.DB_CONFIG["user"], os.environ["DB_USER"])
        self.assertEqual(tally_mrr.DB_CONFIG["database"], os.environ["DB_NAME"])
        self.assertEqual(tally_mrr.DB_CONFIG["port"], int(os.environ["DB_PORT"]))
        self.assertEqual(tally_mrr.DB_CONFIG["password"], os.environ["DB_PASSWORD"])

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
