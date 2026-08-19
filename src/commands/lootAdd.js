const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const partyService = require('../services/partyService');
const salaryService = require('../services/salaryService');
const globalBoardService = require('../services/globalBoardService');
const { resolveDisplayNames } = require('../utils/members');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item-button')
    .setDescription('Tambah item loot ke salary panel (jalankan di dalam thread salary)')
    .addStringOption((opt) =>
      opt
        .setName('item')
        .setDescription('Cari nama item')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('qty').setDescription('Jumlah').setRequired(false).setMinValue(1)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const query = `%${focused}%`;
    // Sengaja TIDAK difilter raid_type run ini — satu thread salary (mis. marathon)
    // bisa nampung loot dari macam-macam raid, jadi pencarian harus lintas seluruh catalog.
    const rows = db
      .prepare(
        `SELECT id, item_name, stamp_cost FROM item_catalog
         WHERE is_active = 1 AND item_name LIKE ?
         ORDER BY item_name LIMIT 25`
      )
      .all(query);

    await interaction.respond(
      rows.map((r) => ({
        name: `${r.item_name} (${r.stamp_cost} stamp)`.slice(0, 100),
        value: String(r.id),
      }))
    );
  },

  async execute(interaction) {
    const runRow = db
      .prepare(`SELECT run_id FROM salary_thread WHERE thread_id = ?`)
      .get(interaction.channelId);

    if (!runRow) {
      await interaction.reply({
        content: '⛔ Command ini cuma bisa dipakai di dalam thread salary.',
        ephemeral: true,
      });
      return;
    }

    const run = partyService.getRun(runRow.run_id);
    const salaryThread = salaryService.getSalaryThreadByRunId(runRow.run_id);
    if (!salaryService.isAuthorized(run, salaryThread, interaction.user.id)) {
      await interaction.reply({
        content: '⛔ Hanya host atau accounting yang bisa nambah loot.',
        ephemeral: true,
      });
      return;
    }

    if (salaryService.isMutationLocked(runRow.run_id)) {
      await interaction.reply({
        content: '🔒 Sudah ada yang dibayar / panel ditutup — tidak bisa nambah item lagi.',
        ephemeral: true,
      });
      return;
    }

    const itemId = Number(interaction.options.getString('item'));
    const qty = interaction.options.getInteger('qty') || 1;

    salaryService.addLootFromCatalog(runRow.run_id, itemId, qty, interaction.user.id);

    await interaction.reply({
      content: `✅ Ditambahin ke daftar loot — menunggu harga.`,
      ephemeral: true,
    });

    const members = await resolveDisplayNames(interaction.guild, partyService.getActiveMembers(run.id));
    await salaryService.rebuildSalaryPanel(interaction.client, run, members);
    await globalBoardService.refreshGlobalBoard(interaction.client);
  },
};
