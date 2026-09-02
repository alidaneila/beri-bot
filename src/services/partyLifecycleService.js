const partyService = require('./partyService');
const partyBoardService = require('./partyBoardService');
const { buildPartyEmbed } = require('../ui/partyEmbed');

const AUTO_CANCEL_HOURS = 8;

/**
 * Party yang statusnya open/locked tapi udah >= AUTO_CANCEL_HOURS jam nggak ada
 * aktivitas sama sekali (join role, cancel role, remove member, lock/unlock,
 * edit title, notify) bakal otomatis di-cancel. Ini yang nyegah "party hantu"
 * numpuk permanen di board BUTUH ORANG lintas-server.
 *
 * Dipanggil sekali pas bot start + berkala lewat setInterval (lihat index.js).
 */
async function autoCancelStaleParties(client) {
  const staleRuns = partyService.getStaleOpenRuns(AUTO_CANCEL_HOURS);
  if (!staleRuns.length) return;

  console.log(`[partyLifecycleService] Auto-cancel ${staleRuns.length} party yang nganggur >${AUTO_CANCEL_HOURS} jam.`);

  for (const run of staleRuns) {
    partyService.setStatus(run.id, 'cancelled');

    try {
      const channel = await client.channels.fetch(run.channel_id);

      if (run.panel_message_id) {
        try {
          const message = await channel.messages.fetch(run.panel_message_id);
          const embed = buildPartyEmbed(partyService.getRun(run.id), [], []);
          await message.edit({ embeds: [embed], components: [] });
        } catch (err) {
          // Panel message-nya udah kehapus/gak ketemu, gapapa dilewatin.
        }
      }

      await channel
        .send(`⏰ Party **${run.title}** otomatis dibatalkan karena nggak ada aktivitas selama ${AUTO_CANCEL_HOURS} jam.`)
        .catch(() => {});
    } catch (err) {
      console.warn(`[partyLifecycleService] Gagal update channel buat run #${run.id}:`, err.message);
    }
  }

  // Satu kali aja di akhir, bukan per-run, biar gak muter board berkali-kali.
  await partyBoardService.cleanupPartyBoard(client);
}

module.exports = { autoCancelStaleParties, AUTO_CANCEL_HOURS };
