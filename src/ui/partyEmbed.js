const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const STATUS_COLOR = {
  open: 0x2ecc71,
  locked: 0xf1c40f,
  done: 0x3498db,
  cancelled: 0xe74c3c,
};

const STATUS_LABEL = {
  open: '🟢 Open',
  locked: '🔒 Locked',
  done: '✅ Done',
  cancelled: '🚫 Cancelled',
};

/**
 * @param {object} run - baris party_run
 * @param {object[]} requirements - baris role_requirement untuk run ini
 * @param {object[]} members - baris party_member (yang is_removed=0) untuk run ini
 */
function buildPartyEmbed(run, requirements, members) {
  const embed = new EmbedBuilder()
    .setTitle(run.title)
    .setColor(STATUS_COLOR[run.status] || 0x95a5a6)
    .setTimestamp(new Date(run.created_at));

  if (run.status === 'cancelled') {
    embed.setDescription('🚫 Party run ini sudah dibatalkan.');
    return embed;
  }

  embed.setFooter({
    text: 'role di bawah untuk join',
    iconURL: config.ownerAvatarUrl || undefined,
  });

  const lines = [];
  for (const req of requirements) {
    const cfg = config.roleRequirements.find((r) => r.code === req.role_code);
    const label = cfg ? cfg.label : req.role_code;
    const roleMembers = members.filter((m) => m.role_code === req.role_code);

    const slots = [];
    for (let i = 0; i < req.slots; i++) {
      const m = roleMembers[i];
      slots.push(m ? `<@${m.user_id}>${m.subrole ? ` (${m.subrole})` : ''}` : '*empty*');
    }
    lines.push(`**${label}** — ${slots.join(', ')}`);
  }
  embed.addFields({ name: 'Roles', value: lines.join('\n') });

  const filledSlots = members.length;
  embed.addFields(
    { name: 'Host', value: `<@${run.host_id}>`, inline: true },
    { name: 'Slot', value: `${filledSlots}/${config.partyMemberCap}`, inline: true },
    { name: 'Status', value: STATUS_LABEL[run.status] || run.status, inline: true }
  );

  return embed;
}

/**
 * Format ringkasan buat "Notify Again": @here (GDN HC · 7/8 · -FU)
 * "-ROLE" di sini nunjukin role yang KAPASITASNYA belum penuh (bukan berarti wajib keisi).
 */
function buildNotifySummary(run, requirements, members) {
  const filledSlots = members.length;
  const missingRoles = [];

  for (const req of requirements) {
    const roleMembers = members.filter((m) => m.role_code === req.role_code);
    if (roleMembers.length < req.slots) {
      missingRoles.push(req.role_code);
    }
  }

  const missingText = missingRoles.length ? `-${missingRoles.join(', -')}` : 'FULL';
  return `**${run.title}** ${filledSlots}/${config.partyMemberCap} · ${missingText} @here`;
}

module.exports = { buildPartyEmbed, buildNotifySummary };