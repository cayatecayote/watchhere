import { displayName } from './names.js';
import { createCache } from './cache.js';

const ENDPOINT = 'https://apis.justwatch.com/graphql';
const ICON_HOST = 'https://images.justwatch.com';
const KEEP = new Set(['FLATRATE', 'FREE', 'ADS']);

const OFFER_FIELDS =
  'monetizationType standardWebURL deeplinkURL(platform: ANDROID_TV) package { technicalName clearName }';

// Per-episode ids live on the ANDROID platform only (ANDROID_TV has just the
// show id, Netflix). Asked for episode offers only: at show level the same
// field would hand back the first episode.
const EPISODE_OFFER_FIELDS = `${OFFER_FIELDS} episodeURL: deeplinkURL(platform: ANDROID)`;

// JustWatch rejects one big query (complexity 668450 vs a 350000 limit), so a
// lookup is two steps: a light search to find the node, then a detail query
// for that single node.
const SEARCH_QUERY = `query($country: Country!, $first: Int!, $filter: TitleFilter) {
  popularTitles(country: $country, first: $first, filter: $filter) { edges { node {
    id objectType
    content(country: $country, language: en) { externalIds { imdbId } }
  } } }
}`;

const DETAIL_QUERY = `query($id: ID!, $country: Country!) {
  node(id: $id) {
    ... on MovieOrShow { offers(country: $country, platform: WEB) { ${OFFER_FIELDS} } }
    ... on Show { seasons {
      content(country: $country, language: en) { seasonNumber }
      episodes {
        content(country: $country, language: en) { episodeNumber originalReleaseDate }
        offers(country: $country, platform: WEB) { ${EPISODE_OFFER_FIELDS} }
      }
    } }
  }
}`;

const PACKAGES_QUERY =
  'query($country: Country!) { packages(country: $country, platform: WEB) { technicalName clearName monetizationTypes icon(profile: S100, format: PNG) } }';

/**
 * @typedef {import('./links.js').JwOffer} JwOffer
 * @typedef {{ number: number, releaseDate: string | null, offers: JwOffer[] }} JwEpisode
 * @typedef {{ number: number, episodes: JwEpisode[] }} JwSeason
 * @typedef {{ offers: JwOffer[], seasons: JwSeason[] }} JwTitle
 */

const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const MAX_IN_FLIGHT = 4;
const MAX_TITLES = 300;

/** A cached upstream failure: rethrown to callers until it expires. */
class Failure {
  /** @param {unknown} error */
  constructor(error) {
    this.error = error;
  }
}

const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Keeps only the offers that count (subscription / free / ads) and only the
 * fields the picker and the link builders read, so the cache stays small.
 * @returns {JwOffer[]}
 */
function trimOffers(list) {
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || !KEEP.has(o.monetizationType)) continue;
    out.push({
      monetizationType: o.monetizationType,
      standardWebURL: o.standardWebURL ?? null,
      deeplinkURL: o.deeplinkURL ?? null,
      ...(typeof o.episodeURL === 'string' && { episodeURL: o.episodeURL }),
      package: { technicalName: o.package?.technicalName, clearName: o.package?.clearName },
    });
  }
  return out;
}

/** @param {any} node @returns {JwTitle} */
function toTitle(node) {
  const seasons = [];
  for (const s of Array.isArray(node.seasons) ? node.seasons : []) {
    const number = s?.content?.seasonNumber;
    if (!isNumber(number)) continue;
    const episodes = [];
    for (const e of Array.isArray(s.episodes) ? s.episodes : []) {
      const epNumber = e?.content?.episodeNumber;
      if (!isNumber(epNumber)) continue;
      episodes.push({
        number: epNumber,
        releaseDate: e.content.originalReleaseDate ?? null,
        offers: trimOffers(e.offers),
      });
    }
    seasons.push({ number, episodes });
  }
  return { offers: trimOffers(node.offers), seasons };
}

/**
 * @param {{
 *   http: { postJson(url: string, body: unknown): Promise<any> },
 *   cache: { get(key: string): unknown, set(key: string, value: unknown, ttlMs: number): void },
 *   ttl?: { hit?: number, miss?: number, packages?: number, failure?: number },
 *   now?: () => number,
 *   maxInFlight?: number,
 * }} deps `cache` holds the (tiny) packages lists; titles live in a private cache capped at 300 entries.
 */
