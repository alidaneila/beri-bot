const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

function buildSalaryRows(runId, { mutationLocked = false, finalized = false } = {}) {
  // if (finalized) return []; // Close Panel = ilangin semua tombol, bukan cuma dinonaktifin

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`salary:priceselect:${runId}`)
      .setLabel('Set Harga Item')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(mutationLocked),
    new ButtonBuilder()
      .setCustomId(`salary:addgold:${runId}`)
      .setLabel('Add Gold Drop')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(mutationLocked),
    new ButtonBuilder()
      .setCustomId(`salary:stamploan:${runId}`)
      .setLabel('Catat Sealstamp Loan')
      .setEmoji('🧾')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(mutationLocked),
    new ButtonBuilder()
      .setCustomId(`salary:removestamploan:${runId}`)
      .setLabel('Remove Stamp Loan')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(mutationLocked)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`salary:removeitem:${runId}`)
      .setLabel('Remove Item')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(mutationLocked),
    new ButtonBuilder()
      .setCustomId(`salary:excludeselect:${runId}`)
      .setLabel('keluarin dari Gaji')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(mutationLocked),
    new ButtonBuilder()
      .setCustomId(`salary:markpaidselect:${runId}`)
      .setLabel('Mark Paid')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(finalized),
    new ButtonBuilder()
      .setCustomId(`salary:undomarkpaidselect:${runId}`)
      .setLabel('Undo Mark Paid')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(finalized)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`salary:setaccounting:${runId}`)
      .setLabel('Set Accounting')
      .setEmoji('🧮')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(finalized),
    // new ButtonBuilder()
    //   .setCustomId(`salary:close:${runId}`)
    //   .setLabel('Close Panel')
    //   .setEmoji('🔒')
    //   .setStyle(ButtonStyle.Danger)
    //   .setDisabled(finalized)
  );

  return [row1, row2, row3];
}

function buildPendingItemSelect(runId, pendingEntries) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:priceitem:${runId}`)
      .setPlaceholder('Pilih item yang mau diisi harganya')
      .addOptions(
        pendingEntries.slice(0, 25).map((e) => ({
          label: `${e.qty > 1 ? `${e.qty}x ` : ''}${e.label}`.slice(0, 100),
          value: String(e.id),
        }))
      )
  );
}

function buildRemoveItemSelect(runId, entries) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:removeitemselect:${runId}`)
      .setPlaceholder('Pilih item yang mau dihapus')
      .addOptions(
        entries.slice(0, 25).map((e) => ({
          label: `${e.qty > 1 ? `${e.qty}x ` : ''}${e.label}`.slice(0, 100),
          value: String(e.id),
        }))
      )
  );
}

function buildExcludeSelect(runId, members) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:excludetoggle:${runId}`)
      .setPlaceholder('Pilih member (toggle ikut/tidak ikut gaji)')
      .setMinValues(1)
      .setMaxValues(Math.min(members.length, 25))
      .addOptions(
        members.slice(0, 25).map((m) => ({
          label: `${m.displayName || m.user_id}${m.is_excluded_from_salary ? ' (saat ini: excluded)' : ''}`,
          value: m.user_id,
        }))
      )
  );
}

function buildMarkPaidSelect(runId, unpaidMembers) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:markpaid:${runId}`)
      .setPlaceholder('Pilih member yang sudah dibayar')
      .setMinValues(1)
      .setMaxValues(Math.min(unpaidMembers.length, 25))
      .addOptions(
        unpaidMembers.slice(0, 25).map((m) => ({
          label: m.displayName || m.user_id,
          value: m.user_id,
        }))
      )
  );
}

function buildLenderSelect(runId, members) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:stamploanmember:${runId}`)
      .setPlaceholder('Siapa yang minjemin stamp?')
      .addOptions(
        members.slice(0, 25).map((m) => ({
          label: m.displayName || m.user_id,
          value: m.user_id,
        }))
      )
  );
}

function buildRemoveStampLoanSelect(runId, loans) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:removestamploanselect:${runId}`)
      .setPlaceholder('Pilih loan yang mau dihapus')
      .addOptions(
        loans.slice(0, 25).map((l) => ({
          label: `${l.displayName || l.lender_id} — ${l.stamp_count} stamp`.slice(0, 100),
          value: String(l.id),
        }))
      )
  );
}

function buildUndoMarkPaidSelect(runId, paidMembers) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:undomarkpaid:${runId}`)
      .setPlaceholder('Pilih member yang mau di-undo (batal ditandai dibayar)')
      .setMinValues(1)
      .setMaxValues(Math.min(paidMembers.length, 25))
      .addOptions(
        paidMembers.slice(0, 25).map((m) => ({
          label: m.displayName || m.user_id,
          value: m.user_id,
        }))
      )
  );
}

function buildGoldExcludeSelect(runId, lootEntryId, members) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:goldexcludeselect:${runId}:${lootEntryId}`)
      .setPlaceholder('Pilih yang TIDAK dapat share drop ini')
      .setMinValues(1)
      .setMaxValues(Math.min(members.length, 25))
      .addOptions(
        members.slice(0, 25).map((m) => ({
          label: m.displayName || m.user_id,
          value: m.user_id,
        }))
      )
  );
}

function buildAccountingSelect(runId, members) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`salary:accountingmember:${runId}`)
      .setPlaceholder('Pilih member buat jadi accounting')
      .addOptions(
        members.slice(0, 25).map((m) => ({
          label: m.displayName || m.user_id,
          value: m.user_id,
        }))
      )
  );
}

module.exports = {
  buildSalaryRows,
  buildPendingItemSelect,
  buildRemoveItemSelect,
  buildExcludeSelect,
  buildMarkPaidSelect,
  buildLenderSelect,
  buildRemoveStampLoanSelect,
  buildUndoMarkPaidSelect,
  buildGoldExcludeSelect,
  buildAccountingSelect,
};
