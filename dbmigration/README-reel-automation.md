# Reel automation

This utility reconciles jobs from `DAILY PRODUCTION MASTER` dated from 1 April
2026 onward. It processes jobs sequentially inside 50-job batches:
material, reel, issue, real return check, then DBREEL. It checks `ITEM MASTER`
and `REEL WISE STOCK`, creates missing master records from `HELPER SHEET`, and
writes a status view to `DBREEL`. Column G is `QC SCAN / OUR REEL NO.`.

## Setup

1. Create a Google service account with access to the Sheets API.
2. Download its JSON key as `service-account.json` into
   `D:\LNGRP\dbmigration\service-account.json` (this filename is ignored by Git).
3. Share the workbook with the service-account email as Editor.
4. Install dependencies:

   ```powershell
   py -m pip install -r D:\LNGRP\dbmigration\requirements-reel-automation.txt
   ```

## Dry run

```powershell
py D:\LNGRP\dbmigration\reel_automation.py `
  --credentials D:\LNGRP\dbmigration\service-account.json `
  --dry-run `
  --log D:\LNGRP\reel_automation_log.csv
```

The dry run never changes Google Sheets. Review the CSV before using
`--apply`.

## Apply

```powershell
py D:\LNGRP\dbmigration\reel_automation.py `
  --credentials D:\LNGRP\dbmigration\service-account.json `
  --apply `
  --batch-size 50 `
  --log D:\LNGRP\reel_automation_log.csv
```

To resume from a particular job after a stopped run:

```powershell
py D:\LNGRP\dbmigration\reel_automation.py `
  --apply `
  --batch-size 50 `
  --resume-from-job 6935
```

Issue rows are created only when material, stock, reel ID, and required weight
are available. Returns are matched only from real existing `REEL RETURN` rows;
the script never invents return IDs, weights, or dates. Each completed job is
logged before the next job starts.

Before applying, the script checks whether `REEL ISSUE` or `REEL RETURN` is
protected. If a required tab is protected, it stops before any write.
