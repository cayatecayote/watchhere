const ENDPOINT = 'https://apis.justwatch.com/graphql';
const KEEP = new Set(['FLATRATE', 'FREE', 'ADS']);

const OFFER_FIELDS =
  'monetizationType standardWebURL deeplinkURL(platform: ANDROID_TV) package { technicalName clearName }';

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
        offers(country: $country, platform: WEB) { ${OFFER_FIELDS} }
      }
    } }
  }
}`;

const PACKAGES_QUERY =
  'query($country: Country!) { packages(country: $country, platform: WEB) { technicalName clearName monetizationTypes } }';

/**
 * @typedef {import('./links.js').JwOffer} JwOffer
 * @typedef {{ number: number, releaseDate: string | null, offers: JwOffer[] }} JwEpisode
 * @typedef {{ number: number, episodes: JwEpisode[] }} JwSeason
 * @typedef {{ offers: JwOffer[], seasons: JwSeason[] }} JwTitle
 */

const HOUR = 3600e3;

/**
 * @param {{
 *   http: { postJson(url: string, body: unknown): Promise<any> },
 *   cache: { get(key: string): unknown, set(key: string, value: unknown, ttlMs: number): void },
 *   ttl?: { hit?: number, miss?: number, packages?: number },
 * }} deps
 */
export function createJustWatch({ http, cache, ttl = {} }) {
  const hitTtl = ttl.hit ?? 12 * HOUR;
  const missTtl = ttl.miss ?? 3 * HOUR;
  const packagesTtl = ttl.packages ?? 24 * HOUR;

  /** @returns {Promise<any>} the GraphQL `data` payload; GraphQL errors throw */
  async function query(query, variables) {
    const res = await http.postJson(ENDPOINT, { query, variables });
    if (res?.errors?.length) {
      throw new Error(`JustWatch GraphQL error: ${res.errors.map((e) => e?.message).join('; ')}`);
    }
    if (!res?.data) throw new Error('JustWatch returned no data');
    return res.data;
  }

  /** @param {any} node @returns {JwTitle} */
  function toTitle(node) {
    return {
      offers: node.offers ?? [],
      seasons: (node.seasons ?? []).map((s) => ({
        number: s.content.seasonNumber,
        episodes: (s.episodes ?? []).map((e) => ({
          number: e.content.episodeNumber,
          releaseDate: e.content.originalReleaseDate ?? null,
          offers: e.offers ?? [],
        })),
      })),
    };
  }

  /**
   * Looks a title up by search term, trusting only an exact IMDb id match.
   * @param {{ imdbId: string, objectType: 'MOVIE' | 'SHOW', terms: string[], country: string }} args
   * @returns {Promise<JwTitle | null>}
   */
  async function findTitle({ imdbId, objectType, terms, country }) {
    const cc = country.toUpperCase();
    const key = `title:${cc}:${objectType}:${imdbId}`;
    const cached = cache.get(key);
    if (cached !== undefined) return /** @type {JwTitle | null} */ (cached);

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
        const title = toTitle(detail.node ?? {});
        cache.set(key, title, hitTtl);
        return title;
      }
    }
    cache.set(key, null, missTtl);
    return null;
  }

  /**
   * Streaming services in a country that carry subscription or free content.
   * @param {string} country
   * @returns {Promise<{ id: string, name: string }[]>}
   */
  async function listPackages(country) {
    const cc = country.toUpperCase();
    const key = `packages:${cc}`;
    const cached = cache.get(key);
    if (cached !== undefined) return /** @type {{ id: string, name: string }[]} */ (cached);

    const data = await query(PACKAGES_QUERY, { country: cc });
    const list = (data.packages ?? [])
      .filter((p) => (p.monetizationTypes ?? []).some((m) => KEEP.has(m)))
      .map((p) => ({ id: p.technicalName, name: p.clearName }));
    cache.set(key, list, packagesTtl);
    return list;
  }

  return { findTitle, listPackages };
}
