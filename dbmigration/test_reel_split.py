import datetime as dt
import tempfile
import unittest
from pathlib import Path

from reel_automation import JobPlan
from reel_issue_to_dbreel import block_apply_for_zero_stock, stock_block_diagnostics
from reel_return_to_dbreel import load_return_csv, return_key, validate_and_filter_returns


class ReelSplitTests(unittest.TestCase):
    def test_exhausted_stock_is_reported_as_a_block(self):
        plan = JobPlan("6935", dt.date(2026, 4, 1), ["7020897"], 2304)
        source = {"REEL WISE STOCK": (
            ["ERP", "Available Weight"],
            [["7020897", "0"], ["7020897", "0"]],
        )}
        diagnostics = stock_block_diagnostics(source, [plan])
        self.assertEqual(diagnostics[0]["job_no"], "6935")
        self.assertEqual(diagnostics[0]["matching_reel_count"], 2)
        self.assertEqual(diagnostics[0]["available_weight"], 0)
        with self.assertRaises(SystemExit):
            block_apply_for_zero_stock(diagnostics)

    def test_positive_stock_is_not_blocked(self):
        plan = JobPlan("6935", dt.date(2026, 4, 1), ["7020897"], 2304)
        source = {"REEL WISE STOCK": (
            ["ERP", "Available Weight"],
            [["7020897", "2500"]],
        )}
        diagnostics = stock_block_diagnostics(source, [plan])
        self.assertEqual(diagnostics, [])
        block_apply_for_zero_stock(diagnostics)

    def test_return_csv_requires_business_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "returns.csv"
            path.write_text("job_no,our_reel_no,weight\n1,R1,10\n", encoding="utf-8")
            with self.assertRaises(SystemExit):
                load_return_csv(str(path))

    def test_return_key_normalizes_weight(self):
        self.assertEqual(return_key({"job_no": "1", "our_reel_no": "R1", "weight": "10.0", "return_date": "2026-04-01"}), ("1", "R1", 10.0, "2026-04-01"))

    def test_unissued_reel_is_rejected(self):
        source = {
            "REEL ISSUE": (["JOB NO.", "QR Scan", "Weight"], [["1", "R1", "10"]]),
            "REEL RETURN": (["JOB", "QR Scan", "Weight", "RETURN DATE"], []),
        }
        with self.assertRaises(SystemExit):
            validate_and_filter_returns([{"job_no": "1", "our_reel_no": "R2", "weight": "5", "return_date": "2026-04-01"}], source)

    def test_duplicate_return_is_skipped(self):
        source = {
            "REEL ISSUE": (["JOB NO.", "QR Scan", "Weight"], [["1", "R1", "10"]]),
            "REEL RETURN": (["JOB", "QR Scan", "Weight", "RETURN DATE"], [["1", "R1", "5", "2026-04-01"]]),
        }
        accepted, skipped = validate_and_filter_returns([{"job_no": "1", "our_reel_no": "R1", "weight": "5", "return_date": "2026-04-01"}], source)
        self.assertEqual(accepted, [])
        self.assertEqual(len(skipped), 1)


if __name__ == "__main__":
    unittest.main()
