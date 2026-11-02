# Final Overall Reel MRR Reconciliation Report

**Prepared:** 2026-11-01  
**Scope:** Unit-I Reel MRRs dated 2026-04-01 onward  
**Sources:** Application database, `MRR FORM`, and `HELPER SHEET` in the Reel Management workbook

## Executive reconciliation

| Control | Application | Google Sheet | Difference |
|---|---:|---:|---:|
| Qualifying MRR count | 369 | 369 | 0 |
| Qualifying reel count | 5,077 | 5,077 | 0 |
| Total reel weight (kg) | 5,878,335.00 | 5,878,335.00 | 0.00 |
| Total reel value (INR) | 192,853,081.00 | 192,853,081.00 | 0.00 |

**Final status: RECONCILED.** Counts, weight, and value match exactly.

## Previously blocked MRRs

| Sheet MRR | Application transaction | ERP handling | Gate Entry | Reel rows |
|---|---|---|---|---:|
| `26-27/0616` | `LNCB-1/MRR/26-27/00616` | `7220489` | `GE/26-27/00367` | 19 |
| `26-27/0623` | `LNCB-1/MRR/26-27/00623` | `7220489A` | `GE/26-27/00368` | 8 |
| `26-27/0627` | `LNCB-1/MRR/26-27/00627` | `7220489` | `GE/26-27/00369` | 8 |

## ERP variant resolution

| ERP | Size | GSM | BF | Color | Unit | Ownership |
|---|---:|---:|---:|---|---|---|
| `7220489` | 220.5 cm | 120 | 18 | Natural | KGS | Unit-I |
| `7220489A` | 206 cm | 140 | 18 | Natural | KGS | Unit-I |

The alphabet suffix was used because the source sheet contained conflicting specifications for ERP `7220489`.

## Rate reconciliation correction

The source `Rate` column was treated as authoritative. Fourteen reels across six MRRs had a different stored application rate. Their MRR lines were split where required so each reel retained its own rate.

| Corrected MRRs | Differential reels | Value variance before correction |
|---|---:|---:|
| `26-27/0715` | 7 | +15,626.00 |
| `CB1/26-27/0795` | 2 | +4,352.00 |
| `26-27/0773` | 1 | -1,986.00 |
| `CB1/26-27/0796` | 1 | -1,153.00 |
| `177` | 2 | -1,114.50 |
| `40` | 1 | +699.00 |
| **Total** | **14** | **+16,423.50** |

After correction, the application total value equals the sheet total value.

## Workflow and data controls

| Control | Result |
|---|---|
| Existing MRRs changed during missing-MRR import | No |
| Existing Gate Entry numbers changed | No |
| New Gate Entries assigned sequentially | Yes, `00367`–`00369` |
| Google Sheet values changed | No |
| Reel weight reconciliation | Passed |
| Reel value reconciliation | Passed |
| Missing MRRs after final import | 0 |
| Missing qualifying reel rows | 0 |
| Duplicate source reels silently discarded | No |
| Conflicting ERP specification silently merged | No; `7220489A` created |

## Calculation basis

- Sheet MRRs are identified from `MRR FORM` dates on or after 2026-04-01.
- Sheet reels are identified by `HELPER SHEET` Our Reel Number joined to the MRR number.
- Application MRRs are Reel `material_in` records dated on or after 2026-04-01.
- Application reel totals use linked `material_in_packing_slips` records.
- Application value uses each reel’s stored rate after the rate correction.
- Sheet value uses the `VALUE` column and the sheet `Rate` column is the rate authority.

No Google Sheet values were modified during migration or reconciliation.
