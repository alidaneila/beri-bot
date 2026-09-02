const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { formatGold } = require('../utils/formatGold');
const partyService = require('../services/partyService');
const salaryService = require('../services/salaryService');
const guildSettingsService = require('../services/guildSettingsService');
const ignService = require('../services/ignService');
const globalBoardService = require('../services/globalBoardService');
const { buildPartyEmbed, buildNotifySummary } = require('../ui/partyEmbed');
const {
  buildPartyRows,
  buildSubroleSelect,
  buildMemberSelect,
} = require('../ui/partyComponents');
const {
  buildPendingItemSelect,
  buildRemoveItemSelect,
  buildExcludeSelect,
  buildMarkPaidSelect,
  buildLenderSelect,
  buildRemoveStampLoanSelect,
  buildUndoMarkPaidSelect,
  buildGoldExcludeSelect,
  buildAccountingSelect,
} = require('../ui/salaryComponents');
const leaderboardService = require('../services/leaderboardService');
const { resolveDisplayNames } = require('../utils/members');
const partyBoardService = require('../services/partyBoardService');

function isHost(run, userId) {
  return run.host_id === userId;
}

/** Host ATAU accounting yang ditunjuk boleh pegang tombol host-only DI DALAM salary thread. */
function canManageSalary(run, userId) {
  const salaryThread = salaryService.getSalaryThreadByRunId(run.id);
  return salaryService.isAuthorized(run, salaryThread, userId);
}

async function refreshPartyPanel(client, run) {
  const requirements = partyService.getRequirements(run.id);
  const members = partyService.getActiveMembers(run.id);
  const embed = buildPartyEmbed(run, requirements, members);
  const components = buildPartyRows(run, requirements, members);
  const channel = await client.channels.fetch(run.channel_id);
  const message = await channel.messages.fetch(run.panel_message_id);
  await message.edit({ embeds: [embed], components });
}

async function refreshSalaryPanel(client, guild, runId) {
  const run = partyService.getRun(runId);
  const members = await resolveDisplayNames(guild, partyService.getActiveMembers(runId));
  await salaryService.rebuildSalaryPanel(client, run, members);
}

/**
 * Kirim pesan biasa (bukan edit panel) ke thread salary buat nge-tag/notify
 * member yang baru saja ditandai sudah dibayar (Mark Paid).
 */
async function notifyPaidMembers(client, runId, userIds) {
  if (!userIds?.length) return;
  const salaryThread = salaryService.getSalaryThreadByRunId(runId);
  if (!salaryThread?.thread_id) return;
  try {
    const thread = await client.channels.fetch(salaryThread.thread_id);
    const mentions = userIds.map((id) => `<@${id}>`).join(' ');
    await thread.send({
      content: `💰 done, cek ya: ${mentions}`,
      allowedMentions: { users: userIds },
    });
  } catch (err) {
    console.warn('[notifyPaidMembers] Gagal kirim notifikasi mark paid:', err.message);
  }
}

