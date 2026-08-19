/**
 * Tambahin field displayName ke tiap baris member (dipakai buat label select menu).
 * Gagal fetch satu user tidak menggagalkan yang lain — fallback ke user_id.
 */
async function resolveDisplayNames(guild, members) {
  const result = [];
  for (const m of members) {
    let displayName = m.user_id;
    try {
      const gm = await guild.members.fetch(m.user_id);
      displayName = gm.displayName;
    } catch (err) {
      // member mungkin sudah keluar server — biarkan fallback ke user_id
    }
    result.push({ ...m, displayName });
  }
  return result;
}

module.exports = { resolveDisplayNames };
