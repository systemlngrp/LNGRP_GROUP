@echo off
REM Starts the three sales-invoice sync windows in watch mode.
REM Each window posts newly saved app invoices to its firm's Tally within ~20 seconds.
REM Close a window (or press Ctrl+C in it) to stop that firm's sync.
cd /d "%~dp0"
start "Invoice Sync - Unit-1 (LNCB-1)" cmd /k python invFirm1.py --watch
start "Invoice Sync - Unit-2 to LNKI" cmd /k python invFirm2.py --watch
start "Invoice Sync - LNKI (Firm-3)" cmd /k python invFirm3.py --watch
