const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const config = require('./config');
const interactionCreate = require('./handlers/interactionCreate');
const messageCreate = require('./handlers/messageCreate');
const guildSettingsService = require('./services/guildSettingsService');

// Pastikan database & skema kebentuk sebelum command diakses
require('./database/db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // WAJIB juga diaktifin di Developer Portal > Bot > Privileged Gateway Intents
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
const commandFiles = ['party.js', 'itemAdd.js', 'lootAdd.js', 'approve.js', 'setup.js', 'onlyowner.js'];
for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`[bot] Login sebagai ${client.user.tag}`);
});

client.on('interactionCreate', interactionCreate);
client.on('messageCreate', messageCreate);

// Bot private — kalau di-invite ke server yang belum di-approve, kasih tau lewat system channel.
client.on('guildCreate', async (guild) => {
  if (guildSettingsService.isApproved(guild.id)) return;
  try {
    const channel =
      guild.systemChannel ||
      guild.channels.cache.find(
        (c) => c.isTextBased?.() && c.permissionsFor(guild.members.me)?.has('SendMessages')
      );
    if (channel) {
      await channel.send(
        '👋 Makasih udah invite!, Minta owner bot approve di server ini ya. biar bot bisa dipake'
      );
    }
  } catch (err) {
    console.warn('[guildCreate] Gagal kirim pesan unapproved:', err.message);
  }
});

client.login(config.token);
