const db = require('../database/db');

// ============================================================
// APPROVAL GATE — bot ini private, cuma server yang di-approve owner yang bisa pakai.
// ============================================================
function isApproved(guildId) {
  return Boolean(db.prepare(`SELECT 1 FROM approved_guilds WHERE guild_id = ?`).get(guildId));
}

function approveGuild(guildId, guildName, approvedBy) {
  db.prepare(
    `INSERT INTO approved_guilds (guild_id, guild_name, approved_by)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET guild_name = excluded.guild_name`
  ).run(guildId, guildName, approvedBy);
}

function unapproveGuild(guildId) {
  db.prepare(`DELETE FROM approved_guilds WHERE guild_id = ?`).run(guildId);
}

// ============================================================
// PENGATURAN PER-SERVER (/setting server)
// ============================================================

/** Selalu balikin row (bikin default kalau belum ada), biar caller gak perlu null-check. */
function getSettings(guildId) {
  let row = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
  if (!row) {
    db.prepare(`INSERT INTO guild_settings (guild_id) VALUES (?)`).run(guildId);
    row = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
  }
  return row;
}

/** patch = object partial, cuma field yang dikasih yang di-update. */
function updateSettings(guildId, patch) {
  getSettings(guildId); // pastiin row-nya ada dulu
  const fields = Object.keys(patch);
  if (!fields.length) return getSettings(guildId);
  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => patch[f]);
  db.prepare(
    `UPDATE guild_settings SET ${setClause}, updated_at = datetime('now') WHERE guild_id = ?`
  ).run(...values, guildId);
  return getSettings(guildId);
}

/** Semua server yang punya unsold board aktif — dipakai globalBoardService buat broadcast. */
function getGuildsWithBoard() {
  return db
    .prepare(`SELECT * FROM guild_settings WHERE unsold_board_channel_id IS NOT NULL`)
    .all();
}

module.exports = {
  isApproved,
  approveGuild,
  unapproveGuild,
  getSettings,
  updateSettings,
  getGuildsWithBoard,
};
