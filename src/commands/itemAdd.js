const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setting')
    .setDescription('Pengaturan item')
    .addSubcommand((sub) =>
      sub
        .setName('item')
        .setDescription('(Owner only) Tambah item baru ke database')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Kategori item')
            .setRequired(true)
            .addChoices(
              { name: 'Accessory', value: 'Accessory' },
              { name: 'Armor', value: 'Armor' },
              { name: 'Weapon', value: 'Weapon' },
              { name: 'Material', value: 'Material' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('language')
            .setDescription('Bahasa bot buat server ini')
            .setRequired(false)
            .addChoices({ name: 'Indonesia', value: 'id' }, { name: 'English', value: 'en' })
        )
        .addStringOption((opt) =>
          opt
            .setName('item_name')
            .setDescription('Nama lengkap item')
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('stamp_cost')
            .setDescription('Jumlah sealstamp yang dibutuhkan (0 kalau tidak ada)')
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption((opt) =>
          opt
            .setName('class')
            .setDescription(
              'Class (khusus category Armor: Warrior/Cleric/Arcer/Sorceress/Academic/Kali)'
            )
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'item') {
      const isOwner = interaction.user.id === config.ownerUserId;
      const isItemAdmin =
        config.itemAdminUserId &&
        interaction.user.id === config.itemAdminUserId;

      if (!isOwner && !isItemAdmin) {
        await interaction.reply({
          content: '⛔ Kamu tidak punya izin untuk menambah item ke catalog.',
          ephemeral: true,
        });
        return;
      }

      const category = interaction.options.getString('category');
      const itemName = interaction.options.getString('item_name');
      const stampCost = interaction.options.getInteger('stamp_cost');
      const klass = interaction.options.getString('class') || null;

      db.prepare(
        `INSERT INTO item_catalog (category, class, item_name, stamp_cost)
         VALUES (?, ?, ?, ?)`
      ).run(category, klass, itemName, stampCost);

      await interaction.reply({
        content: `✅ Item ditambahkan: **${itemName}** (${category}${klass ? ` · ${klass}` : ''} · ${stampCost} stamp)`,
        ephemeral: true,
      });

      return;
    }
  },
};