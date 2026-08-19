const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const partyService = require('./partyService');
const guildSettingsService = require('./guildSettingsService');

const MAX_PARTIES_SHOWN = 20; // dibatesin biar gak nabrak limit 25 tombol (5 baris x 5)
const ALWAYS_HIDE_IF_ANY_FILLED = ['FU', 'MT', 'ARCHER', 'HEALER'];

function getOpenRunsAcrossGuilds() {
  return db.prepare(`SELECT * FROM party_run WHERE status IN ('open','locked') ORDER BY created_at ASC`).all();
}

/** FU/MT/ARCHER/HEALER: begitu keisi 1 orang aja dianggap cukup, gak ditampilin lagi walau slot belum penuh. */
function getMissingRoles(requirements, members) {
  return requirements.filter((req) => {
    const filledCount = members.filter((m) => m.role_code === req.role_code).length;
    if (ALWAYS_HIDE_IF_ANY_FILLED.includes(req.role_code)) {
      return filledCount === 0;
    }
    return filledCount < req.slots;
  });
}

function formatMissingText(requirements, members) {
  const missing = getMissingRoles(requirements, members);
  return missing
    .map((req) => {
      if (ALWAYS_HIDE_IF_ANY_FILLED.includes(req.role_code)) return req.role_code;
      const filledCount = members.filter((m) => m.role_code === req.role_code).length;
      const remaining = req.slots - filledCount;
      return remaining > 1 ? `${req.role_code} x${remaining}` : req.role_code;
    })
    .join(', ');
}

/** Bikin tombol Link ke voice channel host (kalau lagi voice-an), fallback ke text channel party. */
async function buildJoinButton(client, run) {
  try {
    const guild = await client.guilds.fetch(run.guild_id);
    const hostMember = await guild.members.fetch(run.host_id).catch(() => null);
    const voiceChannel = hostMember?.voice?.channel || null;
    const targetChannel = voiceChannel || (await client.channels.fetch(run.channel_id).catch(() => null));
    if (!targetChannel) return null;

    // Invite baru tiap board di-refresh — sengaja short-lived (1 jam) biar gak numpuk invite lama.
    const invite = await targetChannel.createInvite({ maxAge: 3600, unique: true }).catch(() => null);
    if (!invite) return null; // biasanya karena bot gak punya izin "Create Invite" di channel itu

    const label = (voiceChannel ? `🔊 Voice — ${run.title}` : `💬 Chat — ${run.title}`).slice(0, 80);
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(invite.url).setLabel(label);
  } catch (err) {
    console.warn(`[partyBoardService] Gagal bikin invite run #${run.id}:`, err.message);
    return null;
  }
}

async function buildBoardPayload(client) {
  const runs = getOpenRunsAcrossGuilds();
  const embed = new EmbedBuilder().setTitle('🔔 BUTUH ORANG').setColor(0x2ecc71);

  const fields = [];
  const buttons = [];

  for (const run of runs) {
    if (fields.length >= MAX_PARTIES_SHOWN) break;

    const requirements = partyService.getRequirements(run.id);
    const members = partyService.getActiveMembers(run.id);
    const missingText = formatMissingText(requirements, members);
    if (!missingText) continue; // udah cukup orang buat semua role penting, skip

    let guildName = client.guilds.cache.get(run.guild_id)?.name;
    if (!guildName) {
      try { guildName = (await client.guilds.fetch(run.guild_id)).name; } catch { guildName = 'Server'; }
    }

    fields.push({ name: run.title, value: `Butuh: ${missingText}\n🔊 Voice Room: ${guildName}` });

    const button = await buildJoinButton(client, run);
    if (button) buttons.push(button);
  }

  if (!fields.length) {
    embed.setDescription('=====ALL DONE=====');
    return { embeds: [embed], components: [] };
  }

  embed.addFields(fields);

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  return { embeds: [embed], components: rows.slice(0, 5) };
}

async function refreshPartyBoard(client) {
  const guilds = db.prepare(`SELECT * FROM guild_settings WHERE party_channel_id IS NOT NULL`).all();
  if (!guilds.length) return;

  const payload = await buildBoardPayload(client);

  for (const g of guilds) {
    try {
      const channel = await client.channels.fetch(g.party_channel_id);
      if (g.party_board_message_id) {
        try {
          const msg = await channel.messages.fetch(g.party_board_message_id);
          await msg.edit(payload);
          continue;
        } catch (err) { /* pesan lama gone, kirim baru di bawah */ }
      }
      const msg = await channel.send(payload);
      guildSettingsService.updateSettings(g.guild_id, { party_board_message_id: msg.id });
    } catch (err) {
      console.warn(`[partyBoardService] Gagal update board guild ${g.guild_id}:`, err.message);
    }
  }
}

module.exports = { refreshPartyBoard };