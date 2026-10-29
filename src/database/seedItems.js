/**
 * Isi item_catalog dari itemData.js (hasil parseItemData.js).
 * Aman dijalankan berkali-kali — item yang sama (raid_type+tier+item_name) di-skip, tidak dobel.
 * Cara pakai: npm run seed-items
 */
const db = require('./db');
const items = require('./itemData');

const existsStmt = db.prepare(
  `SELECT id, category, class, stamp_cost
   FROM item_catalog
   WHERE item_name = ?`
);
const insertStmt = db.prepare(`
  INSERT INTO item_catalog (category, class, item_name, stamp_cost)
  VALUES (@category, @class, @item_name, @stamp_cost)
`);

const updateStmt = db.prepare(`
  UPDATE item_catalog
  SET category = @category,
      class = @class,
      stamp_cost = @stamp_cost
  WHERE id = @id
`);

let inserted = 0;
let updated = 0;
let skipped = 0;

const run = db.transaction((rows) => {
  for (const row of rows) {
    const found = existsStmt.get(row.item_name);

if (!found) {
  insertStmt.run(row);
  inserted += 1;
  continue;
}

const hasChanged =
  found.category !== row.category ||
  found.class !== row.class ||
  found.stamp_cost !== row.stamp_cost;

if (!hasChanged) {
  skipped += 1;
  continue;
}

updateStmt.run({
  ...row,
  id: found.id
});

updated += 1;
};
})
run(items);

console.log(`[seedItems] Selesai. Ditambahkan: ${inserted}, Diupdate: ${updated}, dilewati (sudah ada): ${skipped}.`);
