const { EmbedBuilder } = require('discord.js');
const { formatGold } = require('../utils/formatGold');
const config = require('../config');

/**
 * @param {object} run - party_run
 * @param {object} accounting - { id: string|null, ign: string|null }
 * @param {object[]} members - party_member aktif (is_removed=0)
 * @param {object[]} lootEntries - loot_entry TIPE ITEM saja (status sold/pending, item_id != null), termasuk stamp_cost
 * @param {object[]} goldDrops - loot_entry TIPE GOLD DROP, sudah diolah: {id, amount, eligibleCount, excludedIds, sharePerPerson}
 * @param {object[]} stampLoans - sealstamp_loan untuk run ini
 * @param {ReturnType<import('../services/calculate').calculateSalary>} calcResult
 * @param {boolean} mutationLocked
 */
function buildSalaryEmbed({ run, accounting, members, lootEntries, goldDrops, stampLoans, calcResult, mutationLocked }) {
  const embed = new EmbedBuilder()
    .setTitle(`💰 Salary — ${run.title}`)
    .setColor(calcResult.isFinal ? 0x2ecc71 : 0xf1c40f)
    .setTimestamp();

  // --- Host & Accounting (dua-duanya boleh pegang tombol host-only) ---
  const hostLines = [`👑 Host: <@${run.host_id}>`];
  if (accounting && accounting.id) {
    hostLines.push(`🧮 Accounting: <@${accounting.id}>${accounting.ign ? ` (${accounting.ign})` : ''}`);
  } else {
    hostLines.push('🧮 Accounting: *belum ditunjuk*');
  }
  embed.addFields({ name: '\u200b', value: hostLines.join('\n') });

  // --- Sealstamp Loan ---
  if (stampLoans.length) {
    const lines = stampLoans.map(
      (l) => `• <@${l.lenderId}> — ${l.stampCount} stamp (${formatGold(l.stampCount * l.stampUnitPrice)})`
    );
    embed.addFields({ name: '🧾 Sealstamp Loan', value: lines.join('\n') });
  } else {
    embed.addFields({ name: '🧾 Sealstamp Loan', value: '*Belum ada pinjaman stamp*' });
  }

  // --- Item: dipisah Sudah Laku vs Belum Laku (gold drop TIDAK di sini, lihat section terpisah) ---
  const sold = lootEntries.filter((e) => e.status === 'sold');
  const pending = lootEntries.filter((e) => e.status === 'pending');

  const stampNote = (e) => (e.stamp_cost > 0 ? ` (x${e.stamp_cost} ss)` : '');
  const soldLines = sold.length
    ? sold
        .map((e) => `· ${e.qty > 1 ? `${e.qty}x ` : ''}${e.label}${stampNote(e)} — **${formatGold(e.sold_price)}**`)
        .join('\n')
    : '*(kosong)*';
  const pendingLines = pending.length
    ? pending.map((e) => `· ${e.qty > 1 ? `${e.qty}x ` : ''}${e.label}${stampNote(e)}`).join('\n')
    : '*(kosong)*';

  embed.addFields(
    { name: '✅ Sudah Laku', value: soldLines },
    { name: '⏳ Belum Laku', value: pendingLines }
  );

  // --- Gold Drops (section terpisah, cuma muncul kalau ada) ---
  if (goldDrops.length) {
    const lines = goldDrops.map((g) => {
      const excludedText = g.excludedIds.length
        ? `, ${g.excludedIds.map((id) => `<@${id}>`).join(', ')} tidak dapat`
        : '';
      return `• ${formatGold(g.amount)} (÷${g.eligibleCount}${excludedText} = ${formatGold(g.sharePerPerson)}/person)`;
    });
    embed.addFields({ name: '🪙 Gold Drops', value: lines.join('\n') });
  }

  // --- Summary ---
  const t = calcResult.totals;
  const summaryLines = [
    `Pool: **${formatGold(t.grossPool)}**`,
    `sealstamp: **${formatGold(t.totalStampDeduction)}**`,
    `Total fee (semua): **${formatGold(t.totalFee)}**`,
    `Yang dibagikan(termasuk sealstamp): **${formatGold(t.totalNetPayable)}**`,
    '· Fee 0.3% dipotong dari gaji kotor PER orang (bukan dipotong rata) — lihat di Status Gaji.',
    calcResult.isFinal ? '· Semua item sudah laku (angka final)' : '· Masih ada item belum laku (angka estimasi).',
  ];
  
  embed.addFields({ name: '📊 Summary', value: summaryLines.join('\n') });

  // --- Status Gaji per orang, dengan rincian kotor - fee ---
  if (members.length) {
    const lines = members.map((m) => {
      const calc = calcResult.perUser[m.user_id] || { netPayable: 0, grossBeforeFee: 0, fee: 0 };
      const excluded = m.is_excluded_from_salary;
      const paid = m.is_paid;
      const mark = excluded ? '➖' : paid ? '✅' : '❌';
      const amountText = excluded
        ? '*tidak ikut bagi*'
        : `**${formatGold(calc.netPayable)}** (kotor ${formatGold(calc.grossBeforeFee)} − fee ${formatGold(calc.fee)})`;
      return `${mark} <@${m.user_id}> — ${amountText}`;
    });
    embed.addFields({ name: '💳 Status Gaji', value: lines.join('\n') });
  }

  const idParts = [];
  if (!calcResult.isFinal) idParts.push('Status: estimasi');
  embed.setFooter({
    text: idParts.length ? idParts.join(' · ') : 'Party Salary Bot',
    iconURL: config.ownerAvatarUrl || undefined,
  });

  return embed;
}

module.exports = { buildSalaryEmbed };