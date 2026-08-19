const db = require('../database/db');
const config = require('../config');
const { calculateSalary } = require('./calculate');
const { buildSalaryEmbed } = require('../ui/salaryEmbed');
const { buildSalaryRows } = require('../ui/salaryComponents');

function getSalaryThreadByRunId(runId) {
  return db.prepare(`SELECT * FROM salary_thread WHERE run_id = ?`).get(runId);
}

function setAccounting(runId, userId, ign) {
  db.prepare(`UPDATE salary_thread SET accounting_id = ?, accounting_ign = ? WHERE run_id = ?`).run(
    userId,
    ign,
    runId
  );
}

/**
 * True kalau userId adalah host party ATAU accounting yang ditunjuk untuk run ini.
 * Ini SATU-SATUNYA cara ngecek izin buat tombol host-only di panel salary.
 */
function isAuthorized(run, salaryThread, userId) {
  if (run.host_id === userId) return true;
  if (salaryThread && salaryThread.accounting_id === userId) return true;
  return false;
}

function createSalaryThread(runId, threadId) {
  db.prepare(`INSERT INTO salary_thread (run_id, thread_id) VALUES (?, ?)`).run(runId, threadId);
  return getSalaryThreadByRunId(runId);
}

function setPanelMessageId(runId, messageId) {
  db.prepare(`UPDATE salary_thread SET panel_message_id = ? WHERE run_id = ?`).run(
    messageId,
    runId
  );
}

