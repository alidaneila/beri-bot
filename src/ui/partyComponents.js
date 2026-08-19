const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../config');

const isLocked = (run) => run.status !== 'open';

function buildPartyRows(run, requirements = [], members = []) {
  if (run.status === 'cancelled') {
    return [];
  }

  const roleButtons = config.roleRequirements.map((r) => {
    const req = requirements.find((x) => x.role_code === r.code);
    const roleCount = members.filter((m) => m.role_code === r.code).length;
    const roleFull = req ? roleCount >= req.slots : false;

    return new ButtonBuilder()
      .setCustomId(`party:role:${run.id}:${r.code}`)
      .setLabel(r.label)
      .setEmoji(r.emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isLocked(run) || roleFull);
  });

  // Discord max 5 tombol per row
  const roleRow1 = new ActionRowBuilder().addComponents(roleButtons.slice(0, 4));
  const roleRow2 = new ActionRowBuilder().addComponents(roleButtons.slice(4, 8));

  const memberRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`party:cancelrole:${run.id}`)
      .setLabel('Cancel My Role')
      .setStyle(ButtonStyle.Secondary)
  );

  const hostRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`party:lock:${run.id}`)
      .setLabel(isLocked(run) ? 'Unlock Party' : 'Lock Party')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(run.status === 'done' || run.status === 'cancelled'),
    new ButtonBuilder()
      .setCustomId(`party:removeselect:${run.id}`)
      .setLabel('Remove Member')
      .setEmoji('⛔')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(run.status === 'done' || run.status === 'cancelled'),
    new ButtonBuilder()
      .setCustomId(`party:done:${run.id}`)
      .setLabel('Done')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(run.status === 'done' || run.status === 'cancelled'),
    new ButtonBuilder()
      .setCustomId(`party:cancelrun:${run.id}`)
      .setLabel('Cancel Run')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(run.status === 'done' || run.status === 'cancelled')
  );

  const hostRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`party:edittitle:${run.id}`)
      .setLabel('Edit Title')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(run.status === 'done' || run.status === 'cancelled'),
    new ButtonBuilder()
      .setCustomId(`party:notify:${run.id}`)
      .setLabel('Notify Again')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(run.status === 'done' || run.status === 'cancelled')
  );

  return [roleRow1, roleRow2, memberRow, hostRow1, hostRow2];
}

function buildSubroleSelect(runId, roleCode, options) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`party:subrole:${runId}:${roleCode}`)
      .setPlaceholder(`Pilih subrole untuk ${roleCode}`)
      .addOptions(options.map((o) => ({ label: o, value: o })))
  );
}

function buildMemberSelect(customIdPrefix, runId, members, placeholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${customIdPrefix}:${runId}`)
      .setPlaceholder(placeholder)
      .addOptions(
        members.slice(0, 25).map((m) => ({
          label: `${m.displayName || m.user_id} — ${m.role_code}${m.subrole ? ` (${m.subrole})` : ''}`,
          value: `${m.user_id}:${m.role_code}`,
        }))
      )
  );
}

module.exports = { buildPartyRows, buildSubroleSelect, buildMemberSelect };
