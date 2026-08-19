const STRINGS = {
  id: {
    partyDone: (thread) => `✅ Party selesai. Salary thread dibuat: ${thread}`,
    onlyHostNotify: '⛔ Hanya host yang bisa notify.',
  },
  en: {
    partyDone: (thread) => `✅ Party finished. Salary thread created: ${thread}`,
    onlyHostNotify: '⛔ Only the host can notify.',
  },
};

function t(lang, key, ...args) {
  const dict = STRINGS[lang] || STRINGS.id;
  const entry = dict[key] ?? STRINGS.id[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

module.exports = { t };