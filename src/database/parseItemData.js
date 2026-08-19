/**
 * Script SEKALI JALAN untuk mengubah raw_items.txt (format daftar item mentah)
 * jadi itemData.js (array terstruktur) yang dipakai seedItems.js.
 *
 * Cara pakai: npm run parse-items
 * (butuh file raw_items.txt di root project — hasil copy-paste daftar item mentah)
 */
const fs = require('fs');
const path = require('path');

const RAW_PATH = path.join(__dirname, '..', '..', 'raw_items.txt');
const OUT_PATH = path.join(__dirname, 'itemData.js');

const raw = fs.readFileSync(RAW_PATH, 'utf8');
const lines = raw.split('\n').map((l) => l.trim());

// Header section menandai raid_type + tier, contoh: "GDN CLASIC", "GDN HC", "DDN CLASIC", "DDN HC"
const HEADER_RE = /^(GDN|DDN)\s+(CLASIC|HC)$/i;

// Baris Armor: "-  GDN Armor (Warrior@Head) x 1"
const ARMOR_RE = /^-\s*(GDN|DDN)\s+Armor\s*\(([A-Za-z]+)@([A-Za-z ]+)\)\s*[xX]\s*(\d+)$/;

// Baris Weapon: "-  GDN Weapon (Warrior@Axe) x 3"
const WEAPON_RE = /^-\s*(GDN|DDN)\s+Weapon\s*\(([A-Za-z]+)@([A-Za-z ]+)\)\s*[xX]\s*(\d+)$/;

// Baris Accessory: "-  GDN Unique Accessory (Earrings@STR AGI) X 20" atau "GDN Legend Accessory (...) X 34"
const ACCESSORY_RE = /^-\s*(GDN|DDN)\s+(Unique|Legend)\s+Accessory\s*\(([A-Za-z]+)@([A-Za-z ]+)\)\s*[xX]\s*(\d+)$/;

// Baris Material umum: "-  GDN Fragment x 1", "-  DDN Smelted Rune x 4", dst.
const MATERIAL_RE = /^-\s*((GDN|DDN)\s+.+?)\s*[xX]\s*(\d+)$/;

let currentRaid = null;
let currentTier = null;
const items = [];

for (const line of lines) {
  if (!line || line.startsWith('---')) continue;

  const headerMatch = line.match(HEADER_RE);
  if (headerMatch) {
    currentRaid = headerMatch[1].toUpperCase();
    currentTier = headerMatch[2].toUpperCase() === 'HC' ? 'HC' : 'Classic';
    continue;
  }

  if (!line.startsWith('-')) continue;
  if (!currentRaid || !currentTier) continue;

  let m = line.match(ARMOR_RE);
  if (m) {
    const [, raid, klass, slot, stamp] = m;
    items.push({
      raid_type: raid.toUpperCase(),
      tier: currentTier,
      category: 'Armor',
      class: klass,
      item_name: `${raid.toUpperCase()} Armor (${klass}@${slot.trim()})`,
      stamp_cost: Number(stamp),
    });
    continue;
  }

  m = line.match(WEAPON_RE);
  if (m) {
    const [, raid, klass, slot, stamp] = m;
    items.push({
      raid_type: raid.toUpperCase(),
      tier: currentTier,
      category: 'Weapon',
      class: klass,
      item_name: `${raid.toUpperCase()} Weapon (${klass}@${slot.trim()})`,
      stamp_cost: Number(stamp),
    });
    continue;
  }

  m = line.match(ACCESSORY_RE);
  if (m) {
    const [, raid, quality, slot, stat, stamp] = m;
    items.push({
      raid_type: raid.toUpperCase(),
      tier: currentTier,
      category: 'Accessory',
      class: null,
      item_name: `${raid.toUpperCase()} ${quality} Accessory (${slot}@${stat.trim()})`,
      stamp_cost: Number(stamp),
    });
    continue;
  }

  m = line.match(MATERIAL_RE);
  if (m) {
    const [, fullName, , stamp] = m;
    items.push({
      raid_type: currentRaid,
      tier: currentTier,
      category: 'Material',
      class: null,
      item_name: fullName.trim(),
      stamp_cost: Number(stamp),
    });
    continue;
  }

  console.warn('[parseItemData] Baris tidak dikenali, dilewati:', line);
}

const fileContent = `/**
 * FILE HASIL GENERATE OTOMATIS oleh parseItemData.js — jangan diedit manual.
 * Untuk update, edit raw_items.txt lalu jalankan ulang: npm run parse-items
 */
module.exports = ${JSON.stringify(items, null, 2)};
`;

fs.writeFileSync(OUT_PATH, fileContent, 'utf8');
console.log(`[parseItemData] Berhasil parse ${items.length} item -> ${OUT_PATH}`);
