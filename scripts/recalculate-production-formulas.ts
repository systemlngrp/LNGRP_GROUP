import "dotenv/config";
import mysql from "mysql2/promise";
import {
  calculateProductionGsm,
  calculateProductionReel,
  calculateProductionTakeUpFactor,
} from "../src/lib/productionCalculations";

const round2 = (value: number) => Number(value.toFixed(2));
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const positive = (value: unknown) => {
  const parsed = finite(value);
  return parsed > 0 ? parsed : 0;
};

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  await db.beginTransaction();
  try {
    const [rows] = await db.query<any[]>("SELECT * FROM `productions` FOR UPDATE");
    const timestamp = new Date().toISOString();
    let updated = 0;

    for (const row of rows) {
      const takeUpFactor = calculateProductionTakeUpFactor(row.flute || row.fluteType);
      const gsm = round2(calculateProductionGsm({
        flute: row.flute || row.fluteType,
        l1: row.l1,
        f1: row.f1,
        l2: row.l2,
        f2: row.f2,
        l3: row.l3,
      }));
      const ups = positive(row.ups);
      const reelAsPerCalc = ups > 0
        ? round2(calculateProductionReel({
            breadth: row.breadth,
            height: row.height,
            ups,
            idToOd: row.idToOd,
          }))
        : null;
      const cutting = positive(row.cuttingWithTrimming);
      const paperRequired = positive(row.paperRequiredNos);
      const l1 = finite(row.l1);
      const canCalculatePaperWeight = reelAsPerCalc !== null && reelAsPerCalc > 0 && cutting > 0 && paperRequired > 0;
      const l1PaperWeight = canCalculatePaperWeight
        ? round2((reelAsPerCalc * cutting * l1 * paperRequired) / 1_000_000_000)
        : null;
      const linerWeight = canCalculatePaperWeight
        ? round2((reelAsPerCalc * cutting * (gsm - l1) * paperRequired) / 1_000_000_000)
        : null;
      const totalJobWeight = l1PaperWeight !== null && linerWeight !== null
        ? round2(l1PaperWeight + linerWeight)
        : null;
      const actualReel = positive(row.reelActualWithTrimming);
      const sheetWeightRaw = ups > 0 && actualReel > 0 && cutting > 0 && gsm > 0
        ? ((actualReel * cutting * gsm) / 1_000_000_000) / ups
        : null;
      const sheetWeight = sheetWeightRaw === null ? null : round2(sheetWeightRaw);
      const qty = positive(row.qty);
      const totalPaperWeight = sheetWeightRaw !== null && qty > 0 ? round2(sheetWeightRaw * qty) : null;
      const plateWeight = finite(row.plateWeight);
      const totalWeightOfSetRaw = sheetWeightRaw === null ? null : sheetWeightRaw + plateWeight;
      const totalWeightOfSet = totalWeightOfSetRaw === null ? null : round2(totalWeightOfSetRaw);
      const rate = positive(row.rate);
      const realizationPerKg = totalWeightOfSetRaw !== null && totalWeightOfSetRaw > 0 && rate > 0
        ? round2(rate / totalWeightOfSetRaw)
        : null;
      const actualPaperUsed = positive(row.actualPaperUsed);
      const prodFromFFG = positive(row.prodFromFFG);
      const wastage = sheetWeightRaw !== null && actualPaperUsed > 0 && prodFromFFG > 0
        ? round2(100 - ((prodFromFFG * sheetWeightRaw) / actualPaperUsed) * 100)
        : null;

      const values = [takeUpFactor, gsm, reelAsPerCalc, l1PaperWeight, linerWeight, totalJobWeight,
        sheetWeight, totalPaperWeight, totalWeightOfSet, realizationPerKg, wastage]
        .filter((value): value is number => value !== null);
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Invalid calculated value for production ${row.transactionNo || row.id}`);
      }

      const [result] = await db.query<mysql.ResultSetHeader>(
        `UPDATE \`productions\` SET
          \`takeUpFactor\` = ?, \`gsm\` = ?, \`boardGsmReq\` = ?, \`reelAsPerCalc\` = ?,
          \`top\` = NULL, \`topPaperWeightKg\` = ?, \`linerWeightKg\` = ?, \`totalJobWeight\` = ?,
          \`sheetWeight\` = ?, \`totalPaperWeight\` = ?, \`totalWeightOfSet\` = ?,
          \`realizationPerKg\` = ?, \`wastage\` = ?, \`updatedBy\` = ?, \`updateTimestamp\` = ?
        WHERE \`id\` = ?`,
        [takeUpFactor, gsm, gsm, reelAsPerCalc, l1PaperWeight, linerWeight, totalJobWeight,
          sheetWeight, totalPaperWeight, totalWeightOfSet, realizationPerKg, wastage,
          "System Admin - formula migration", timestamp, row.id]
      );
      if (result.affectedRows !== 1) {
        throw new Error(`Expected one updated row for ${row.transactionNo || row.id}; got ${result.affectedRows}`);
      }
      updated += 1;
    }

    if (updated !== rows.length) {
      throw new Error(`Expected to update ${rows.length} rows; updated ${updated}`);
    }
    await db.commit();
    console.log(JSON.stringify({ migrated: updated, timestamp }, null, 2));
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
