# PHP and Plate Working Workflow

This document describes the implemented workflow for PHP and Plate jobs in the application.

## 1. Setup and master data

Before creating a job, confirm that the required item exists in the correct item master:

- PHP: `Masters > PHP Item Master` (`/masters/php-item-master`)
- Plate: `Masters > Plate Item Master` (`/masters/plate-item-master`)

Check the item code, description, customer/order mapping, units, Sets/Pcs per box, and current stock. The item master reports production, invoiced quantity, and balance by firm.

## 2. Create production jobs

Use the pending planning screen to convert order schedules into production jobs:

- PHP: `Production > PHP > Pending Planning` (`/production/php/pending-planning`)
- Plate: `Production > Plate > Pending Planning` (`/production/plate/pending-planning`)

Select the required scheduled rows and click **Create Jobs**. The system creates PHP or Plate job-master rows, assigns a transaction number, and applies ERP/item matching. Do not create the same schedule again if it already has planned quantity.

For direct job creation, use the corresponding production form and then verify the new record in the production master.

## 3. Review and sequence jobs

Review created jobs in:

- PHP: `Production > PHP > Master` (`/production/php/master`)
- Plate: `Production > Plate > Master` (`/production/plate/master`)

Use the production sequencing screen when the shop floor needs an explicit execution order. Check priority, scheduled date, item, customer, quantity, and machine/process information before scheduling.

## 4. Schedule production

Move approved jobs to the schedule:

- PHP: `Production > PHP > Scheduling` (`/production/php/scheduling`)
- Plate: `Production > Plate > Scheduling` (`/production/plate/scheduling`)

Set or confirm the production date, machine, quantity, and sequence. Save the schedule and verify that the job leaves the pending-planning queue.

The shared PHP + Plate schedule is available at `/production/php-plate/scheduling` when both sources must be planned together.

## 5. Execute production

Operators work from the pending-production queue:

- PHP: `Production > PHP > Pending Production` (`/production/php/pending-production`)
- Plate: `Production > Plate > Pending Production` (`/production/plate/pending-production`)

For each job:

1. Open the scheduled job.
2. Confirm the produced quantity and relevant process details.
3. Record consumption, wastage, and any required material return.
4. Save/complete the production entry.
5. Confirm that the completed quantity is reflected in the PHP or Plate item master.

The combined execution queue is `/production/php-plate/pending-production`.

## 6. Create loading and post tally

Create a loading slip for completed goods:

- PHP loading master: `/loading/php/master`
- Plate loading master: `/loading/plate/master`

Confirm vehicle/customer/order details, loaded quantity, and linked production/job information before saving. Then use the pending tally screen to post the loading result:

- PHP: `/loading/php/pending-tally`
- Plate: `/loading/plate/pending-tally`

The tally posting should match the finished quantity and loading slip. Resolve mismatches before dispatch.

## 7. Dispatch and close

Complete dispatch from the shared dispatch module:

- Pending planning: `/dispatch/pending-planning`
- Dispatch master: `/dispatch/master`

Verify the final customer, vehicle, invoice/dispatch quantity, and loading reference. After dispatch, check the item master balance and ensure no pending tally or production rows remain.

## 8. PHP + Plate combined workflow

Use the combined screens when one customer/order needs both PHP and Plate work:

1. Create or confirm the PHP and Plate item-master records.
2. Create each source job from its own pending-planning queue.
3. Schedule both sources from `/production/php-plate/scheduling` when a shared sequence is required.
4. Execute both sources from `/production/php-plate/pending-production`.
5. Create and tally separate PHP and Plate loading slips.
6. Dispatch each source and verify both balances.

Keep PHP and Plate quantities separate. A combined screen is for coordination; it does not mean that the two stock ledgers or loading slips should be merged.

## 9. Google Sheets to Hostinger sync

The item-master sync scripts are:

- `scripts/php.gs`: PHP item master sync
- `scripts/plate.gs`: Plate item master sync

Available Apps Script entry points:

- `syncPhpItemMasterSheetToHostinger()` / `forceFullPhpItemMasterSync()`
- `syncPlateItemMasterSheetToHostinger()` / `forceFullPlateItemMasterSync()`

The queued flush handlers are `flushQueuedPhpItemMasterSync()` and `flushQueuedPlateItemMasterSync()`. Run a full sync after structural sheet changes; use the queued flush for normal row changes. Confirm the sync result in the corresponding application item master before planning new jobs.

## 10. Completion checklist

- Item master exists and is correctly mapped.
- Order schedule has been converted only once.
- Job quantity, date, and sequence are correct.
- Production quantity and consumption are posted.
- Wastage/material return is recorded where applicable.
- Loading slip is linked to the correct job/order.
- Tally is posted without quantity mismatch.
- Dispatch is complete.
- PHP/Plate item-master balance is correct.
- No related pending queue remains.
