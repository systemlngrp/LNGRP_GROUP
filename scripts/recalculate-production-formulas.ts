import "dotenv/config";
import mysql from "mysql2/promise";
import {
  calculateProductionGsm,
  calculateProductionReel,
  calculateProductionTakeUpFactor,
  calculateProductionDerivedValues,
  calculateProductionIdToOd2,
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
      const actualReel = positive(row.reelActualWithTrimming);
      const qty = positive(row.qty);
      const derived = calculateProductionDerivedValues({
        reelActualWithTrimming: actualReel,
        cuttingWithTrimming: cutting,
        gsm,
        ups,
        planQty: qty,
        plateWeight: row.plateWeight,
        rate: row.rate,
        noOfParts: row.noOfParts,
      });
      const sheetWeight = derived.sheetWeight === null ? null : round2(derived.sheetWeight);
      const totalPaperWeight = derived.totalPaperWeight === null ? null : round2(derived.totalPaperWeight);
      const totalWeightOfSet = derived.totalWeightOfSet === null ? null : round2(derived.totalWeightOfSet);
      const realizationPerKg = derived.realizationPerKg === null ? null : round2(derived.realizationPerKg);
      const actualPaperUsed = positive(row.actualPaperUsed);
      const prodFromFFG = positive(row.prodFromFFG);
      const wastage = sheetWeight !== null && actualPaperUsed > 0 && prodFromFFG > 0
        ? round2(100 - ((prodFromFFG * sheetWeight) / actualPaperUsed) * 100)
        : null;

      const idToOd2 = calculateProductionIdToOd2(row.ply);
      const values = [takeUpFactor, gsm, idToOd2, reelAsPerCalc,
        sheetWeight, totalPaperWeight, totalWeightOfSet, realizationPerKg, wastage]
        .filter((value): value is number => value !== null);
      if (values.some((value) => !Number.isFinite(value))) {
        throw new Error(`Invalid calculated value for production ${row.transactionNo || row.id}`);
      }

      const [result] = await db.query<mysql.ResultSetHeader>(
        `UPDATE \`productions\` SET
          \`takeUpFactor\` = ?, \`gsm\` = ?, \`boardGsmReq\` = ?, \`reelAsPerCalc\` = ?,
          \`idToOd2\` = ?, \`top\` = NULL,
          \`sheetWeight\` = ?, \`totalPaperWeight\` = ?, \`totalWeightOfSet\` = ?,
          \`realizationPerKg\` = ?, \`wastage\` = ?, \`updatedBy\` = ?, \`updateTimestamp\` = ?
        WHERE \`id\` = ?`,
        [takeUpFactor, gsm, gsm, reelAsPerCalc, idToOd2,
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
