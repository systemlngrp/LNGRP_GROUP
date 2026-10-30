# Single BK order, schedule, and job migration

`migrate_daily_bk_orders_jobs.py` is the only migration entry point. It reads Daily Production Master and New Order Master, then creates or updates Firm-II orders, schedules, and jobs.

It processes Daily Production Master rows dated from `2026-04-01` onward when BK Order Id is present and BE, BF, and BG cancellation fields are all blank. Daily Production Master column C (`Job Card No.`) is written to `productions.jobCardNo`; `transactionNo` remains a generated unique database value.

Install and configure:

```powershell
C:\Users\Admin\.local\bin\python3.14.exe -m venv dbmigration\.venv
dbmigration\.venv\Scripts\python.exe -m pip install -r dbmigration\requirements.txt
$env:GOOGLE_APPLICATION_CREDENTIALS = 'D:\LNGRP\dbmigration\.venv\db-migrations.json'
$env:DB_HOST = '...'
$env:DB_USER = '...'
$env:DB_PASSWORD = '...'
$env:DB_NAME = '...'
$env:MIGRATION_BATCH_SIZE = '100'
# Recommended before --apply:
$env:MIGRATION_EXPECTED_DB_HOST = '...'
$env:MIGRATION_EXPECTED_DB_NAME = '...'
dbmigration\.venv\Scripts\python.exe dbmigration\migrate_daily_bk_orders_jobs.py
```

Use the `dbmigration\.venv` interpreter for both installation and execution. Dry-run is the default. Use `--apply` only after reviewing the preview:

```powershell
dbmigration\.venv\Scripts\python.exe dbmigration\migrate_daily_bk_orders_jobs.py --apply
```

`MIGRATION_BATCH_SIZE` controls bounded processing chunks; it does not cap the total number of rows read or migrated.

Apply mode prints the connected database host, database name, and current order/schedule counts. If `MIGRATION_EXPECTED_DB_HOST` or `MIGRATION_EXPECTED_DB_NAME` is set, apply mode stops when the connected database does not match the expected identity.

The migration records `Order Id`, `Job Card No.`, `Status`, and `Completed At` in `DBMIGRATIONS`. Existing legacy Order Id + Job Card No. pairs in columns A:B are treated as completed. Completed pairs are skipped on later runs.

Cancellation columns are `BE` (Cancel Timestamp), `BF` (Cancel Email), and `BG` (Cancel Reason). Rows with any cancellation value are ignored by this migration.

The default service-account file is `D:\LNGRP\dbmigration\.venv\db-migrations.json`. It must be a rotated, non-compromised key and must not be committed to Git. The service account needs access to the spreadsheet; job tracking writes require Google Sheets editor access.