module.exports = async function interactionCreate(interaction) {
  try {
    // Bot ini private — cuma server yang sudah di-approve owner yang boleh pakai command
    // apapun. /approve sendiri dikecualikan biar owner bisa approve server baru.
    if (interaction.guildId && interaction.commandName !== 'approve') {
      const approved = guildSettingsService.isApproved(interaction.guildId);
      if (!approved) {
        if (interaction.isAutocomplete()) {
          await interaction.respond([]).catch(() => {});
        } else if (interaction.isRepliable()) {
          await interaction
            .reply({
              content: '⛔ server ini belum di-approve. Minta owner bot untuk approve yaa.',
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (err) {
    console.error('[interactionCreate] error:', err);
    const payload = { content: '⚠️ Terjadi error, coba lagi.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
};

// ============================================================
// BUTTONS
// ============================================================
async function handleButton(interaction) {
  const [ns, action, runIdRaw, extra] = interaction.customId.split(':');
  const runId = Number(runIdRaw);

  if (ns === 'party') return handlePartyButton(interaction, action, runId, extra);
  if (ns === 'salary') return handleSalaryButton(interaction, action, runId, extra);
}

async function handlePartyButton(interaction, action, runId, roleCode) {
  const run = partyService.getRun(runId);
  if (!run) return interaction.reply({ content: '⚠️ Party tidak ditemukan.', flags: MessageFlags.Ephemeral });

  switch (action) {
    case 'role': {
      if (run.status !== 'open') {
        return interaction.reply({ content: '🔒 Party sudah dikunci.', flags: MessageFlags.Ephemeral });
      }
      if (partyService.needsSubrole(roleCode)) {
        const cfg = config.roleRequirements.find((r) => r.code === roleCode);
        return interaction.reply({
          content: `Pilih subrole untuk **${roleCode}**:`,
          components: [buildSubroleSelect(runId, roleCode, cfg.subroles)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const result = partyService.joinRole(runId, interaction.user.id, roleCode);
      if (!result.ok) {
        const msg =
          result.reason === 'PARTY_FULL'
            ? `⚠️ Party udah penuh (${config.partyMemberCap} orang).`
            : `⚠️ Role ${roleCode} sudah penuh.`;
        return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      }
      await interaction.reply({ content: `✅ Kamu join sebagai **${roleCode}**!`, flags: MessageFlags.Ephemeral });
      await refreshPartyPanel(interaction.client, run);
      return;
    }

    case 'cancelrole': {
      const ok = partyService.cancelRole(runId, interaction.user.id);
      await interaction.reply({
        content: ok ? '✅ Role kamu dibatalkan.' : 'Kamu belum ambil role apapun.',
        flags: MessageFlags.Ephemeral,
      });
      if (ok) await refreshPartyPanel(interaction.client, run);
      return;
    }

    case 'lock': {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa mengunci party.', flags: MessageFlags.Ephemeral });
      }
      partyService.setStatus(runId, run.status === 'open' ? 'locked' : 'open');
      await interaction.reply({ content: '✅ Status party diubah.', flags: MessageFlags.Ephemeral });
      await refreshPartyPanel(interaction.client, partyService.getRun(runId));
      return;
    }

    case 'removeselect': {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa remove member.', flags: MessageFlags.Ephemeral });
      }
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      if (!members.length) {
        return interaction.reply({ content: 'Belum ada member yang join.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang mau di-remove:',
        components: [buildMemberSelect('party:removeconfirm', runId, members, 'Pilih member')],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'done': {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa menyelesaikan party.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await finalizeParty(interaction, run);
      return;
    }

    case 'cancelrun': {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa cancel run.', flags: MessageFlags.Ephemeral });
      }
      partyService.setStatus(runId, 'cancelled');
      await interaction.reply({ content: '🗑️ Run dibatalkan.', flags: MessageFlags.Ephemeral });
      await refreshPartyPanel(interaction.client, partyService.getRun(runId));
      // Bukan globalBoardService (itu board "Item Belum Laku") — yang perlu di-refresh
      // di sini board "BUTUH ORANG" lintas-server, sama kayak yang dipanggil pas Done.
      await partyBoardService.cleanupPartyBoard(interaction.client);
      return;
    }

    case 'edittitle': {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa edit title.', flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder()
        .setCustomId(`party:edittitlemodal:${runId}`)
        .setTitle('Edit Title Party')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Title baru')
              .setStyle(TextInputStyle.Short)
              .setValue(run.title)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

case 'notify': {
  if (!isHost(run, interaction.user.id)) {
    return interaction.reply({
      content: '⛔ Hanya host yang bisa notify.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await partyBoardService.refreshPartyBoard(interaction.client);

  await interaction.editReply({
    content: '📡 Notify lintas-server terkirim.',
  });

  return;
}
  }// tutup switch
} 
async function handleSalaryButton(interaction, action, runId, extra) {
  const run = partyService.getRun(runId);
  if (!run) return interaction.reply({ content: '⚠️ Run tidak ditemukan.', flags: MessageFlags.Ephemeral });
  // Set Accounting sengaja TETAP host-only murni — cuma host yang boleh nunjuk/ganti accounting.
  if (action === 'setaccounting') {
    if (!isHost(run, interaction.user.id)) {
      return interaction.reply({ content: '⛔ Hanya host yang bisa nunjuk accounting.', flags: MessageFlags.Ephemeral });
    }
  } else if (!canManageSalary(run, interaction.user.id)) {
    return interaction.reply({ content: '⛔ Hanya host atau accounting yang bisa mengelola salary.', flags: MessageFlags.Ephemeral });
  }

  const mutationActions = ['priceselect', 'addgold', 'stamploan', 'removestamploan', 'removeitem', 'excludeselect', 'goldexcludebtn'];
  if (mutationActions.includes(action) && salaryService.isMutationLocked(runId)) {
    return interaction.reply({
      content: '🔒 Sudah ada yang dibayar / panel ditutup — item, gold, dan stamp tidak bisa diubah lagi.',
      flags: MessageFlags.Ephemeral,
    });
  }

  switch (action) {
    case 'priceselect': {
      const pending = salaryService.getLootEntries(runId).filter((e) => e.status === 'pending');
      if (!pending.length) {
        return interaction.reply({ content: 'Tidak ada item yang menunggu harga.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih item yang mau diisi harganya:',
        components: [buildPendingItemSelect(runId, pending)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'addgold': {
      const modal = new ModalBuilder()
        .setCustomId(`salary:addgoldmodal:${runId}`)
        .setTitle('Tambah Gold Drop')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('amount')
              .setLabel('Jumlah gold')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    case 'stamploan': {
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      if (!members.length) {
        return interaction.reply({ content: 'Belum ada member.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Siapa yang minjemin stamp?',
        components: [buildLenderSelect(runId, members)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'removestamploan': {
      const loans = salaryService.getStampLoans(runId);
      if (!loans.length) {
        return interaction.reply({ content: 'Belum ada sealstamp loan yang dicatat.', flags: MessageFlags.Ephemeral });
      }
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      const nameMap = Object.fromEntries(members.map((m) => [m.user_id, m.displayName]));
      const loansWithName = loans.map((l) => ({ ...l, displayName: nameMap[l.lender_id] }));
      return interaction.reply({
        content: 'Pilih sealstamp loan yang mau dihapus:',
        components: [buildRemoveStampLoanSelect(runId, loansWithName)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'undomarkpaidselect': {
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      const paymentMap = salaryService.getPaymentMap(runId);
      const paid = members.filter((m) => paymentMap[m.user_id]?.is_paid);
      if (!paid.length) {
        return interaction.reply({ content: 'Belum ada yang ditandai dibayar.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang mau di-undo (batal ditandai dibayar):',
        components: [buildUndoMarkPaidSelect(runId, paid)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'removeitem': {
      const entries = salaryService.getLootEntries(runId);
      if (!entries.length) {
        return interaction.reply({ content: 'Belum ada item.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih item yang mau dihapus:',
        components: [buildRemoveItemSelect(runId, entries)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'excludeselect': {
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      if (!members.length) {
        return interaction.reply({ content: 'Belum ada member.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang mau di-toggle status ikut/tidak ikut gaji:',
        components: [buildExcludeSelect(runId, members)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'markpaidselect': {
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      const paymentMap = salaryService.getPaymentMap(runId);
      const unpaid = members.filter((m) => !paymentMap[m.user_id]?.is_paid && !m.is_excluded_from_salary);
      if (!unpaid.length) {
        return interaction.reply({ content: 'Semua sudah dibayar.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang sudah dibayar:',
        components: [buildMarkPaidSelect(runId, unpaid)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'goldexcludebtn': {
      const lootEntryId = extra;
      const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(runId));
      if (members.length < 2) {
        return interaction.reply({ content: 'Member kurang dari 2, tidak ada yang bisa di-exclude.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang **TIDAK** dapat share dari drop ini:',
        components: [buildGoldExcludeSelect(runId, lootEntryId, members)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'setaccounting': {
      const members = await resolveDisplayNames(
        interaction.guild,
        partyService.getActiveMembers(runId)
      );
      if (!members.length) {
        return interaction.reply({ content: 'Nggak ada member lain buat ditunjuk jadi accounting.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: 'Pilih member yang mau jadi accounting:',
        components: [buildAccountingSelect(runId, members)],
        flags: MessageFlags.Ephemeral,
      });
    }

    case 'close': {
      salaryService.closePanel(runId);
      await interaction.reply({ content: '🔒 Panel salary ditutup.', flags: MessageFlags.Ephemeral });
      await refreshSalaryPanel(interaction.client, interaction.guild, runId);
      return;
    }
  }
}

// ============================================================
// SELECT MENUS
// ============================================================
async function handleSelect(interaction) {
  const [ns, action, runIdRaw] = interaction.customId.split(':');
  const runId = Number(runIdRaw);
  const run = partyService.getRun(runId);
  if (!run) return interaction.reply({ content: '⚠️ Run tidak ditemukan.', flags: MessageFlags.Ephemeral });

  if (ns === 'party') {
    switch (action) {
      case 'subrole': {
        const roleCode = interaction.customId.split(':')[3];
        const subrole = interaction.values[0];
        const result = partyService.joinRole(runId, interaction.user.id, roleCode, subrole);
        if (!result.ok) {
          const msg =
            result.reason === 'PARTY_FULL'
              ? `⚠️ Party udah penuh (${config.partyMemberCap} orang).`
              : `⚠️ Role ${roleCode} sudah penuh.`;
          return interaction.update({ content: msg, components: [] });
        }
        await interaction.update({ content: `✅ Kamu join sebagai **${roleCode}** (${subrole})!`, components: [] });
        await refreshPartyPanel(interaction.client, run);
        return;
      }
      case 'removeconfirm': {
        if (!isHost(run, interaction.user.id)) {
          return interaction.update({ content: '⛔ Hanya host yang bisa remove member.', components: [] });
        }
        const [userId, roleCode] = interaction.values[0].split(':');
        partyService.removeMember(runId, userId, roleCode);
        await interaction.update({ content: `✅ <@${userId}> di-remove dari role ${roleCode}.`, components: [] });
        await refreshPartyPanel(interaction.client, partyService.getRun(runId));
        return;
      }
    }
  }

  if (ns === 'salary') {
    if (!canManageSalary(run, interaction.user.id)) {
      return interaction.update({ content: '⛔ Hanya host atau accounting yang bisa mengelola salary.', components: [] });
    }

    switch (action) {
      case 'accountingmember': {
        const accountingUserId = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`salary:accountingmodal:${runId}:${accountingUserId}`)
          .setTitle('IGN Accounting')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('ign')
                .setLabel('IGN (nama di game)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      case 'stamploanmember': {
        const lenderId = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`salary:stamploanmodal:${runId}:${lenderId}`)
          .setTitle('Catat Sealstamp Loan')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('stamp_count')
                .setLabel('Jumlah stamp')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      case 'priceitem': {
        const lootEntryId = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`salary:pricemodal:${runId}:${lootEntryId}`)
          .setTitle('Set Harga Item')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('price')
                .setLabel('Harga jual (total gold)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      case 'removeitemselect': {
        if (salaryService.isMutationLocked(runId)) {
          return interaction.update({ content: '🔒 Sudah ada yang dibayar — tidak bisa hapus item lagi.', components: [] });
        }
        salaryService.removeLootEntry(Number(interaction.values[0]));
        await interaction.update({ content: '🗑️ Item dihapus.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        await globalBoardService.refreshGlobalBoard(interaction.client);
        return;
      }

      case 'excludetoggle': {
        if (salaryService.isMutationLocked(runId)) {
          return interaction.update({ content: '🔒 Sudah ada yang dibayar — tidak bisa ubah exclude lagi.', components: [] });
        }
        salaryService.toggleExclude(runId, interaction.values);
        await interaction.update({ content: '✅ Status exclude diperbarui.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        return;
      }

      case 'goldexcludeselect': {
        if (salaryService.isMutationLocked(runId)) {
          return interaction.update({ content: '🔒 Sudah ada yang dibayar — tidak bisa ubah exclude lagi.', components: [] });
        }
        const lootEntryId = Number(interaction.customId.split(':')[3]);
        const allMemberIds = partyService.getActiveMembers(runId).map((m) => m.user_id);
        salaryService.setLootExclusions(lootEntryId, allMemberIds, interaction.values);
        await interaction.update({ content: '✅ Dicatat, drop ini nggak dibagi ke yang dipilih.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        return;
      }

      case 'markpaid': {
        salaryService.markPaid(runId, interaction.values);
        await interaction.update({ content: '✅ Ditandai sudah dibayar.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        await notifyPaidMembers(interaction.client, runId, interaction.values);
        await leaderboardService.refreshLeaderboards(interaction.client, interaction.guildId);

        // Cek: kalau SEMUA member (yang gak di-exclude) udah lunas, tandain di thread.
        // Dropdown Mark Paid otomatis nggak nawarin pilihan lagi begitu unpaid udah 0
        // (lihat case 'markpaidselect'), jadi blok ini cuma bakal ke-trigger PERSIS
        // sekali, di detik member terakhir di-mark paid.
        const activeMembers = partyService.getActiveMembers(runId);
        const paymentMap = salaryService.getPaymentMap(runId);
        const stillUnpaid = activeMembers.filter(
          (m) => !m.is_excluded_from_salary && !paymentMap[m.user_id]?.is_paid
        );
        if (stillUnpaid.length === 0) {
          await interaction.channel.send('=====ALL DONE=====');
        }
        return;
      }
      case 'removestamploanselect': {
        if (salaryService.isMutationLocked(runId)) {
          return interaction.update({ content: '🔒 Sudah ada yang dibayar — tidak bisa hapus stamp loan lagi.', components: [] });
        }
        salaryService.removeStampLoan(Number(interaction.values[0]));
        await interaction.update({ content: '🗑️ Sealstamp loan dihapus.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        return;
      }

      case 'undomarkpaid': {
        salaryService.unmarkPaid(runId, interaction.values);
        await interaction.update({ content: '↩️ Status dibayar dibatalkan.', components: [] });
        await refreshSalaryPanel(interaction.client, interaction.guild, runId);
        await leaderboardService.refreshLeaderboards(interaction.client, interaction.guildId); // <-- tambah ini
        return;
      }
    }
  }
}

// ============================================================
// MODALS
// ============================================================
async function handleModal(interaction) {
  const parts = interaction.customId.split(':');
  const [ns, action, runIdRaw, extraRaw] = parts;
  const runId = Number(runIdRaw);
  const run = partyService.getRun(runId);
  if (!run) return interaction.reply({ content: '⚠️ Run tidak ditemukan.', flags: MessageFlags.Ephemeral });

  if (ns === 'party' && action === 'edittitlemodal') {
    if (!isHost(run, interaction.user.id)) {
      return interaction.reply({ content: '⛔ Hanya host yang bisa edit title.', flags: MessageFlags.Ephemeral });
    }
    const newTitle = interaction.fields.getTextInputValue('title');
    partyService.editTitle(runId, newTitle);
    await interaction.reply({ content: '✅ Title diubah.', flags: MessageFlags.Ephemeral });
    await refreshPartyPanel(interaction.client, partyService.getRun(runId));
    return;
  }

    if (action === 'accountingmodal') {
      if (!isHost(run, interaction.user.id)) {
        return interaction.reply({ content: '⛔ Hanya host yang bisa nunjuk accounting.', flags: MessageFlags.Ephemeral });
      }
      const accountingUserId = parts[3];
      const ign = interaction.fields.getTextInputValue('ign');
      salaryService.setAccounting(runId, accountingUserId, ign);

      // Balas DULUAN sebelum ngerename thread — rename bisa kena rate limit Discord
      // dan lambat, kalau ditaruh sebelum reply() bisa bikin token keburu expired (10062).
      await interaction.reply({
        content: `✅ <@${accountingUserId}> (${ign}) ditunjuk jadi accounting.`,
        flags: MessageFlags.Ephemeral,
      });
      await refreshSalaryPanel(interaction.client, interaction.guild, runId);

      // Ganti judul thread (best-effort, gagal juga gapapa — udah ke-catch)
      const salaryThread = salaryService.getSalaryThreadByRunId(runId);
      if (salaryThread?.thread_id) {
        try {
          const thread = await interaction.client.channels.fetch(salaryThread.thread_id);
          const paidPrefix = thread.name.startsWith('💰') ? '💰 ' : '';
          const newName = `${paidPrefix}${run.title} - ${ign}`.slice(0, 100);
          await thread.setName(newName);
        } catch (err) {
          console.warn('[accountingmodal] Gagal ubah nama thread:', err.message);
        }
      }
      return;
    }

    if (!canManageSalary(run, interaction.user.id)) {
      return interaction.reply({ content: '⛔ Hanya host atau accounting yang bisa mengelola salary.', flags: MessageFlags.Ephemeral });
    }

    const mutationModals = ['addgoldmodal', 'stamploanmodal', 'pricemodal'];
    if (mutationModals.includes(action) && salaryService.isMutationLocked(runId)) {
      return interaction.reply({
        content: '🔒 Sudah ada yang dibayar — item, gold, dan stamp tidak bisa diubah lagi.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'addgoldmodal') {
      const amount = Number(interaction.fields.getTextInputValue('amount'));
      if (!Number.isFinite(amount) || amount <= 0) {
        return interaction.reply({ content: '⚠️ Jumlah gold tidak valid.', flags: MessageFlags.Ephemeral });
      }
      const lootEntryId = salaryService.addGoldDrop(runId, amount, interaction.user.id);
      const excludeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`salary:goldexcludebtn:${runId}:${lootEntryId}`)
          .setLabel('Ada yang gak kebagian?')
          .setEmoji('🚫')
          .setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        content: `✅ Gold Drop (${formatGold(amount)}) ditambahkan — default dibagi rata ke semua.`,
        components: [excludeBtnRow],
        flags: MessageFlags.Ephemeral,
      });
      await refreshSalaryPanel(interaction.client, interaction.guild, runId);
      return;
    }

    if (action === 'stamploanmodal') {
      // customId: salary:stamploanmodal:<runId>:<lenderId>
      const lenderId = parts[3];
      const stampCount = Number(interaction.fields.getTextInputValue('stamp_count'));
      if (!lenderId || !Number.isFinite(stampCount) || stampCount <= 0) {
        return interaction.reply({ content: '⚠️ Input tidak valid.', flags: MessageFlags.Ephemeral });
      }
      salaryService.addStampLoan(runId, lenderId, stampCount);
      await interaction.reply({
        content: `✅ Dicatat: <@${lenderId}> minjemin ${stampCount} stamp (${formatGold(stampCount * config.stampUnitPrice)}).`,
        flags: MessageFlags.Ephemeral,
      });
      await refreshSalaryPanel(interaction.client, interaction.guild, runId);
      return;
    }

    if (action === 'pricemodal') {
      const lootEntryId = Number(extraRaw);
      const price = Number(interaction.fields.getTextInputValue('price'));
      if (!Number.isFinite(price) || price < 0) {
        return interaction.reply({ content: '⚠️ Harga tidak valid.', flags: MessageFlags.Ephemeral });
      }
      salaryService.setItemPrice(lootEntryId, price);
      await interaction.reply({ content: `✅ Harga disimpan: ${formatGold(price)}.`, flags: MessageFlags.Ephemeral });
      await refreshSalaryPanel(interaction.client, interaction.guild, runId);
      await globalBoardService.refreshGlobalBoard(interaction.client);
      return;
    }
  
}

// ============================================================
// FINALISASI PARTY -> BIKIN SALARY THREAD
// ============================================================
async function finalizeParty(interaction, run) {
  partyService.setStatus(run.id, 'done');

  const settings = guildSettingsService.getSettings(run.guild_id);
  const salaryChannelId = settings.salary_channel_id || config.salaryChannelId;
  if (!salaryChannelId) {
    await interaction.editReply({
      content: '⚠️ Channel salary belum diatur buat server ini. Minta admin server jalanin `/setup bot` dan isi `salary_channel`.',
    });
    partyService.setStatus(run.id, 'locked'); // batalin "done", biar host bisa coba lagi setelah diatur
    return;
  }

  const salaryChannel = await interaction.client.channels.fetch(salaryChannelId);
  const threadType = settings.thread_visibility === 'public' ? ChannelType.PublicThread : ChannelType.PrivateThread;
  const thread = await salaryChannel.threads.create({
    name: run.title,
    type: threadType,
    autoArchiveDuration: 10080, // 7 hari
    reason: `Salary thread untuk party run #${run.id}`,
  });

  salaryService.createSalaryThread(run.id, thread.id);

  const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(run.id));
  const { embed, components } = salaryService.computeSalaryView(partyService.getRun(run.id), members);
  const panelMessage = await thread.send({ embeds: [embed], components });
  salaryService.setPanelMessageId(run.id, panelMessage.id);

  // Ping beneran ke semua member party (mention di embed TIDAK memicu notifikasi,
  // jadi kirim pesan terpisah dengan mention di content biar semua kebagian notif).
  if (members.length) {
    const mentions = members.map((m) => `<@${m.user_id}>`).join(' ');
    await thread.send({
      content: `📢 ${mentions} — party udah selesai, cek pembagian gaji di atas ya!`,
      allowedMentions: { parse: ['users'] },
    });
  }

  // Tag khusus member yang belum pernah ikut party sebelumnya (belum punya IGN tersimpan).
  // Kalau gak ada first-timer, gak ada pesan tambahan sama sekali.
  const firstTimerIds = ignService.findFirstTimers(
    run.guild_id,
    run.id,
    members.map((m) => m.user_id)
  );
  if (firstTimerIds.length) {
    ignService.markPendingCapture(thread.id, run.guild_id, firstTimerIds);
    const mentions = firstTimerIds.map((id) => `<@${id}>`).join(' ');
    await thread.send({
      content: `DROP IGN ${mentions} — balas pesan ini dengan IGN`,
      allowedMentions: { users: firstTimerIds },
    });
  }

  // Hapus pesan panel party yang asli
  try {
    const partyChannel = await interaction.client.channels.fetch(run.channel_id);
    const partyMessage = await partyChannel.messages.fetch(run.panel_message_id);
    await partyMessage.delete();
  } catch (err) {
    console.warn('[finalizeParty] Gagal hapus pesan party lama:', err.message);
  }

  // Party udah "Done" -> bersih-bersih diem-diem, GAK ping ulang server lain
  await partyBoardService.cleanupPartyBoard(interaction.client);

  const { t } = require('../i18n');
  await interaction.editReply({ content: t(settings.language, 'partyDone', thread) });
}