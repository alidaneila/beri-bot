const ignService = require('../services/ignService');
const guildSettingsService = require('../services/guildSettingsService');

/**
 * Nangkep balesan IGN dari member yang lagi "ditunggu" (ditag first-timer di finalizeParty).
 * Kalau guild_settings.autonick nyala, nickname-nya diubah jadi "nama | IGN".
 */
module.exports = async function handleMessageCreate(message) {
  if (message.author.bot) return;
  if (!message.guildId) return;
  if (!message.channel.isThread()) return;

  const pending = ignService.getPendingCapture(message.channel.id, message.author.id);
  if (!pending) return;

  const ign = message.content.trim();
  if (!ign) return;

  ignService.saveIgn(message.guildId, message.author.id, ign);
  ignService.clearPendingCapture(message.channel.id, message.author.id);

  try {
    await message.react('✅');
  } catch (err) {
    console.warn('[messageCreate] Gagal react konfirmasi IGN:', err.message);
  }

  const settings = guildSettingsService.getSettings(message.guildId);
  if (settings.autonick) {
    try {
      const member = message.member || (await message.guild.members.fetch(message.author.id));
      const baseName = member.nickname || member.user.globalName || member.user.username;
      const cleanBase = baseName.split(' | ')[0]; // biar gak numpuk kalau ganti IGN berkali-kali
      const newNick = `${cleanBase} | ${ign}`.slice(0, 32); // batas nickname Discord = 32 char
      await member.setNickname(newNick);
    } catch (err) {
      // Biasanya gagal karena role bot di bawah role member itu, atau member = owner server.
      console.warn('[messageCreate] Gagal auto-nick:', err.message);
    }
  }
};