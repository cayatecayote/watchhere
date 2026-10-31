/**
 * Minimal JSON-over-HTTP client. Every failure (network, timeout, non-2xx,
 * unparseable body) becomes an `Error` with a message fit to log.
 *
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createHttp({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  /**
   * @param {string} url
   * @param {RequestInit} init
   */
  async function request(url, init) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw new Error(`Request to ${url} failed: ${err?.message ?? err}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    try {
      return await res.json();
    } catch {
      throw new Error(`Invalid JSON in response from ${url}`);
    }
  }

  return {
    /** @param {string} url */
    getJson: (url) => request(url, { method: 'GET', headers: { accept: 'application/json' } }),
    /**
     * @param {string} url
     * @param {unknown} body
     */
    postJson: (url, body) =>
      request(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  };
}
