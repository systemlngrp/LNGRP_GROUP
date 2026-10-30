# Reel automation

This utility reconciles jobs from `DAILY PRODUCTION MASTER` dated from 1 April
2026 onward. It checks `ITEM MASTER` and `REEL WISE STOCK`, plans issue rows,
and writes a six-column status view to `DBREEL`.

## Setup

1. Create a Google service account with access to the Sheets API.
2. Download its JSON key as `service_account.json` outside Git, for example in
   `D:\LNGRP\secrets\service_account.json`.
3. Share the workbook with the service-account email as Editor.
4. Install dependencies:

   ```powershell
   py -m pip install -r D:\LNGRP\scripts\requirements-reel-automation.txt
   ```

## Dry run

```powershell
py D:\LNGRP\scripts\reel_automation.py `
  --credentials D:\LNGRP\secrets\service_account.json `
  --dry-run `
  --log D:\LNGRP\reel_automation_log.csv
```

The dry run never changes Google Sheets. Review the CSV before using
`--apply`.

## Apply

```powershell
py D:\LNGRP\scripts\reel_automation.py `
  --credentials D:\LNGRP\secrets\service_account.json `
  --apply `
  --log D:\LNGRP\reel_automation_log.csv
```

Issue rows are created only when material, stock, reel ID, and required weight
are available. Returns are never invented. To import genuine return rows, pass
`--return-source` with a CSV containing `job_no,our_reel_no,weight,return_date`.
