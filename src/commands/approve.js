const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const guildSettingsService = require('../services/guildSettingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('(Owner only) untun Aktifin bot ini'),

  async execute(interaction) {
    if (!config.ownerUserId || interaction.user.id !== config.ownerUserId) {
      await interaction.reply({ content: '⛔ Cuma owner bot yang bisa approve server.', flags: MessageFlags.Ephemeral });
      return;
    }

    guildSettingsService.approveGuild(interaction.guildId, interaction.guild?.name || null, interaction.user.id);

    await interaction.reply({
      content: `✅ Server **${interaction.guild?.name || interaction.guildId}** sudah diaktifin.admin server bisa jalanin \`/setup bot\` buat atur.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};