const CINEMETA = 'https://v3-cinemeta.strem.io/meta';
const TMDB = 'https://api.themoviedb.org';

const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Unknown (or failed) lookups are remembered only briefly: long enough not to
// hammer Cinemeta while a client retries, short enough that a hiccup heals.
const UNKNOWN_TTL_MS = 10 * 60 * 1000;

const IMDB_ID = /^tt\d+$/;
const TMDB_ID = /^tmdb:(\d+)$/;

/**
 * @typedef {{
 *   imdbId: string,
 *   objectType: 'MOVIE' | 'SHOW',
 *   terms: string[],
 *   episodes: Map<string, string>,
 * }} Title
 */

/**
 * Turns a Stremio/Nuvio content id into what JustWatch needs: an IMDb id, a
 * name to search for, and (for series) each episode's release date.
 *
 * Every failure is a `null`, never a throw. The TMDB key travels in the query
 * string, so errors from `http` (which echo the URL) are swallowed here and
 * must never be logged by callers of this module.
 *
 * @param {{
 *   http: { getJson(url: string): Promise<any> },
 *   cache: { get(key: string): unknown, set(key: string, value: unknown, ttlMs: number): void },
 *   tmdbKey?: string,
 * }} deps
 */
export function createTitles({ http, cache, tmdbKey = '' }) {
  /** @param {string} type @param {string} imdbId @returns {Promise<Title | null>} */
  async function fromCinemeta(type, imdbId) {
    const key = `title:${type}:${imdbId}`;
    const cached = cache.get(key);
    if (cached !== undefined) return /** @type {Title | null} */ (cached);

    let title = null;
    try {
      const body = await http.getJson(`${CINEMETA}/${type}/${imdbId}.json`);
      const meta = body?.meta;
      if (typeof meta?.name === 'string' && meta.name) {
        title = {
          imdbId,
          objectType: type === 'series' ? 'SHOW' : 'MOVIE',
          terms: [meta.name],
          episodes: episodesOf(meta.videos),
        };
      }
    } catch {
      title = null;
    }
    cache.set(key, title, title ? FOUND_TTL_MS : UNKNOWN_TTL_MS);
    return title;
  }

  /** @param {string} type @param {string} tmdbId @returns {Promise<string | null>} */
  async function imdbFromTmdb(type, tmdbId) {
    const key = `tmdb:${type}:${tmdbId}`;
    const cached = cache.get(key);
    if (cached !== undefined) return /** @type {string | null} */ (cached);

    let imdbId = null;
    try {
      const path = type === 'series' ? 'tv' : 'movie';
      const body = await http.getJson(
        `${TMDB}/3/${path}/${tmdbId}/external_ids?api_key=${encodeURIComponent(tmdbKey)}`,
      );
      if (typeof body?.imdb_id === 'string' && IMDB_ID.test(body.imdb_id)) imdbId = body.imdb_id;
    } catch {
      imdbId = null;
    }
    cache.set(key, imdbId, imdbId ? FOUND_TTL_MS : UNKNOWN_TTL_MS);
    return imdbId;
  }

  return {
    /**
     * @param {{ type?: string, id?: string }} request
     * @returns {Promise<Title | null>}
     */
    async resolve({ type, id } = {}) {
      if (type !== 'movie' && type !== 'series') return null;
      if (typeof id !== 'string') return null;

      // Stremio episode ids look like `tt7678620:2:5`; the show is the first part.
      const [head] = id.split(':');
      if (IMDB_ID.test(head)) return fromCinemeta(type, head);

      const tmdb = TMDB_ID.exec(id);
      if (tmdb && tmdbKey) {
        const imdbId = await imdbFromTmdb(type, tmdb[1]);
        return imdbId ? fromCinemeta(type, imdbId) : null;
      }
      return null;
    },
  };
}

/** @param {unknown} videos @returns {Map<string, string>} */
function episodesOf(videos) {
  const episodes = new Map();
  if (!Array.isArray(videos)) return episodes;
  for (const v of videos) {
    const released = typeof v?.released === 'string' ? v.released.slice(0, 10) : '';
    if (!Number.isInteger(v?.season) || !Number.isInteger(v?.episode)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(released)) continue;
    episodes.set(`${v.season}:${v.episode}`, released);
  }
  return episodes;
}
