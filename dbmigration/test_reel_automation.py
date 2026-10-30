import datetime as dt
import unittest

from reel_automation import JobPlan, make_db_rows, parse_reel_codes


class ReelAutomationTests(unittest.TestCase):
    def test_parse_multiple_reel_descriptions(self):
        value = (
            "7020730 - Size: 206 CM X GSM: 120 X BF: 18, "
            "7020726 - Size: 206 CM X GSM: 170 X BF: 18"
        )
        self.assertEqual(parse_reel_codes(value), ["7020730", "7020726"])

    def test_parse_single_code(self):
        self.assertEqual(parse_reel_codes("7020897 - Size: 172 CM"), ["7020897"])

    def test_db_row_flags_missing_material(self):
        plan = JobPlan("6935", dt.date(2026, 4, 1), ["7020897"], 1000)
        plan.material_missing = ["7020897"]
        plan.existing_return_count = 0
        row = make_db_rows([plan])[0]
        self.assertEqual(row[0], "6935")
        self.assertIn("MATERIAL MASTER REVIEW", row[1])
        self.assertIn("MISSING: 7020897", row[3])
        self.assertIn("REAL RETURN DATA REQUIRED", row[2])

    def test_db_row_return_complete_only_when_weight_covers_issue(self):
        plan = JobPlan("7020244", dt.date(2026, 4, 1), ["7020244"], 1000)
        plan.existing_issue_count = 1
        plan.existing_issue_weight = 1000
        plan.existing_return_count = 1
        plan.existing_return_weight = 1000
        row = make_db_rows([plan])[0]
        self.assertEqual(row[2], "COMPLETE")


if __name__ == "__main__":
    unittest.main()
