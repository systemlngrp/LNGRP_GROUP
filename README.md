# LNGRP Group

**All three firms**

See [PHP_PLATE_WORKFLOW.md](PHP_PLATE_WORKFLOW.md) for the complete PHP and Plate operational workflow, route map, controls, and Google Sheets sync steps.

## Unified Tally invoice executable

Run `TallyCodes\invoice\build_invoice_sync_exe.bat` once to build
`TallyCodes\invoice\dist\LNGRP_Invoice_Sync\LNGRP_Invoice_Sync.exe`.

The executable supports all three firms. In `all` mode, it runs each firm's sync
sequentially to avoid competing Tally imports:

- `LNGRP_Invoice_Sync.exe --firm 1 --watch`
- `LNGRP_Invoice_Sync.exe --firm 2 --watch`
- `LNGRP_Invoice_Sync.exe --firm 3 --watch`
- `LNGRP_Invoice_Sync.exe --firm all --watch`

Omit `--watch` to perform one sequential pass for all firms. It uses the `.env`
database settings and `tallyPortNo` values from the database. Keep `.env` beside
the executable; it contains private database settings and should not be shared.
