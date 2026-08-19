const db = require('../database/db');

/**
 * Cari member yang belum pernah ikut party run manapun sebelumnya di server ini
 * DAN belum punya IGN tersimpan. Dipanggil pas bikin salary thread (finalizeParty).
 */
function findFirstTimers(guildId, runId, userIds) {
  const countPrevRuns = db.prepare(`
    SELECT COUNT(*) as cnt FROM party_member pm
    JOIN party_run pr ON pr.id = pm.run_id
    WHERE pm.user_id = ? AND pr.guild_id = ? AND pm.run_id != ? AND pm.is_removed = 0
  `);
  const hasIgn = db.prepare(`SELECT 1 FROM player_ign WHERE guild_id = ? AND user_id = ?`);

  return userIds.filter((userId) => {
    if (hasIgn.get(guildId, userId)) return false; // udah punya IGN tersimpan
    const { cnt } = countPrevRuns.get(userId, guildId, runId);
    return cnt === 0; // belum pernah ikut run lain sebelumnya
  });
}

function markPendingCapture(threadId, guildId, userIds) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ign_capture_pending (thread_id, user_id, guild_id) VALUES (?, ?, ?)`
  );
  const tx = db.transaction((ids) => {
    for (const userId of ids) stmt.run(threadId, userId, guildId);
  });
  tx(userIds);
}

function getPendingCapture(threadId, userId) {
  return db
    .prepare(`SELECT 1 FROM ign_capture_pending WHERE thread_id = ? AND user_id = ?`)
    .get(threadId, userId);
}

function saveIgn(guildId, userId, ign) {
  db.prepare(
    `INSERT INTO player_ign (guild_id, user_id, ign, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(guild_id, user_id) DO UPDATE SET ign = excluded.ign, updated_at = datetime('now')`
  ).run(guildId, userId, ign);
}

function getIgn(guildId, userId) {
  const row = db.prepare(`SELECT ign FROM player_ign WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
  return row?.ign || null;
}

function clearPendingCapture(threadId, userId) {
  db.prepare(`DELETE FROM ign_capture_pending WHERE thread_id = ? AND user_id = ?`).run(threadId, userId);
}

module.exports = {
  findFirstTimers,
  markPendingCapture,
  getPendingCapture,
  saveIgn,
  getIgn,
  clearPendingCapture,
};
