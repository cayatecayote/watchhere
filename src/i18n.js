/** Plain strings table per language; `{name}` placeholders are filled by `t`. */
const STRINGS = {
  en: {
    play: 'Play on {service}',
    open: 'Open {service}',
  },
  es: {
    play: 'Reproducir en {service}',
    open: 'Abrir {service}',
  },
};

/**
 * @param {string | undefined} lang unknown languages fall back to English
 * @param {string} key unknown keys return the key itself
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(lang, key, vars = {}) {
  const table = Object.hasOwn(STRINGS, lang ?? '') ? STRINGS[lang] : STRINGS.en;
  const text = table[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}
