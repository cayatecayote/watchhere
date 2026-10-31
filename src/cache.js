/**
 * In-memory TTL cache. `get` returns `undefined` on a miss (or an expired
 * entry), so `null` and `[]` are legitimate cached values. When full, the
 * oldest entry is evicted.
 *
 * @param {{ now?: () => number, maxEntries?: number }} [options]
 */
export function createCache({ now = Date.now, maxEntries = 5000 } = {}) {
  /** @type {Map<string, { value: unknown, expires: number }>} */
  const entries = new Map();

  return {
    /** @param {string} key */
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expires) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    /**
     * @param {string} key
     * @param {unknown} value
     * @param {number} ttlMs
     */
    set(key, value, ttlMs) {
      entries.delete(key); // re-inserting moves it to the newest slot
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
    },
  };
}
