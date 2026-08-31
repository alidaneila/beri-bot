const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const db = require('../database/db');

/**
 * /admincleanup — OWNER ONLY. Lihat & hapus party_run "hantu" langsung dari Discord,
 * gak butuh Railway CLI / SSH karena jalan di process bot yang sama dengan production.
 *
 * - list  : nampilin semua party_run di server ini (guild tempat command dijalankan),
 *           urut dari yang terbaru, plus ID-nya.
 * - delete: hapus party_run berdasarkan ID (pisah koma), TAPI selalu divalidasi ulang
 *           bahwa ID itu emang milik server ini. Ada mode dry-run (default) dan
 *           konfirmasi eksplisit (opsi `confirm: true`) sebelum beneran menghapus.
 *
 * Setelah beres dipakai, boleh dihapus lagi dari command list ini + deploy-commands.js
 * kalau mau, tapi biarin aja juga gak masalah karena udah di-gate ownerUserId.
 */

function isOwner(interaction) {
  return Boolean(config.ownerUserId) && interaction.user.id === config.ownerUserId;
}

function listParties(guildId) {
  return db
    .prepare(
      `SELECT id, title, status, host_id, created_at
       FROM party_run
       WHERE guild_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`
    )
    .all(guildId);
}

function memberCount(runId) {
  return db
    .prepare(`SELECT COUNT(*) AS c FROM party_member WHERE run_id = ? AND is_removed = 0`)
    .get(runId).c;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admincleanup')
    .setDescription('(Owner only) Lihat/hapus party_run yang nyangkut di DB untuk server ini')
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Tampilkan semua party run di server ini beserta ID-nya')
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Hapus party run berdasarkan ID (dry-run kecuali confirm=true)')
        .addStringOption((opt) =>
          opt
            .setName('ids')
            .setDescription('ID party run dipisah koma, contoh: 41,42,43,44')
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('confirm')
            .setDescription('Isi true buat beneran menghapus. Kalau kosong/false cuma preview.')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!isOwner(interaction)) {
      await interaction.reply({ content: '⛔ Command ini cuma buat owner bot.', flags: MessageFlags.Ephemeral });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const rows = listParties(guildId);
      if (rows.length === 0) {
        await interaction.reply({ content: 'Gak ada party_run buat server ini.', flags: MessageFlags.Ephemeral });
        return;
      }
      const lines = rows.map((r) => {
        const c = memberCount(r.id);
        return `**id=${r.id}** — "${r.title}" — status=${r.status} — members=${c} — host=<@${r.host_id}> — ${r.created_at}`;
      });
      // Discord limit 2000 char per pesan, potong kalau kepanjangan
      let content = `Party run di server ini (${rows.length}, terbaru di atas):\n\n${lines.join('\n')}`;
      if (content.length > 1900) content = content.slice(0, 1900) + '\n… (kepotong, ada lebih banyak)';
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'delete') {
      const idsRaw = interaction.options.getString('ids', true);
      const confirm = interaction.options.getBoolean('confirm') || false;
      const ids = idsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isInteger(n));

      if (ids.length === 0) {
        await interaction.reply({ content: 'Format ID gak valid. Contoh: `41,42,43,44`', flags: MessageFlags.Ephemeral });
        return;
      }

      const placeholders = ids.map(() => '?').join(',');
      const toDelete = db
        .prepare(`SELECT id, title, status, created_at FROM party_run WHERE guild_id = ? AND id IN (${placeholders})`)
        .all(guildId, ...ids);

      const notFound = ids.filter((id) => !toDelete.some((r) => r.id === id));

      if (toDelete.length === 0) {
        await interaction.reply({
          content: `Gak ada ID yang cocok buat server ini. (dicari: ${ids.join(', ')})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const previewLines = toDelete.map((r) => `- id=${r.id} "${r.title}" (status=${r.status}, ${r.created_at})`);
      let header = confirm
        ? `✅ **DIHAPUS** ${toDelete.length} party run:`
        : `👀 **PREVIEW (belum dihapus)** — ${toDelete.length} party run akan dihapus kalau kamu jalanin ulang dengan \`confirm: true\`:`;
      if (notFound.length) header += `\n⚠️ ID ini diskip karena bukan milik server ini: ${notFound.join(', ')}`;

      if (confirm) {
        const del = db.prepare(`DELETE FROM party_run WHERE guild_id = ? AND id = ?`);
        const txn = db.transaction((rows) => {
          for (const r of rows) del.run(guildId, r.id);
        });
        txn(toDelete);
      }

      const content = `${header}\n\n${previewLines.join('\n')}`;
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }
  },
};
