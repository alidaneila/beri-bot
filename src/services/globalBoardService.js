const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const guildSettingsService = require('./guildSettingsService');

const MAX_ITEMS_SHOWN = 40;

/**
 * Semua item yang statusnya masih 'pending' (belum laku) di SELURUH server
 * yang pakai bot ini, run yang dibatalkan gak ikut kehitung.
 */
function getGlobalUnsoldItems() {
  return db
    .prepare(
      `SELECT le.id, le.qty, le.added_at, le.label AS fallback_label,
              ic.item_name,
              pr.guild_id, pr.title AS run_title,
              COALESCE(st.accounting_id, pr.host_id) AS responsible_id
       FROM loot_entry le
       LEFT JOIN item_catalog ic ON ic.id = le.item_id
       JOIN party_run pr ON pr.id = le.run_id
       LEFT JOIN salary_thread st ON st.run_id = le.run_id
       WHERE le.status = 'pending' AND pr.status != 'cancelled'
       ORDER BY le.added_at ASC`
    )
    .all();
}

function toUnixSeconds(sqliteDatetime) {
  // SQLite datetime('now') formatnya "YYYY-MM-DD HH:MM:SS" dalam UTC, tanpa 'Z'.
  const iso = sqliteDatetime.replace(' ', 'T') + 'Z';
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function buildBoardEmbed(client) {
  const items = getGlobalUnsoldItems();

  const embed = new EmbedBuilder()
    .setTitle('📦 Item Belum Laku (Semua Server)')
    .setColor(0xf1c40f)
    .setFooter({ text: 'Update otomatis tiap ada perubahan item di thread manapun' });

  if (!items.length) {
    embed.setDescription('Nggak ada item yang lagi nunggu harga saat ini. 🎉');
    return embed;
  }

  const shown = items.slice(0, MAX_ITEMS_SHOWN);
  const lines = [];
  for (const it of shown) {
    const name = it.item_name || it.fallback_label || 'Item';
    const qtyText = it.qty > 1 ? ` x${it.qty}` : '';
    const ts = toUnixSeconds(it.added_at);

    let guildName = client.guilds.cache.get(it.guild_id)?.name;
    if (!guildName) {
      try { guildName = (await client.guilds.fetch(it.guild_id)).name; } catch { guildName = 'Server'; }
    }

    lines.push(`• **${name}**${qtyText} (${guildName}) — 🧮 <@${it.responsible_id}> — <t:${ts}:R>`);
  }

  embed.setDescription(lines.join('\n'));
  if (items.length > MAX_ITEMS_SHOWN) {
    embed.addFields({ name: '\u200b', value: `*+${items.length - MAX_ITEMS_SHOWN} item lainnya, gak muat ditampilin semua.*` });
  }

  return embed;
}

/**
 * Refresh board di SEMUA server yang punya unsold_board_channel_id aktif.
 * Dipanggil tiap ada mutasi loot_entry (nambah/hapus/isi harga item, cancel run).
 * Edit pesan lama kalau ada, kirim baru kalau belum/udah kehapus.
 */
async function refreshGlobalBoard(client) {
  const guilds = guildSettingsService.getGuildsWithBoard();
  if (!guilds.length) return;

  const embed = buildBoardEmbed(client);

  for (const g of guilds) {
    try {
      const channel = await client.channels.fetch(g.unsold_board_channel_id);
      if (g.unsold_board_message_id) {
        try {
          const msg = await channel.messages.fetch(g.unsold_board_message_id);
          await msg.edit({ embeds: [embed] });
          continue;
        } catch (err) {
          // Pesan lama udah kehapus / gak ketemu -> lanjut kirim baru di bawah
        }
      }
      const msg = await channel.send({ embeds: [embed] });
      guildSettingsService.updateSettings(g.guild_id, { unsold_board_message_id: msg.id });
    } catch (err) {
      console.warn(`[globalBoardService] Gagal update board guild ${g.guild_id}:`, err.message);
    }
  }
}

module.exports = { getGlobalUnsoldItems, buildBoardEmbed, refreshGlobalBoard };
