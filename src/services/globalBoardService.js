const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const guildSettingsService = require('./guildSettingsService');

const MAX_ITEMS_PER_GROUP = 25;

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

/** Semua nama item di catalog diawalin "GDN " atau "DDN ", jadi gak perlu kolom raid_type terpisah. */
function detectRaidType(itemName) {
  if (/^GDN\s/i.test(itemName)) return 'GDN';
  if (/^DDN\s/i.test(itemName)) return 'DDN';
  return 'Lainnya'; // gold drop / label custom yang gak diawalin GDN/DDN
}

async function buildBoardEmbed(client) {
  const items = getGlobalUnsoldItems();

  const embed = new EmbedBuilder()
    .setTitle('📦 Item Belum Laku')
    .setColor(0xf1c40f)
    .setFooter({ text: 'Update otomatis tiap ada perubahan item di thread manapun' });

  if (!items.length) {
    embed.setDescription('Nggak ada item yang lagi nunggu harga saat ini. 🎉');
    return embed;
  }

  // Cache nama guild biar gak fetch berulang buat item dari server yang sama
  const guildNameCache = new Map();
  async function resolveGuildName(guildId) {
    if (guildNameCache.has(guildId)) return guildNameCache.get(guildId);
    let name = client.guilds.cache.get(guildId)?.name;
    if (!name) {
      try { name = (await client.guilds.fetch(guildId)).name; } catch { name = 'Server'; }
    }
    guildNameCache.set(guildId, name);
    return name;
  }

  function buildLine(it, guildName) {
    const name = it.item_name || it.fallback_label || 'Item';
    const qtyText = it.qty > 1 ? ` x${it.qty}` : '';
    const ts = toUnixSeconds(it.added_at);
    return `${name}${qtyText} | <@${it.responsible_id}> | ${guildName} | <t:${ts}:R>`;
  }

  // Pisah GDN / DDN / Lainnya berdasarkan awalan nama item
  const groups = { GDN: [], DDN: [], Lainnya: [] };
  for (const it of items) {
    const name = it.item_name || it.fallback_label || '';
    groups[detectRaidType(name)].push(it);
  }

  for (const key of ['GDN', 'DDN', 'Lainnya']) {
    const groupItems = groups[key];
    if (!groupItems.length) continue;

    const shown = groupItems.slice(0, MAX_ITEMS_PER_GROUP);
    const lines = [];
    for (const it of shown) {
      const guildName = await resolveGuildName(it.guild_id);
      lines.push(buildLine(it, guildName));
    }
    if (groupItems.length > MAX_ITEMS_PER_GROUP) {
      lines.push(`*+${groupItems.length - MAX_ITEMS_PER_GROUP} item lainnya*`);
    }

    embed.addFields({ name: `— ${key} —`, value: lines.join('\n').slice(0, 1024) });
  }

  return embed;
}

/**
 * Refresh board di SEMUA server (wajib, bukan opsional) — fallback ke salary_channel_id
 * kalau unsold_board_channel_id belum di-set manual lewat /setup bot.
 * Dipanggil tiap ada mutasi loot_entry (nambah/hapus/isi harga item, cancel run).
 * Edit pesan lama kalau ada, kirim baru kalau belum/udah kehapus.
 */
async function refreshGlobalBoard(client) {
  const guilds = guildSettingsService.getAllApprovedSettings();
  if (!guilds.length) return;

  const embed = await buildBoardEmbed(client);

  for (const g of guilds) {
    const targetChannelId = g.unsold_board_channel_id || g.salary_channel_id;
    if (!targetChannelId) continue; // belum ada channel apapun buat server ini, skip

    try {
      const channel = await client.channels.fetch(targetChannelId);
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