const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../database/db');
const guildSettingsService = require('./guildSettingsService');

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: 'oldest', label: 'terlama / oldest' },
  { value: 'newest', label: 'terbaru / newest' },
];

// Sesuai kolom item_catalog.category ('Accessory' | 'Armor' | 'Material').
// 'Lainnya' = gold drop / label custom yang item_id-nya NULL (gak ada di catalog).
const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua kategori' },
  { value: 'Accessory', label: 'Accessory' },
  { value: 'Armor', label: 'Armor' },
  { value: 'Material', label: 'Material' },
  { value: 'Lainnya', label: 'Lainnya (gold drop, dll)' },
];

/**
 * Semua item yang statusnya masih 'pending' (belum laku) di SELURUH server
 * yang pakai bot ini, run yang dibatalkan gak ikut kehitung.
 */
function getGlobalUnsoldItems() {
  return db
    .prepare(
      `SELECT le.id, le.qty, le.added_at, le.label AS fallback_label,
              ic.item_name, ic.category,
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

function categoryOf(it) {
  // Item catalog: 'Accessory' | 'Armor' | 'Material'. Gold drop / custom label -> 'Lainnya'.
  return it.category || 'Lainnya';
}

function applyFilterAndSort(items, sort, filter) {
  let result = filter === 'all' ? items : items.filter((it) => categoryOf(it) === filter);
  result = [...result]; // dari SQL udah ASC (terlama dulu)
  if (sort === 'newest') result.reverse();
  return result;
}

/**
 * Bangun payload (Components V2 container: judul+?, dropdown sort/filter, list,
 * tombol nav, footer) untuk SATU halaman. Fungsi ini murni dari state yang dikasih
 * (page/sort/filter) + data DB saat ini — dipakai baik buat refresh otomatis
 * (reset ke halaman 1) maupun buat tombol next/prev/sort/filter yang tinggal
 * manggil interaction.update(payload).
 */
async function buildBoardPayload(client, { page = 1, sort = 'oldest', filter = 'all' } = {}) {
  const allItems = getGlobalUnsoldItems();
  const items = applyFilterAndSort(allItems, sort, filter);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // --- List isi item (dulu jadi embed description) ---
  let listText;
  if (!items.length) {
    listText = 'Nggak ada item yang lagi nunggu harga saat ini. 🎉';
  } else {
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

    const lines = [];
    for (const it of pageItems) {
      const name = it.item_name || it.fallback_label || 'Item';
      const qtyText = it.qty > 1 ? ` x${it.qty}` : '';
      const ts = toUnixSeconds(it.added_at);
      const guildName = await resolveGuildName(it.guild_id);
      lines.push(`${name}${qtyText} | <@${it.responsible_id}> | ${guildName} | <t:${ts}:R>`);
    }
    listText = lines.join('\n').slice(0, 4000);
  }

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`unsoldboard:nav:1:${sort}:${filter}:first`)
      .setLabel('⏪')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`unsoldboard:nav:${safePage - 1}:${sort}:${filter}:prev`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId('unsoldboard:noop')
      .setLabel(`${safePage}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`unsoldboard:nav:${safePage + 1}:${sort}:${filter}:next`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages),
    new ButtonBuilder()
      .setCustomId(`unsoldboard:nav:${totalPages}:${sort}:${filter}:last`)
      .setLabel('⏩')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages)
  );

  const sortSelect = new StringSelectMenuBuilder()
    .setCustomId(`unsoldboard:sort:${filter}`)
    .setPlaceholder('Sort by')
    .addOptions(SORT_OPTIONS.map((o) => ({ ...o, default: o.value === sort })));

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? 'Semua kategori';

  const container = new ContainerBuilder().setAccentColor(0xa1c580);

  // Judul + tombol "?"
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('📦 **Item Belum Laku**'))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('unsoldboard:help')
          .setLabel('?')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // Teks filter aktif + tombol Filter kecil di kanan
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Filter kategori:** \`${filterLabel}\``)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`unsoldboard:filteropen:${safePage}:${sort}:${filter}`)
          .setLabel('Filter')
          .setEmoji('1560182300094890036')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  // Dropdown sort
  container.addActionRowComponents(new ActionRowBuilder().addComponents(sortSelect));

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));

  if (items.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(navRow);
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Halaman ${safePage}/${totalPages} · ${items.length} item · update otomatis tiap ada perubahan`
    )
  );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

/** Pesan ephemeral berisi dropdown filter kategori (muncul pas tombol "Filter" diklik). */
function buildFilterPickerPayload({ sort, filter, boardMessageId }) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`unsoldboard:filter:${sort}:${boardMessageId}`)
    .setPlaceholder('Pilih kategori')
    .addOptions(FILTER_OPTIONS.map((o) => ({ ...o, default: o.value === filter })));

  return {
    content: 'Pilih kategori yang mau ditampilkan:',
    components: [new ActionRowBuilder().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Refresh board di semua server yang UDAH ngatur unsold_board_channel lewat /setup bot.
 * Dipanggil tiap ada PERUBAHAN DATA (item ditambah/dijual/dihapus) -> reset semua board
 * ke halaman 1 + sort/filter default, karena state per-halaman sengaja nggak disimpan
 * di DB (cuma nempel di customId tombol/dropdown pesan itu sendiri).
 *
 * Yang belum atur channel-nya sama sekali -> dikasih 1x pesan pengingat ke salary_channel
 * (bukan nempelin board ke sana), biar admin sadar perlu /setup bot unsold_board_channel.
 */
async function refreshGlobalBoard(client) {
  const guilds = guildSettingsService.getAllApprovedSettings();
  if (!guilds.length) return;

  const payload = await buildBoardPayload(client, { page: 1, sort: 'oldest', filter: 'all' });

  for (const g of guilds) {
    if (!g.unsold_board_channel_id) {
      await remindUnsoldBoardNotConfigured(client, g);
      continue;
    }

    try {
      const channel = await client.channels.fetch(g.unsold_board_channel_id);
      if (g.unsold_board_message_id) {
        try {
          const msg = await channel.messages.fetch(g.unsold_board_message_id);
          await msg.edit(payload);
          continue;
        } catch (err) {
          // Pesan lama udah kehapus / gak ketemu -> lanjut kirim baru di bawah
        }
      }
      const msg = await channel.send(payload);
      guildSettingsService.updateSettings(g.guild_id, { unsold_board_message_id: msg.id });
    } catch (err) {
      console.warn(`[globalBoardService] Gagal update board guild ${g.guild_id}:`, err.message);
    }
  }
}

/** Kirim pengingat SEKALI aja (biar gak spam tiap refresh) kalau unsold_board_channel belum diatur. */
async function remindUnsoldBoardNotConfigured(client, g) {
  if (g.unsold_board_reminder_sent) return; // udah pernah diingetin, gak usah lagi
  if (!g.salary_channel_id) return; // gak ada channel sama sekali buat kirim pengingat

  try {
    const channel = await client.channels.fetch(g.salary_channel_id);
    await channel.send(
      '📦 Unsold board belum diatur buat server ini. Jalanin `/setup bot unsold_board_channel:#channel` biar item yang belum laku bisa ditampilin.'
    );
    guildSettingsService.updateSettings(g.guild_id, { unsold_board_reminder_sent: 1 });
  } catch (err) {
    console.warn(`[globalBoardService] Gagal kirim pengingat guild ${g.guild_id}:`, err.message);
  }
}

module.exports = { getGlobalUnsoldItems, buildBoardPayload, buildFilterPickerPayload, refreshGlobalBoard };
