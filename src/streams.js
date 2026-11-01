import { buildLink } from './links.js';
import { t } from './i18n.js';
import { displayName } from './names.js';

const COUNTED = new Set(['FLATRATE', 'FREE', 'ADS']);
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const EPISODE_SUFFIX = /:(\d+):(\d+)$/;
const TIMED_OUT = Symbol('timed out');

/**
 * @typedef {import('./userConfig.js').UserConfig} UserConfig
 * @typedef {import('./links.js').JwOffer} JwOffer
 * @typedef {import('./links.js').LinkResult} LinkResult
 * @typedef {{ name: string, title: string, externalUrl: string }} Stream
 */

/** @param {unknown} value @returns {number | null} UTC day number, or null */
function dayOf(value) {
  const m = typeof value === 'string' ? DATE.exec(value) : null;
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(ms) ? null : ms / DAY_MS;
}

/** Both dates must exist and be at most a day apart. */
function sameAirDate(a, b) {
  const x = dayOf(a);
  const y = dayOf(b);
  return x !== null && y !== null && Math.abs(x - y) <= 1;
}

/**
 * First offer of `service` that counts (subscription / free / ads) and has a
 * link Nuvio can open.
 * @param {JwOffer[] | null | undefined} offers
 * @param {string} service
 * @returns {{ link: LinkResult, clearName: string } | null}
 */
function pick(offers, service) {
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (offer?.package?.technicalName !== service) continue;
    if (!COUNTED.has(/** @type {string} */ (offer.monetizationType))) continue;
    const link = buildLink(offer);
    if (link) return { link, clearName: offer.package.clearName ?? service };
  }
  return null;
}

/**
 * @param {{
 *   titles: { resolve(req: { type: string, id: string }): Promise<import('./titles.js').Title | null> },
 *   justWatch: { findTitle(q: { imdbId: string, objectType: string, terms: string[], country: string }): Promise<import('./justwatch.js').JwTitle | null> },
 *   timeoutMs?: number,
 * }} deps
 */
export function createStreams({ titles, justWatch, timeoutMs = 5000 }) {
  /**
   * @param {{ type: string, id: string, season?: number, episode?: number }} req
   * @param {UserConfig} user
   * @returns {Promise<Stream[]>}
   */
  async function build(req, user) {
    const title = await titles.resolve({ type: req.type, id: req.id });
    if (!title) return [];
    const jw = await justWatch.findTitle({
      imdbId: title.imdbId,
      objectType: title.objectType,
      terms: title.terms,
      country: user.country,
    });
    if (!jw) return [];

    const episode = title.objectType === 'SHOW' ? episodeOffers(req, title, jw) : null;

    const plays = [];
    const pages = [];
    for (const service of user.services) {
      const hit = pick(episode, service) ?? pick(jw.offers, service);
      if (!hit) continue;
      const name = displayName(hit.clearName);
      const key = hit.link.kind === 'play' ? 'play' : 'open';
      (hit.link.kind === 'play' ? plays : pages).push({
        name,
        title: t(user.lang, key, { service: name }),
        externalUrl: hit.link.url,
      });
    }
    return [...plays, ...pages];
  }

  /**
   * Never throws: any failure, or running past `timeoutMs`, answers no rows
   * and says so in `upstream` ('fail' | 'timeout'; 'ok' otherwise). Error
   * messages are dropped on purpose: they can carry URLs with API keys.
   * @param {{ type: string, id: string, season?: number, episode?: number }} req
   * @param {UserConfig} user
   * @returns {Promise<{ rows: Stream[], upstream: 'ok' | 'fail' | 'timeout' }>}
   */
  async function lookup(req, user) {
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    try {
      const rows = await Promise.race([build(req, user), deadline]);
      return rows === TIMED_OUT ? { rows: [], upstream: 'timeout' } : { rows, upstream: 'ok' };
    } catch {
      return { rows: [], upstream: 'fail' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    lookup,
    /**
     * Never throws: any failure, or running past `timeoutMs`, answers `[]`.
     * @param {{ type: string, id: string, season?: number, episode?: number }} req
     * @param {UserConfig} user
     * @returns {Promise<Stream[]>}
     */
    getStreams: async (req, user) => (await lookup(req, user)).rows,
  };
}

/**
 * The episode's own offers, but only when JustWatch's air date for that exact
 * S:E agrees with Cinemeta's. Anything doubtful returns null so callers fall
 * back to the show-level link rather than risk opening another episode.
 * @returns {JwOffer[] | null}
 */
function episodeOffers(req, title, jw) {
  let { season, episode } = req;
  if (season === undefined || episode === undefined) {
    const m = EPISODE_SUFFIX.exec(req.id);
    if (!m) return null;
    season = +m[1];
    episode = +m[2];
  }
  const cinemetaDate = title.episodes.get(`${season}:${episode}`);
  const jwSeason = (Array.isArray(jw.seasons) ? jw.seasons : []).find((s) => s?.number === season);
  const jwEpisode = (Array.isArray(jwSeason?.episodes) ? jwSeason.episodes : []).find(
    (e) => e?.number === episode,
  );
  if (!jwEpisode || !sameAirDate(jwEpisode.releaseDate, cinemetaDate)) return null;
  return jwEpisode.offers;
}
