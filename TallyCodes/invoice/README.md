# Sales invoice sync to Tally

| Script | Posts | Into Tally company |
|---|---|---|
| `invFirm1.py` | Unit-1 (LNCB-1) invoices, incl. Unit-1 → Unit-2 (as "Corrugated Board") | Unit-1 |
| `invFirm2.py` | Unit-2 invoices, incl. Unit-2 → LNKI | Unit-2 |
| `invFirm3.py` | LNKI (Firm-3) invoices | LNKI |

`invFirm1.py` holds the engine; `invFirm2.py` and `invFirm3.py` reuse it, so keep all three in this folder.
Each firm's Tally port comes from `firms.tallyPortNo`.

## Sales ledger

By line GST rate: `SALES 5%` / `SALES 18%`, else `Sales`. An **export invoice** ("Export" chosen
in the app's GST Rate; `invoices.exportSupply = 'Yes'`, GST 0) goes to `Sales Export`
(`SALES_EXPORT_LEDGER_NAME` in `.env` to rename). The ledger must exist in Tally.

## Who gives the invoice number

By default the number **continues Tally's own Sales series** (`INVOICE_NUMBER_SOURCE=tally`).
Tally does not number vouchers that arrive by XML import, even with Automatic numbering,
so the script does it:

1. Just before posting, it reads every Sales voucher number of the financial year from Tally,
   takes the series used most (e.g. `LNCB2/26-27/`) and uses its highest number + 1
   (`LNCB2/26-27/2833` -> `LNCB2/26-27/2834`). Your Tally team can keep entering invoices in
   Tally; the next app invoice simply takes the next free number.
2. The number is saved to `invoices.tallyInvNo` (with `tallyInvDate`, `tallyInvId`).
   The app's own `invoiceNo` is only an internal reference.
3. Each voucher carries a hidden `REMOTEID` (`LNGRP-INV-<invoice id>`, not printed). If a run
   stops before saving the number, the next run finds the voucher by this id and saves its
   number instead of posting it again.
4. After posting, Tally is checked for another Sales voucher with the same number in that
   financial year (e.g. someone saved the same number at the same moment). If found, the
   invoice is still marked posted, with a remark to fix it in Tally.
5. Pending invoices are posted oldest invoice date first.
6. Every 5 minutes, posted invoices whose Tally number is blank in the app are looked up in
   Tally again; if a number has since been entered in Tally, it is filled in.

To go back to the old behaviour (app number sent to Tally), put `INVOICE_NUMBER_SOURCE=app` in `.env`.

The bill, e-invoice and e-way bill are made and printed from Tally.

## Running

```
python invFirm1.py              # one pass, then exit
python invFirm1.py --watch      # keep running; checks for new invoices every 20 s
python invFirm1.py --watch --interval 30
```

For a one-time run without Tally master validation, run the matching `invFirm*_fast_once.py`
script. These runs skip customer/ledger, stock-item, UOM, and part-number validation; Tally
numbering and voucher import are still required.

After a run stops on a problem invoice (missing ledger, Tally closed, ...) watch mode waits
5 minutes before trying again (`TALLY_WATCH_RETRY_AFTER_ISSUE`, seconds). Fix the problem shown
in the window / Billing Master remark and it will continue by itself.

Optional `.env` settings: `INVOICE_NUMBER_SOURCE`, `TALLY_BACKFILL_EVERY`, `TALLY_WATCH_INTERVAL`,
`TALLY_WATCH_RETRY_AFTER_ISSUE`, `TALLY_SEND_REMOTE_ID`, `SALES_VOUCHER_TYPE_NAME`, `SALES_TCS_LEDGER_NAME`.

## Updating this computer from GitHub

Run `TallyCodes\update_from_github.bat` (stop the sync windows first, start them again after).
Logs (`Log\`, `invoice sync log.txt`) are not in git, so updating never touches them.
