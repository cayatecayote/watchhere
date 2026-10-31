const HTTP = /^https?:\/\//i;
const INTENT = /^intent:\/\/([^#]*)#Intent;(.*)$/is;

/**
 * @typedef {{
 *   monetizationType?: string,
 *   standardWebURL?: string | null,
 *   deeplinkURL?: string | null,
 *   package?: { technicalName?: string, clearName?: string },
 * }} JwOffer
 * @typedef {{ url: string, kind: 'play' | 'page' }} LinkResult
 */

/**
 * Turns a JustWatch link into something Nuvio can open: an Android TV
 * `intent://` URL is unwrapped into its https URL, http(s) passes through,
 * anything else (custom app schemes, junk) is refused.
 * @param {string | null | undefined} link
 * @returns {string | null}
 */
export function tvLink(link) {
  if (typeof link !== 'string') return null;
  if (HTTP.test(link)) return link;
  const m = INTENT.exec(link);
  if (!m) return null;
  const scheme = /(?:^|;)scheme=([^;]*)/i.exec(m[2])?.[1]?.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  return `${scheme}://${m[1]}`;
}

/**
 * @param {JwOffer} offer
 * @returns {LinkResult | null}
 */
function justWatchBuilder(offer) {
  const play = tvLink(offer.deeplinkURL);
  if (play) return { url: play, kind: 'play' };
  const page = tvLink(offer.standardWebURL);
  if (page) return { url: page, kind: 'page' };
  return null;
}

/**
 * Ordered list of `(offer) => LinkResult | null`; the first hit wins.
 * Service-specific builders get prepended here.
 * @type {Array<(offer: JwOffer) => LinkResult | null>}
 */
export const BUILDERS = [justWatchBuilder];

/**
 * @param {JwOffer} offer
 * @returns {LinkResult | null}
 */
export function buildLink(offer) {
  for (const build of BUILDERS) {
    const result = build(offer);
    if (result) return result;
  }
  return null;
}
