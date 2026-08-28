require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.warn(`[config] Peringatan: env var ${name} belum diisi.`);
  }
  return value;
}

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),

  // Satu-satunya user yang boleh /approve server baru (bot ini private, approved-only).
  ownerUserId: required('OWNER_USER_ID'),
  // Foto buat footer embed party & salary, 
  ownerAvatarUrl: process.env.OWNER_AVATAR_URL || null,

  // LEGACY / FALLBACK — dulu dipakai buat single-server, sekarang tiap server ATUR SENDIRI
  // lewat /setting server (disimpan di tabel guild_settings). Env ini cuma dipakai kalau
  // GUILD_ID diisi -> deploy-commands.js akan daftar command instan ke 1 guild itu (mode dev),
  // dan SALARY_CHANNEL_ID jadi fallback kalau ada server yang belum sempat /setting server.
  guildId: process.env.GUILD_ID || null,
  salaryChannelId: process.env.SALARY_CHANNEL_ID || null,
  itemAdminUserId: process.env.ITEM_ADMIN_USER_ID || null, // Discord User ID yang boleh /setting item

  dbPath: process.env.DB_PATH || './data/bot.sqlite',

  // Aturan bisnis yang bisa diubah tanpa nyentuh logika
  stampUnitPrice: 5,       // harga 1 sealstamp dalam gold
  transferFeeRate: 0.003,  // fee transfer 0.3%

  // Cap TOTAL member party — begitu member aktif nyampe segini, party dianggap penuh
  // walau ada role yang belum keisi semua.
  partyMemberCap: 8,

  // Definisi role party + kapasitas MAKSIMAL per role (bukan berarti harus keisi semua).
  // Total kapasitas role boleh lebih dari partyMemberCap (fleksibel) — yang jadi batas
  // keras cuma partyMemberCap di atas.
  // `emoji` cuma dipakai buat tombol, embed party sengaja polos tanpa emoji.
  roleRequirements: [
    { code: 'FU', label: 'FU', emoji: '<:fu:1542743427630760066>', slots: 2 },
    { code: 'HEALER', label: 'HEALER', emoji: '<:healer:1542751888850681876>', slots: 3, subroles: ['Priest', 'Physician', 'Light Fury'] },
    { code: 'MC', label: 'MC', emoji: '<:mc:1542741911612293160>', slots: 1 },
    { code: 'SM', label: 'SM', emoji: '<:sm:1542742065455173682>', slots: 1 },
    { code: 'MT', label: 'MT', emoji: '<:mt:1542740966308454400>', slots: 2, subroles: ['Paladin', 'Destroyer'] },
    { code: 'ICE_STACKING', label: 'ICE STACKING', emoji: '<:ice_stacking:1542741083103174708>', slots: 1, subroles: ['Adept', 'Elestra'] },
    { code: 'ARCHER', label: 'ARCHER', emoji: '<:archer:1542741755554959370>', slots: 2 },
    {
      code: 'DPS',
      label: 'DPS',
      emoji: '<:dps:1542743252325634129>',
      slots: 3,
      subroles: ['Assassin', 'Artillery', 'Crusader', 'Dancer', 'Dark Avenger', 'Gear Master', 'Inquisitor', 'Sniper', 'Saleana', 'Shooting Star', 'Screamer'],
    },
  ],
};
