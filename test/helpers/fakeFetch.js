/**
 * A fake `fetch` so the offline suite never touches the network.
 *
 * `handler({ url, method, body })` returns `{ status = 200, json }` (or a
 * plain object, taken as the JSON body with status 200). With `delayMs` the
 * response is held back, and the request honours `init.signal`, so a
 * `AbortSignal.timeout` rejects exactly as a real fetch would.
 *
 * The returned function records every request in `.calls`.
 *
 * @param {(req: { url: string, method: string, body: any }) => any} handler
 * @param {{ delayMs?: number }} [options]
 */
export function createFakeFetch(handler, { delayMs = 0 } = {}) {
  const calls = [];

  async function fakeFetch(url, init = {}) {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const req = { url: String(url), method, body, headers: init.headers ?? {} };
    calls.push(req);

    if (delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        init.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(init.signal.reason);
          },
          { once: true },
        );
      });
    }
    init.signal?.throwIfAborted();

    const result = await handler(req);
    const status = result && typeof result.status === 'number' ? result.status : 200;
    const json = result && 'json' in result && typeof result.status === 'number' ? result.json : result;
    return new Response(JSON.stringify(json ?? null), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  fakeFetch.calls = calls;
  return fakeFetch;
}

/** Wraps a GraphQL `data` payload the way JustWatch answers. */
export const gql = (data) => ({ data });

/** Offer shaped like a real JustWatch one. */
export function offer(technicalName, monetizationType = 'FLATRATE', extra = {}) {
  return {
    monetizationType,
    standardWebURL: `https://${technicalName}.example/title`,
    deeplinkURL: `intent://${technicalName}.example/play#Intent;scheme=https;end`,
    package: { technicalName, clearName: technicalName },
    ...extra,
  };
}

/** A `popularTitles` answer holding the given nodes. */
export const titlesResponse = (...nodes) =>
  gql({ popularTitles: { edges: nodes.map((node) => ({ node })) } });
