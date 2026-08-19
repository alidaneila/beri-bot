/**
 * Bulatkan ke 2 angka di belakang koma (presisi silver, 100s = 1g).
 * Dipakai di SETIAP langkah perhitungan (bukan cuma di akhir) biar nggak
 * ngumpulin floating-point drift kayak 888.894999999.
 */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Format angka gold jadi "888g 90s". Kalau silver-nya 0, tampil "888g" aja
 * (nggak perlu "888g 0s"). Copper sengaja TIDAK ditampilkan biar sederhana.
 */
function formatGold(amount) {
  const rounded = round2(amount);
  const gold = Math.trunc(rounded);
  let silver = Math.round((Math.abs(rounded) - Math.abs(gold)) * 100);
  let g = gold;
  if (silver >= 100) {
    g += rounded < 0 ? -1 : 1;
    silver -= 100;
  }
  return silver > 0 ? `${g}g ${silver}s` : `${g}g`;
}

module.exports = { round2, formatGold };
