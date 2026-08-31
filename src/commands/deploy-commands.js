const { REST, Routes } = require('discord.js');
const config = require('../config');
const party = require('./party');
const itemAdd = require('./itemAdd');
const lootAdd = require('./lootAdd');
const approve = require('./approve');
const setup = require('./setup');
const adminCleanupParty = require('./adminCleanupParty');

const commands = [
  party.data.toJSON(),
  itemAdd.data.toJSON(),
  lootAdd.data.toJSON(),
  approve.data.toJSON(),
  setup.data.toJSON(),
  adminCleanupParty.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    if (config.guildId) {
      console.log(
        `Mendaftarkan ${commands.length} slash command ke guild ${config.guildId} (mode dev, instan)...`
      );
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );
    } else {
      console.log(
        `Mendaftarkan ${commands.length} slash command secara GLOBAL (bisa sampai 1 jam buat propagasi)...`
      );
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
    }
    console.log('Selesai.');
  } catch (err) {
    console.error(err);
  }
})();