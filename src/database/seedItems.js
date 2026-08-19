/**
 * Isi item_catalog dari itemData.js (hasil parseItemData.js).
 * Aman dijalankan berkali-kali — item yang sama (raid_type+tier+item_name) di-skip, tidak dobel.
 * Cara pakai: npm run seed-items
 */
const db = require('./db');
const items = require('./itemData');

const existsStmt = db.prepare(
  `SELECT id FROM item_catalog WHERE item_name = ?`
);
const insertStmt = db.prepare(`
  INSERT INTO item_catalog (category, class, item_name, stamp_cost)
  VALUES (@category, @class, @item_name, @stamp_cost)
`);

let inserted = 0;
let skipped = 0;

const run = db.transaction((rows) => {
  for (const row of rows) {
    const found = existsStmt.get(row.item_name);
    if (found) {
      skipped += 1;
      continue;
    }
    insertStmt.run(row);
    inserted += 1;
  }
});

run(items);

console.log(`[seedItems] Selesai. Ditambahkan: ${inserted}, dilewati (sudah ada): ${skipped}.`);
