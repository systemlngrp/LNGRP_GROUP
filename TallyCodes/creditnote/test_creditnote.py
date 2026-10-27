import unittest
from unittest.mock import Mock, patch

import creditnote


FIRMS = [
    {"id": "firm-1", "firmName": "Unit-I", "shortName": "LNCB-1", "tallyPortNo": "9001"},
    {"id": "firm-2", "firmName": "Unit-II", "shortName": "LNCB-2", "tallyPortNo": "9002"},
    {"id": "firm-3", "firmName": "LNKI", "shortName": "LNKI", "tallyPortNo": "9003"},
]


class CreditNoteFirmSelectionTests(unittest.TestCase):
    def test_resolve_firm_by_id_name_short_name_or_number(self):
        with patch.object(creditnote, "get_firms", return_value=FIRMS):
            self.assertEqual(creditnote.resolve_firm(Mock(), "firm-2")["tallyPortNo"], 9002)
            self.assertEqual(creditnote.resolve_firm(Mock(), "unit-ii")["id"], "firm-2")
            self.assertEqual(creditnote.resolve_firm(Mock(), "lncb-1")["id"], "firm-1")
            self.assertEqual(creditnote.resolve_firm(Mock(), "3")["id"], "firm-3")

    def test_pending_rows_are_filtered_to_selected_firm(self):
        connection = Mock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = []

        creditnote.get_pending_credit_note_rows(connection, firm_id="firm-2", mrr_no="MRR-2", limit=3)

        query, params = cursor.execute.call_args.args
        self.assertIn("`firmId` = %s", query)
        self.assertEqual(params, ("firm-2", "MRR-2", 3))

    def test_tally_urls_use_selected_firm_port(self):
        with patch.dict("os.environ", {"LNPI_TALLY_URL": "http://localhost:9004"}, clear=False):
            urls = creditnote.build_tally_url_candidates(9002)
        self.assertEqual(urls, ["http://localhost:9002", "http://127.0.0.1:9002"])


if __name__ == "__main__":
    unittest.main()