export function createJustWatch({ http, cache, ttl = {}, now = Date.now, maxInFlight = MAX_IN_FLIGHT }) {
  const hitTtl = ttl.hit ?? 12 * HOUR;
  const missTtl = ttl.miss ?? 3 * HOUR;
  const packagesTtl = ttl.packages ?? 24 * HOUR;
  const failureTtl = ttl.failure ?? 2 * MINUTE;
  const titleCache = createCache({ now, maxEntries: MAX_TITLES });

  // At most `maxInFlight` requests to JustWatch at once; the rest queue.
  let active = 0;
  /** @type {Array<() => void>} */
  const waiting = [];
  async function limited(fn) {
    if (active >= maxInFlight) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next(); // hand the slot straight over
      else active--;
    }
  }

  /** @returns {Promise<any>} the GraphQL `data` payload; GraphQL errors throw */
  async function query(query, variables) {
    const res = await limited(() => http.postJson(ENDPOINT, { query, variables }));
    if (res?.errors?.length) {
      throw new Error(`JustWatch GraphQL error: ${res.errors.map((e) => e?.message).join('; ')}`);
    }
    if (!res?.data) throw new Error('JustWatch returned no data');
    return res.data;
  }

  /**
   * A cached value, a cached failure (rethrown), a lookup already in flight,
   * or a fresh one. Failures are remembered briefly so a broken upstream is
   * not hammered; identical concurrent calls share one promise.
   * @template T
   * @param {{ get(key: string): unknown, set(key: string, value: unknown, ttlMs: number): void }} store
   * @param {Map<string, Promise<T>>} inflight
   * @param {string} key
   * @param {() => Promise<T>} load stores its own successes
   * @returns {Promise<T>}
   */
  async function cached(store, inflight, key, load) {
    const hit = store.get(key);
    if (hit instanceof Failure) throw hit.error;
    if (hit !== undefined) return /** @type {T} */ (hit);
    let pending = inflight.get(key);
    if (!pending) {
      pending = load()
        .catch((err) => {
          store.set(key, new Failure(err), failureTtl);
          throw err;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  }

  /** @type {Map<string, Promise<JwTitle | null>>} */
  const titleFlights = new Map();
  /** @type {Map<string, Promise<{ id: string, name: string, icon: string | null }[]>>} */
  const packageFlights = new Map();

  /**
   * Looks a title up by search term, trusting only an exact IMDb id match.
   * @param {{ imdbId: string, objectType: 'MOVIE' | 'SHOW', terms: string[], country: string }} args
   * @returns {Promise<JwTitle | null>}
   */
  function findTitle({ imdbId, objectType, terms, country }) {
    const cc = country.toUpperCase();
    const key = `title:${cc}:${objectType}:${imdbId}`;
    return cached(titleCache, titleFlights, key, async () => {
      for (const term of terms) {
        const data = await query(SEARCH_QUERY, {
          country: cc,
          first: 10,
          filter: { searchQuery: term, objectTypes: [objectType] },
        });
        const edges = data.popularTitles?.edges ?? [];
        const match = edges.find((e) => e?.node?.content?.externalIds?.imdbId === imdbId);
        if (match) {
          const detail = await query(DETAIL_QUERY, { id: match.node.id, country: cc });
          if (!detail.node) throw new Error('JustWatch returned no node for the matched title');
          const title = toTitle(detail.node);
          titleCache.set(key, title, hitTtl);
          return title;
        }
      }
      titleCache.set(key, null, missTtl);
      return null;
    });
  }

  /**
   * Streaming services in a country that carry subscription or free content.
   * @param {string} country
   * @returns {Promise<{ id: string, name: string, icon: string | null }[]>}
   */
  function listPackages(country) {
    const cc = country.toUpperCase();
    const key = `packages:${cc}`;
    return cached(cache, packageFlights, key, async () => {
      const data = await query(PACKAGES_QUERY, { country: cc });
      const list = (data.packages ?? [])
        .filter((p) => (p.monetizationTypes ?? []).some((m) => KEEP.has(m)))
        .map((p) => ({
          id: p.technicalName,
          name: displayName(p.clearName),
          icon: typeof p.icon === 'string' && p.icon.startsWith('/') ? ICON_HOST + p.icon : null,
        }));
      cache.set(key, list, packagesTtl);
      return list;
    });
  }

  return { findTitle, listPackages };
}
