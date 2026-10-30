import datetime as dt
import unittest

from reel_automation import (
    JobPlan,
    is_production_order_resume,
    make_batches,
    make_db_rows,
    parse_reel_codes,
    protected_sheet_access,
    unique_values,
)


class ReelAutomationTests(unittest.TestCase):
    def test_parse_multiple_reel_descriptions(self):
        value = (
            "7020730 - Size: 206 CM X GSM: 120 X BF: 18, "
            "7020726 - Size: 206 CM X GSM: 170 X BF: 18"
        )
        self.assertEqual(parse_reel_codes(value), ["7020730", "7020726"])

    def test_parse_single_code(self):
        self.assertEqual(parse_reel_codes("7020897 - Size: 172 CM"), ["7020897"])

    def test_qc_scans_are_unique_and_ordered(self):
        self.assertEqual(unique_values(["11104632", "", "11104632", 11106314]), ["11104632", "11106314"])

    def test_authorized_protected_sheet_is_allowed(self):
        metadata = {"sheets": [{
            "properties": {"title": "REEL ISSUE"},
            "protectedRanges": [{
                "requestingUserCanEdit": True,
                "editors": {"users": ["dbmigrations@example.com"]},
            }],
        }]}
        self.assertEqual(protected_sheet_access(metadata, "REEL ISSUE", "dbmigrations@example.com"), (True, True))

    def test_unauthorized_protected_sheet_is_blocked(self):
        metadata = {"sheets": [{
            "properties": {"title": "REEL ISSUE"},
            "protectedRanges": [{
                "requestingUserCanEdit": False,
                "editors": {"users": ["owner@example.com"]},
            }],
        }]}
        self.assertEqual(protected_sheet_access(metadata, "REEL ISSUE", "dbmigrations@example.com"), (True, False))

    def test_batches_of_fifty_and_partial_final_batch(self):
        plans = [JobPlan(str(index), dt.date(2026, 4, 1), [], 0) for index in range(123)]
        batches = make_batches(plans, 50, 1, 0)
        self.assertEqual([len(batch) for _, batch in batches], [50, 50, 23])
        self.assertEqual([number for number, _ in batches], [1, 2, 3])

    def test_batch_resume_starts_at_requested_batch(self):
        plans = [JobPlan(str(index), dt.date(2026, 4, 1), [], 0) for index in range(123)]
        batches = make_batches(plans, 50, 2, 1)
        self.assertEqual([(number, len(batch)) for number, batch in batches], [(2, 50)])

    def test_resume_placeholder_uses_production_order(self):
        for value in ("JOB_NUMBER", "JOB NO", "<JOB_NUMBER>", "AUTO", "PRODUCTION"):
            self.assertTrue(is_production_order_resume(value))

    def test_real_resume_value_is_not_treated_as_placeholder(self):
        self.assertFalse(is_production_order_resume("6935"))

    def test_db_row_flags_missing_material(self):
        plan = JobPlan("6935", dt.date(2026, 4, 1), ["7020897"], 1000)
        plan.material_missing = ["7020897"]
        plan.existing_return_count = 0
        row = make_db_rows([plan])[0]
        self.assertEqual(row[0], "6935")
        self.assertIn("MATERIAL MASTER REVIEW", row[1])
        self.assertIn("MISSING: 7020897", row[3])
        self.assertIn("REAL RETURN DATA REQUIRED", row[2])

    def test_db_row_contains_qc_scan_column(self):
        plan = JobPlan("6936", dt.date(2026, 4, 1), ["7020730"], 1000)
        plan.qc_scans = ["11104632", "11106314"]
        row = make_db_rows([plan])[0]
        self.assertEqual(row[6], "11104632, 11106314")

    def test_db_row_return_complete_only_when_weight_covers_issue(self):
        plan = JobPlan("7020244", dt.date(2026, 4, 1), ["7020244"], 1000)
        plan.existing_issue_count = 1
        plan.existing_issue_weight = 1000
        plan.existing_return_count = 1
        plan.existing_return_weight = 1000
        row = make_db_rows([plan])[0]
        self.assertEqual(row[2], "COMPLETE")

    def test_final_status_requires_real_return(self):
        plan = JobPlan("100", dt.date(2026, 4, 1), ["7020001"], 1000)
        plan.existing_issue_count = 1
        plan.existing_issue_weight = 1000
        self.assertEqual(plan.final_status, "PENDING - REAL RETURN DATA REQUIRED")
        plan.existing_return_count = 1
        plan.existing_return_weight = 1000
        self.assertEqual(plan.final_status, "COMPLETE")


if __name__ == "__main__":
    unittest.main()
