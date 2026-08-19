const db = require('../database/db');
const config = require('../config');

function createRun({ guildId, channelId, hostId, title }) {
  const info = db
    .prepare(
      `INSERT INTO party_run (guild_id, channel_id, host_id, title)
       VALUES (?, ?, ?, ?)`
    )
    .run(guildId, channelId, hostId, title);

  const runId = info.lastInsertRowid;
  const insertReq = db.prepare(
    `INSERT INTO role_requirement (run_id, role_code, slots) VALUES (?, ?, ?)`
  );
  for (const r of config.roleRequirements) {
    insertReq.run(runId, r.code, r.slots);
  }

  return getRun(runId);
}

function getRun(runId) {
  return db.prepare(`SELECT * FROM party_run WHERE id = ?`).get(runId);
}

function getRequirements(runId) {
  return db.prepare(`SELECT * FROM role_requirement WHERE run_id = ?`).all(runId);
}

function getActiveMembers(runId) {
  return db
    .prepare(`SELECT * FROM party_member WHERE run_id = ? AND is_removed = 0`)
    .all(runId);
}

function setPanelMessageId(runId, messageId) {
  db.prepare(`UPDATE party_run SET panel_message_id = ? WHERE id = ?`).run(messageId, runId);
}

function isRoleFull(runId, roleCode) {
  const req = db
    .prepare(`SELECT slots FROM role_requirement WHERE run_id = ? AND role_code = ?`)
    .get(runId, roleCode);
  if (!req) return true;
  const count = db
    .prepare(
      `SELECT COUNT(*) AS c FROM party_member WHERE run_id = ? AND role_code = ? AND is_removed = 0`
    )
    .get(runId, roleCode).c;
  return count >= req.slots;
}

function isPartyFull(runId) {
  const count = getActiveMembers(runId).length;
  return count >= config.partyMemberCap;
}

/**
 * Join role. Kalau roleCode butuh subrole (ICE_STACKING/DPS) tapi subrole belum dipilih,
 * caller harus munculkan select menu dulu (dicek lewat needsSubrole()).
 */
function needsSubrole(roleCode) {
  const cfg = config.roleRequirements.find((r) => r.code === roleCode);
  return Boolean(cfg && cfg.subroles);
}

function joinRole(runId, userId, roleCode, subrole = null) {
  if (isRoleFull(runId, roleCode)) {
    return { ok: false, reason: 'ROLE_FULL' };
  }
  // User yang PINDAH role tidak nambah hitungan cap total, jadi cek cap dulu SEBELUM
  // menghapus role lama dia — kalau dia belum punya role di run ini, baru kena cek cap.
  const alreadyInParty = db
    .prepare(`SELECT 1 FROM party_member WHERE run_id = ? AND user_id = ? LIMIT 1`)
    .get(runId, userId);
  if (!alreadyInParty && isPartyFull(runId)) {
    return { ok: false, reason: 'PARTY_FULL' };
  }
  // Satu user cuma boleh pegang satu role aktif per run — hapus role lain yang dia pegang dulu.
  db.prepare(`DELETE FROM party_member WHERE run_id = ? AND user_id = ?`).run(runId, userId);
  db.prepare(
    `INSERT INTO party_member (run_id, user_id, role_code, subrole) VALUES (?, ?, ?, ?)`
  ).run(runId, userId, roleCode, subrole);
  return { ok: true };
}

function cancelRole(runId, userId) {
  const info = db
    .prepare(`DELETE FROM party_member WHERE run_id = ? AND user_id = ?`)
    .run(runId, userId);
  return info.changes > 0;
}

/** Remove Member = kick tampilan (member nakal), bukan hapus dari DB — tandai is_removed. */
function removeMember(runId, userId, roleCode) {
  db.prepare(
    `UPDATE party_member SET is_removed = 1 WHERE run_id = ? AND user_id = ? AND role_code = ?`
  ).run(runId, userId, roleCode);
}

function setStatus(runId, status) {
  db.prepare(`UPDATE party_run SET status = ? WHERE id = ?`).run(status, runId);
}

function editTitle(runId, title) {
  db.prepare(`UPDATE party_run SET title = ? WHERE id = ?`).run(title, runId);
}

module.exports = {
  createRun,
  getRun,
  getRequirements,
  getActiveMembers,
  setPanelMessageId,
  isRoleFull,
  isPartyFull,
  needsSubrole,
  joinRole,
  cancelRole,
  removeMember,
  setStatus,
  editTitle,
};
