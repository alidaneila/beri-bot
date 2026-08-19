const { round2 } = require('../utils/formatGold');

/**
 * Mesin perhitungan gaji, versi simplified.
 *
 * DUA JENIS POOL:
 * 1. Item pool (GABUNGAN) — semua item yang statusnya 'sold' dijumlah jadi SATU pool,
 *    dikurangi TOTAL semua sealstamp loan (nggak peduli stamp itu buat item yang mana),
 *    lalu dibagi RATA ke semua member aktif (item selalu dibagi rata, nggak ada
 *    opsi exclude per-item).
 * 2. Gold drop pool (TERPISAH per drop) — tiap gold drop entry punya pool sendiri,
 *    bisa punya eligibleUserIds custom (buat exclude orang tertentu dari drop itu).
 *
 * Sealstamp loan CUMA buat ngurangin item pool di atas (nggak dikaitkan ke item
 * spesifik lagi) — lebih simpel karena ujung-ujungnya dijumlah semua juga.
 * Lender dapat REPAYMENT PENUH di luar pembagian pool, nggak peduli item pool-nya
 * cukup atau nggak buat nutupin.
 *
 * Fee (default 0.3%) dipotong dari gaji kotor MASING-MASING orang (poolShare + stampRepayment),
 * bukan dibagi rata — jadi orang yang dapat lebih banyak, potongan fee-nya juga lebih besar.
 *
 * Semua angka dibulatkan ke 2 desimal (presisi silver, 100s = 1g) di SETIAP langkah,
 * biar nggak ngumpulin floating-point drift.
 *
 * @param {Object} params
 * @param {{userId: string}[]} params.activeMembers - member aktif & TIDAK di-exclude dari salary
 * @param {{status: 'pending'|'sold', soldPrice: number|null}[]} params.itemEntries - entry TIPE ITEM (bukan gold drop)
 * @param {{amount: number, eligibleUserIds: string[]|null}[]} params.goldDrops - null/[] eligibleUserIds = default semua
 * @param {{lenderId: string, stampCount: number, stampUnitPrice: number}[]} params.stampLoans
 * @param {number} [params.feeRate=0.003]
 */
function calculateSalary({ activeMembers, itemEntries, goldDrops, stampLoans, feeRate = 0.003 }) {
  const activeIds = activeMembers.map((m) => m.userId);
  const activeIdSet = new Set(activeIds);

  const perUser = {};
  const ensure = (id) => {
    if (!perUser[id]) perUser[id] = { poolShare: 0, stampRepayment: 0, grossBeforeFee: 0, fee: 0, netPayable: 0 };
    return perUser[id];
  };
  for (const id of activeIds) ensure(id);

  // --- Item pool (gabungan) ---
  const soldItems = itemEntries.filter((e) => e.status === 'sold');
  const pendingCount = itemEntries.filter((e) => e.status === 'pending').length;
  const totalItemSold = round2(soldItems.reduce((sum, e) => sum + (e.soldPrice || 0), 0));

  let totalStampDeduction = 0;
  for (const loan of stampLoans) {
    const cost = round2(loan.stampCount * loan.stampUnitPrice);
    totalStampDeduction = round2(totalStampDeduction + cost);
    ensure(loan.lenderId).stampRepayment = round2(ensure(loan.lenderId).stampRepayment + cost);
  }

  const itemPoolNet = round2(totalItemSold - totalStampDeduction);
  if (activeIds.length > 0) {
    const itemShare = round2(itemPoolNet / activeIds.length);
    for (const id of activeIds) {
      ensure(id).poolShare = round2(ensure(id).poolShare + itemShare);
    }
  }

  // --- Gold drop pools (per drop) ---
  let totalGoldDrop = 0;
  for (const drop of goldDrops) {
    const amount = round2(drop.amount || 0);
    totalGoldDrop = round2(totalGoldDrop + amount);
    const eligible =
      drop.eligibleUserIds && drop.eligibleUserIds.length
        ? drop.eligibleUserIds.filter((id) => activeIdSet.has(id))
        : activeIds;
    if (eligible.length === 0) continue;
    const share = round2(amount / eligible.length);
    for (const id of eligible) {
      ensure(id).poolShare = round2(ensure(id).poolShare + share);
    }
  }

  // --- Fee per orang (proporsional dari gaji kotor masing-masing) ---
  let totalFee = 0;
  let totalNetPayable = 0;
  for (const userId of Object.keys(perUser)) {
    const u = perUser[userId];
    u.grossBeforeFee = round2(u.poolShare + u.stampRepayment);
    u.fee = round2(u.grossBeforeFee * feeRate);
    u.netPayable = round2(u.grossBeforeFee - u.fee);
    totalFee = round2(totalFee + u.fee);
    totalNetPayable = round2(totalNetPayable + u.netPayable);
  }

  return {
    isFinal: pendingCount === 0,
    perUser,
    totals: {
      grossPool: round2(totalItemSold + totalGoldDrop),
      totalStampDeduction,
      totalFee,
      totalNetPayable,
    },
  };
}

module.exports = { calculateSalary };
