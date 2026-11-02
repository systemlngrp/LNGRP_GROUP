# Reel / MRR Reconciliation Audit

**Prepared:** 2026-11-01  
**Scope:** MRRs dated 2026-04-01 onward, Unit-I Reel receipts  
**Sources:** Application database and the Reel Management workbook (`MRR FORM` + `HELPER SHEET`)

| Metric | Application | Google Sheet | Difference (Sheet - App) |
|---|---:|---:|---:|
| MRR count | 369 | 369 | 0 |
| Reel count | 5,077 | 5,077 | 0 |
| Reel weight (kg) | 5,878,335.00 | 5,878,335.00 | 0.00 |
| Reel value (INR) | 192,853,081.00 | 192,853,081.00 | 0.00 |

## Result

- All 369 qualifying MRRs are now represented in the application.
- All 5,077 qualifying reel rows are represented in the application.
- Total reel weight matches exactly at **5,878,335 kg**.
- The previous value variance of **₹16,423.50** was corrected by using the sheet `Rate` per reel.
- The three previously blocked MRRs were imported: `00616`, `00623`, and `00627`.
- ERP `7220489A` was created for the conflicting 206 cm / GSM 140 specification. ERP `7220489` remains the 220.5 cm / GSM 120 specification.

## Gate Entry verification

| MRR | Gate Entry | Reel rows |
|---|---|---:|
| `00616` | `GE/26-27/00367` | 19 |
| `00623` | `GE/26-27/00368` | 8 |
| `00627` | `GE/26-27/00369` | 8 |

Existing MRRs and Gate Entry numbers were not changed.

## Differential MRRs

Before correction, and after excluding the intentionally merged `26-27/0602` / `602A` handling, the ₹16,423.50 variance came from these six MRRs:

| Sheet MRR | Application transaction | Sheet value (INR) | Application value (INR) | Difference (Sheet - App) |
|---|---|---:|---:|---:|
| `26-27/0715` | `.../00715` | 1,756,925.00 | 1,741,299.00 | +15,626.00 |
| `CB1/26-27/0795` | `.../00795` | 352,842.00 | 348,490.00 | +4,352.00 |
| `26-27/0773` | `.../00773` | 358,044.50 | 360,030.50 | -1,986.00 |
| `CB1/26-27/0796` | `.../00796` | 319,418.00 | 320,571.00 | -1,153.00 |
| `177` | `.../00177` | 346,866.00 | 347,980.50 | -1,114.50 |
| `40` | `.../00040` | 272,667.00 | 271,968.00 | +699.00 |
| **Total** |  |  |  | **+16,423.50** |

The remaining differences are therefore row-level rate/value differences. They do not indicate missing MRRs or reels.

## Differential reel numbers

All 14 reels below have matching weights in the sheet and application. The variance is caused by the rate shown in the sheet versus the rate stored in the application.

| MRR | Our Reel No. | Sheet rate | App rate | Difference (INR) |
|---|---:|---:|---:|---:|
| `26-27/0715` | `11111194` | 34.00 | 32.00 | +2,168.00 |
| `26-27/0715` | `11111195` | 34.00 | 32.00 | +2,286.00 |
| `26-27/0715` | `11111196` | 34.00 | 32.00 | +2,268.00 |
| `26-27/0715` | `11111197` | 34.00 | 32.00 | +2,338.00 |
| `26-27/0715` | `11111198` | 34.00 | 32.00 | +2,234.00 |
| `26-27/0715` | `11111199` | 34.00 | 32.00 | +2,258.00 |
| `26-27/0715` | `11111215` | 35.00 | 33.00 | +2,074.00 |
| `CB1/26-27/0795` | `11111706` | 34.00 | 32.00 | +2,172.00 |
| `CB1/26-27/0795` | `11111707` | 34.00 | 32.00 | +2,180.00 |
| `26-27/0773` | `11111493` | 34.00 | 35.50 | -1,986.00 |
| `CB1/26-27/0796` | `11111693` | 33.00 | 34.00 | -1,153.00 |
| `177` | `11108472` | 31.00 | 31.50 | -557.00 |
| `177` | `11108473` | 31.00 | 31.50 | -557.50 |
| `40` | `11107790` | 32.50 | 32.00 | +699.00 |

**Total reel-level variance: ₹16,423.50.**

These six MRRs were corrected by splitting mixed-rate ERP lines and storing the authoritative sheet rate for each reel. After correction, the application and sheet values both equal **₹192,853,081.00**.

## Calculation basis

- **Application MRR count:** Reel `material_in` transactions dated on or after 2026-04-01.
- **Application Reel count and weight:** Reel packing slips linked to those MRRs.
- **Application Reel value:** persisted packing-slip weight multiplied by the stored opening rate.
- **Sheet MRR count:** distinct MRR numbers in `MRR FORM` dated on or after 2026-04-01.
- **Sheet Reel count, weight, and value:** qualifying `HELPER SHEET` rows joined to those MRR numbers; value uses the sheet `VALUE` column.

No Google Sheet values were changed during this audit.
