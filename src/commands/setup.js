const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const guildSettingsService = require('../services/guildSettingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup bot')
    .addSubcommand((sub) =>
      sub
        .setName('bot')
        .setDescription(
          'Atur salary channel, visibility thread, unsold board, dan auto-nick untuk server ini'
        )
        .addStringOption((opt) =>
          opt
            .setName('language')
            .setDescription('Bahasa bot buat server ini')
            .setRequired(false)
            .addChoices({ name: 'Indonesia', value: 'id' }, { name: 'English', value: 'en' })
        )
        .addChannelOption((opt) =>
          opt
            .setName('salary_channel')
            .setDescription('Channel tempat thread salary otomatis dibuat')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('thread_visibility')
            .setDescription('Thread salary private (default) atau public')
            .setRequired(false)
            .addChoices(
              { name: 'Private', value: 'private' },
              { name: 'Public', value: 'public' }
            )
        )
        .addChannelOption((opt) =>
          opt
            .setName('unsold_board_channel')
            .setDescription(
              'Channel buat board item belum laku lintas-server (opsional)'
            )
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('disable_board')
            .setDescription('Matiin unsold board buat server ini')
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('party_channel')
            .setDescription('Channel nampilin party yang butuh member lintas-server (opsional)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('autonick')
            .setDescription(
              'Otomatis ubah nickname jadi "nama | IGN" begitu member ngasih IGN'
            )
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'bot') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: '⛔ Cuma admin server yang bisa atur ini.',
          ephemeral: true,
        });
        return;
      }

      const patch = {};

      const salaryChannel =
        interaction.options.getChannel('salary_channel');

      if (salaryChannel) {
        patch.salary_channel_id = salaryChannel.id;
      }

      const visibility =
        interaction.options.getString('thread_visibility');

      if (visibility) {
        patch.thread_visibility = visibility;
      }

      const boardChannel =
        interaction.options.getChannel('unsold_board_channel');

      if (boardChannel) {
        patch.unsold_board_channel_id = boardChannel.id;
        patch.unsold_board_message_id = null;
        // channel ganti -> pesan lama gak relevan lagi
      }

      const disableBoard =
        interaction.options.getBoolean('disable_board');

      if (disableBoard) {
        patch.unsold_board_channel_id = null;
        patch.unsold_board_message_id = null;
      }

      const autonick =
        interaction.options.getBoolean('autonick');

      if (autonick !== null) {
        patch.autonick = autonick ? 1 : 0;
      }

      const language = interaction.options.getString('language');
      if (language) patch.language = language;

      const updated =
        guildSettingsService.updateSettings(
          interaction.guildId,
          patch
        );

      const lines = [
        `📍 Salary channel: ${
          updated.salary_channel_id
            ? `<#${updated.salary_channel_id}>`
            : '*(belum diatur)*'
        }`,
        `👁️ Thread visibility: **${updated.thread_visibility}**`,
        `📦 Unsold board: ${
          updated.unsold_board_channel_id
            ? `<#${updated.unsold_board_channel_id}>`
            : '*(nonaktif)*'
        }`,
        `🏷️ Auto-nick: **${updated.autonick ? 'ON' : 'OFF'}**`,
        `🌐 Language: **${updated.language}**`,
      ];

      await interaction.reply({
        content: `✅ Pengaturan bot diperbarui:\n${lines.join('\n')}`,
        ephemeral: true,
      });

      const partyBoardChannel = interaction.options.getChannel('party_channel');
      if (partyBoardChannel) patch.party_channel_id = partyBoardChannel.id;

      return;
    }
  },
};