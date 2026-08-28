const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { formatGold } = require('../utils/formatGold');

const MEDALS = ['🥇', '🥈', '🥉'];

function rankLine(row, index) {
  const medal = MEDALS[index] || `${index + 1}.`;
  return `${medal} <@${row.user_id}> — ${formatGold(row.total)}`;
}

function getTopAllTime(guildId, limit = 10) {
  return db
    .prepare(
      `SELECT ps.user_id, SUM(ps.amount_owed) as total
       FROM payment_status ps
       JOIN party_run pr ON pr.id = ps.run_id
       WHERE pr.guild_id = ? AND ps.is_paid = 1
       GROUP BY ps.user_id
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(guildId, limit);
}

function getTopForRange(guildId, start, end, limit = 5) {
  return db
    .prepare(
      `SELECT ps.user_id, SUM(ps.amount_owed) as total
       FROM payment_status ps
       JOIN party_run pr ON pr.id = ps.run_id
       WHERE pr.guild_id = ? AND ps.is_paid = 1 AND ps.paid_at >= ? AND ps.paid_at < ?
       GROUP BY ps.user_id
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(guildId, start, end, limit);
}

/** offsetWeeks=0 -> minggu ini (Senin-Minggu, UTC), offsetWeeks=1 -> minggu lalu. */
function getWeekBoundaries(offsetWeeks) {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Minggu, 1=Senin, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const mondayThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
  const start = new Date(mondayThisWeek);
  start.setUTCDate(start.getUTCDate() - offsetWeeks * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  return { start: fmt(start), end: fmt(end) };
}

function buildAllTimeEmbed(guildId) {
  const rows = getTopAllTime(guildId, 10);
  const embed = new EmbedBuilder().setTitle('RICHEST PLAYER --all time').setColor(0xf1c40f);
  embed.setDescription(rows.length ? rows.map(rankLine).join('\n') : 'Belum ada pembayaran tercatat.');
  return embed;
}

function buildWeeklyEmbed(guildId) {
  const thisWeek = getWeekBoundaries(0);
  const lastWeek = getWeekBoundaries(1);
  const rowsThis = getTopForRange(guildId, thisWeek.start, thisWeek.end, 5);
  const rowsLast = getTopForRange(guildId, lastWeek.start, lastWeek.end, 5);

  return new EmbedBuilder()
    .setTitle('RICHEST PLAYER')
    .setColor(0x3498db)
    .addFields(
      { name: 'Minggu Ini', value: rowsThis.length ? rowsThis.map(rankLine).join('\n') : 'Belum ada.', inline: true },
      { name: 'Minggu Lalu', value: rowsLast.length ? rowsLast.map(rankLine).join('\n') : 'Belum ada.', inline: true }
    );
}

/** Edit 2 pesan (all-time & weekly) di channel leaderboard server ini, kirim baru kalau belum ada. */
async function refreshLeaderboards(client, guildId) {
  const guildSettingsService = require('./guildSettingsService'); // lazy require, hindari circular
  const settings = guildSettingsService.getSettings(guildId);
  if (!settings.leaderboard_channel_id) return;

  try {
    const channel = await client.channels.fetch(settings.leaderboard_channel_id);

    const alltimeEmbed = buildAllTimeEmbed(guildId);
    const weeklyEmbed = buildWeeklyEmbed(guildId);

    // Pesan 1: All-time
    let alltimeMsgId = settings.leaderboard_alltime_message_id;
    if (alltimeMsgId) {
      try {
        const msg = await channel.messages.fetch(alltimeMsgId);
        await msg.edit({ embeds: [alltimeEmbed] });
      } catch (err) {
        alltimeMsgId = null;
      }
    }
    if (!alltimeMsgId) {
      const msg = await channel.send({ embeds: [alltimeEmbed] });
      guildSettingsService.updateSettings(guildId, { leaderboard_alltime_message_id: msg.id });
    }

    // Pesan 2: Weekly
    let weeklyMsgId = settings.leaderboard_weekly_message_id;
    if (weeklyMsgId) {
      try {
        const msg = await channel.messages.fetch(weeklyMsgId);
        await msg.edit({ embeds: [weeklyEmbed] });
      } catch (err) {
        weeklyMsgId = null;
      }
    }
    if (!weeklyMsgId) {
      const msg = await channel.send({ embeds: [weeklyEmbed] });
      guildSettingsService.updateSettings(guildId, { leaderboard_weekly_message_id: msg.id });
    }
  } catch (err) {
    console.warn(`[leaderboardService] Gagal update leaderboard guild ${guildId}:`, err.message);
  }
}

module.exports = { refreshLeaderboards };