const { SlashCommandBuilder } = require('discord.js');
const partyService = require('../services/partyService');
const { buildPartyEmbed } = require('../ui/partyEmbed');
const { buildPartyRows } = require('../ui/partyComponents');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createparty')
    .setDescription('Buat panel party baru')
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Judul party (contoh: GDN HC)').setRequired(true)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title');

    const run = partyService.createRun({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      title,
    });

    const requirements = partyService.getRequirements(run.id);
    const members = partyService.getActiveMembers(run.id);
    const embed = buildPartyEmbed(run, requirements, members);
    const components = buildPartyRows(run, requirements, members);

    // Acknowledge interaction-nya secara private dulu (wajib, biar gak "This interaction failed")
    await interaction.reply({ content: '✅ Party berhasil dibuat.', ephemeral: true });

    // Kirim panel + ping @here sebagai PESAN BIASA (bukan interaction reply),
    // biar gak ada label "... used /createparty" di atasnya.
    const message = await interaction.channel.send({
      content: `@here ${title}`,
      embeds: [embed],
      components,
      allowedMentions: { parse: ['everyone'] },
    });
    partyService.setPanelMessageId(run.id, message.id);
  },
};
