const SEGMENT = /^([a-z]{2})-(en|es)-([a-z0-9]+(?:,[a-z0-9]+)*)$/;
const MAX_SERVICES = 40;

/**
 * @typedef {{ country: string, lang: 'en'|'es', services: string[] }} UserConfig
 */

/**
 * Parses the config segment of the install URL, e.g. `ar-es-disneyplus,netflix,max`.
 * @param {string} segment
 * @returns {UserConfig | null}
 */
export function parseUserConfig(segment) {
  if (typeof segment !== 'string') return null;
  const m = SEGMENT.exec(segment);
  if (!m) return null;
  const all = m[3].split(',');
  if (all.length > MAX_SERVICES) return null;
  return { country: m[1], lang: m[2], services: [...new Set(all)] };
}

/**
 * @param {UserConfig} cfg
 * @returns {string}
 */
export function formatUserConfig(cfg) {
  return `${cfg.country}-${cfg.lang}-${cfg.services.join(',')}`;
}