function addLootFromCatalog(runId, itemId, qty, addedBy) {
  const item = db.prepare(`SELECT * FROM item_catalog WHERE id = ?`).get(itemId);
  if (!item) throw new Error('Item tidak ditemukan di catalog');
  const info = db
    .prepare(
      `INSERT INTO loot_entry (run_id, item_id, label, qty, stamp_cost, status, added_by)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(runId, itemId, item.item_name, qty, item.stamp_cost, addedBy);
  return info.lastInsertRowid;
}

function addGoldDrop(runId, amount, addedBy) {
  const info = db
    .prepare(
      `INSERT INTO loot_entry (run_id, item_id, label, qty, status, sold_price, added_by)
       VALUES (?, NULL, 'Gold Drop', 1, 'gold', ?, ?)`
    )
    .run(runId, amount, addedBy);
  return info.lastInsertRowid;
}

/**
 * Atur siapa yang TIDAK dapat bagian dari satu loot_entry (biasanya gold drop).
 * Kalau excludedUserIds kosong -> hapus semua override, balik ke default (semua member aktif dapat).
 * Item dari hasil jual (bukan gold drop) sengaja TIDAK dikasih fitur ini — selalu dibagi rata ke semua.
 */
function setLootExclusions(lootEntryId, allActiveUserIds, excludedUserIds) {
  db.prepare(`DELETE FROM loot_eligibility WHERE loot_entry_id = ?`).run(lootEntryId);
  if (!excludedUserIds.length) return; // default: semua dapat, tidak perlu simpan override
  const eligible = allActiveUserIds.filter((id) => !excludedUserIds.includes(id));
  const insert = db.prepare(`INSERT INTO loot_eligibility (loot_entry_id, user_id) VALUES (?, ?)`);
  for (const id of eligible) insert.run(lootEntryId, id);
}

function setItemPrice(lootEntryId, price) {
  db.prepare(`UPDATE loot_entry SET status = 'sold', sold_price = ? WHERE id = ?`).run(
    price,
    lootEntryId
  );
}

function removeLootEntry(lootEntryId) {
  db.prepare(`DELETE FROM loot_eligibility WHERE loot_entry_id = ?`).run(lootEntryId);
  db.prepare(`DELETE FROM loot_entry WHERE id = ?`).run(lootEntryId);
}

/** Sealstamp loan sekarang cuma butuh siapa yang minjemin + berapa banyak (gak perlu link ke item). */
function addStampLoan(runId, lenderId, stampCount) {
  db.prepare(
    `INSERT INTO sealstamp_loan (run_id, lender_id, stamp_count, stamp_unit_price)
     VALUES (?, ?, ?, ?)`
  ).run(runId, lenderId, stampCount, config.stampUnitPrice);
}

function removeStampLoan(loanId) {
  db.prepare(`DELETE FROM sealstamp_loan WHERE id = ?`).run(loanId);
}

function toggleExclude(runId, userIds) {
  const get = db.prepare(
    `SELECT is_excluded_from_salary FROM party_member WHERE run_id = ? AND user_id = ? AND is_removed = 0 LIMIT 1`
  );
  const update = db.prepare(
    `UPDATE party_member SET is_excluded_from_salary = ? WHERE run_id = ? AND user_id = ? AND is_removed = 0`
  );
  for (const userId of userIds) {
    const row = get.get(runId, userId);
    if (!row) continue;
    update.run(row.is_excluded_from_salary ? 0 : 1, runId, userId);
  }
}

function markPaid(runId, userIds) {
  const upsert = db.prepare(`
    INSERT INTO payment_status (run_id, user_id, is_paid, paid_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(run_id, user_id) DO UPDATE SET is_paid = 1, paid_at = datetime('now')
  `);
  for (const userId of userIds) {
    upsert.run(runId, userId);
  }
}

function unmarkPaid(runId, userIds) {
  const update = db.prepare(
    `UPDATE payment_status SET is_paid = 0, paid_at = NULL WHERE run_id = ? AND user_id = ?`
  );
  for (const userId of userIds) {
    update.run(runId, userId);
  }
}

function getLootEntries(runId) {
  return db.prepare(`SELECT * FROM loot_entry WHERE run_id = ? ORDER BY added_at ASC`).all(runId);
}

function getStampLoans(runId) {
  return db.prepare(`SELECT * FROM sealstamp_loan WHERE run_id = ?`).all(runId);
}

function getEligibility(lootEntryId) {
  return db
    .prepare(`SELECT user_id FROM loot_eligibility WHERE loot_entry_id = ?`)
    .all(lootEntryId)
    .map((r) => r.user_id);
}

function getPaymentMap(runId) {
  const rows = db.prepare(`SELECT * FROM payment_status WHERE run_id = ?`).all(runId);
  const map = {};
  for (const r of rows) map[r.user_id] = r;
  return map;
}

function closePanel(runId) {
  db.prepare(`UPDATE salary_thread SET is_finalized = 1 WHERE run_id = ?`).run(runId);
}

/**
 * True kalau sudah ada minimal 1 orang yang di-mark paid untuk run ini.
 * Begitu true, item/gold/stamp/exclude TIDAK BOLEH diubah lagi — biar nggak
 * mengubah perhitungan setelah sebagian orang sudah ditransfer.
 */
function hasAnyPaid(runId) {
  const c = db
    .prepare(`SELECT COUNT(*) AS c FROM payment_status WHERE run_id = ? AND is_paid = 1`)
    .get(runId).c;
  return c > 0;
}

function isMutationLocked(runId) {
  const salaryThread = getSalaryThreadByRunId(runId);
  return Boolean(salaryThread?.is_finalized) || hasAnyPaid(runId);
}

/**
 * Ambil semua data terbaru dari DB untuk satu run, hitung ulang gaji, dan kembalikan
 * embed + komponen siap pakai untuk di-edit ke panel_message_id.
 * INI SATU-SATUNYA TEMPAT yang boleh membangun tampilan salary panel.
 */
function computeSalaryView(run, members) {
  const salaryThread = getSalaryThreadByRunId(run.id);
  const lootEntries = getLootEntries(run.id);
  const stampLoans = getStampLoans(run.id);
  const paymentMap = getPaymentMap(run.id);

  const activeMemberIds = members.filter((m) => !m.is_excluded_from_salary).map((m) => m.user_id);
  const activeMembers = activeMemberIds.map((userId) => ({ userId }));

  // Item beneran (bukan gold drop) buat pool gabungan + section Sudah Laku / Belum Laku
  const itemEntries = lootEntries.filter((e) => e.status !== 'gold');
  // Gold drop diolah jadi info siap tampil sekaligus dipakai buat pool per-drop
  const goldEntries = lootEntries.filter((e) => e.status === 'gold');

  const goldDrops = goldEntries.map((e) => {
    const eligibility = getEligibility(e.id);
    const eligibleIds = eligibility.length ? eligibility.filter((id) => activeMemberIds.includes(id)) : activeMemberIds;
    const excludedIds = activeMemberIds.filter((id) => !eligibleIds.includes(id));
    const sharePerPerson = eligibleIds.length ? Math.round(((e.sold_price || 0) / eligibleIds.length) * 100) / 100 : 0;
    return {
      id: e.id,
      amount: e.sold_price,
      eligibleCount: eligibleIds.length,
      excludedIds,
      sharePerPerson,
      eligibleUserIds: eligibility,
    };
  });

  const calcResult = calculateSalary({
    activeMembers,
    itemEntries: itemEntries.map((e) => ({ status: e.status, soldPrice: e.sold_price })),
    goldDrops: goldDrops.map((g) => ({ amount: g.amount, eligibleUserIds: g.eligibleUserIds })),
    stampLoans: stampLoans.map((l) => ({
      lenderId: l.lender_id,
      stampCount: l.stamp_count,
      stampUnitPrice: l.stamp_unit_price,
    })),
    feeRate: config.transferFeeRate,
  });

  const membersForEmbed = members.map((m) => ({
    ...m,
    is_paid: Boolean(paymentMap[m.user_id]?.is_paid),
  }));

  const embed = buildSalaryEmbed({
    run,
    accounting: { id: salaryThread?.accounting_id || null, ign: salaryThread?.accounting_ign || null },
    members: membersForEmbed,
    lootEntries: itemEntries,
    goldDrops,
    stampLoans: stampLoans.map((l) => ({
      lenderId: l.lender_id,
      stampCount: l.stamp_count,
      stampUnitPrice: l.stamp_unit_price,
    })),
    calcResult,
    mutationLocked: isMutationLocked(run.id),
  });

  const finalized = Boolean(salaryThread?.is_finalized);
  const components = buildSalaryRows(run.id, { mutationLocked: isMutationLocked(run.id), finalized });

  // Simpan amount_owed terbaru ke payment_status (dipakai kalau mau audit / laporan nanti)
  const upsertAmount = db.prepare(`
    INSERT INTO payment_status (run_id, user_id, amount_owed)
    VALUES (?, ?, ?)
    ON CONFLICT(run_id, user_id) DO UPDATE SET amount_owed = excluded.amount_owed
  `);
  for (const userId of Object.keys(calcResult.perUser)) {
    upsertAmount.run(run.id, userId, calcResult.perUser[userId].netPayable);
  }

  return { embed, components, salaryThread, calcResult, paymentMap };
}

/**
 * Rebuild + edit pesan panel salary di Discord. Dipanggil setiap kali ada mutasi data.
 * `client` dipakai untuk fetch channel/thread & pesan.
 */
async function rebuildSalaryPanel(client, run, members) {
  const { embed, components, salaryThread } = computeSalaryView(run, members);
  if (!salaryThread || !salaryThread.panel_message_id) return null;

  const thread = await client.channels.fetch(salaryThread.thread_id);
  const message = await thread.messages.fetch(salaryThread.panel_message_id);
  await message.edit({ embeds: [embed], components });

  const anyPaid = db
    .prepare(`SELECT COUNT(*) AS c FROM payment_status WHERE run_id = ? AND is_paid = 1`)
    .get(run.id).c;

  if (!salaryThread.title_paid_prefix_applied && anyPaid > 0) {
    // Baru ada yang paid pertama kali -> kasih prefix
    const newTitle = thread.name.startsWith('💰') ? thread.name : `💰 ${thread.name}`;
    await thread.setName(newTitle.slice(0, 100));
    db.prepare(`UPDATE salary_thread SET title_paid_prefix_applied = 1 WHERE run_id = ?`).run(run.id);
  } else if (salaryThread.title_paid_prefix_applied && anyPaid === 0) {
    // Semua yang paid di-undo -> lepas prefix, biar bisa nyala lagi nanti
    const stripped = thread.name.replace(/^💰\s?/, '');
    await thread.setName(stripped.slice(0, 100));
    db.prepare(`UPDATE salary_thread SET title_paid_prefix_applied = 0 WHERE run_id = ?`).run(run.id);
  }

  return message;
}

module.exports = {
  getSalaryThreadByRunId,
  createSalaryThread,
  setPanelMessageId,
  setAccounting,
  isAuthorized,
  addLootFromCatalog,
  addGoldDrop,
  setLootExclusions,
  setItemPrice,
  removeLootEntry,
  addStampLoan,
  removeStampLoan,
  toggleExclude,
  markPaid,
  unmarkPaid,
  getLootEntries,
  getStampLoans,
  getPaymentMap,
  closePanel,
  hasAnyPaid,
  isMutationLocked,
  computeSalaryView,
  rebuildSalaryPanel,
};
