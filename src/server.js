import pkg from '../package.json' with { type: 'json' };
import { parseUserConfig } from './userConfig.js';
import { manifest } from './manifest.js';
import { COUNTRIES } from './countries.js';

const RESERVED = new Set(['manifest.json', 'stream', 'configure', 'api', 'health']);
const STREAM_ID = /^(tt\d+|tmdb:\d+)(?::(\d+):(\d+))?$/;
const COUNTRY = /^[a-z]{2}$/i;
const KNOWN_COUNTRIES = new Set(COUNTRIES.map((c) => c.code));

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': '*',
  'x-content-type-options': 'nosniff',
};

// The configure page is one document with inline <style> and <script>, same-origin
// fetches, and service icons from JustWatch's image host.
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  'img-src https://images.justwatch.com data:',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** @param {string} s @returns {string | null} null when the escape sequence is malformed */
function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Keeps request-controlled text from forging log lines. */
function logSafe(s) {
  return String(s).replace(/[^\w:.,+-]/g, '?').slice(0, 80);
}

/**
 * Builds the request handler. Upstream failure messages are never logged
 * verbatim: they can carry URLs with API keys.
 *
 * @param {{
 *   streams: { lookup(req: object, user: object): Promise<{ rows: unknown[], upstream: 'ok' | 'fail' | 'timeout' }> },
 *   justWatch: { listPackages(country: string): Promise<unknown[]> },
 *   page: { render(user: object | null, lang: 'en' | 'es'): string } | null,
 *   cfg: ReturnType<import('./config.js').loadConfig>,
 *   logger?: { info(msg: string): void, error(msg: string): void },
 * }} deps
 */
export function createApp({ streams, justWatch, page, cfg, logger = console }) {
  /** @param {import('node:http').ServerResponse} res */
  function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { ...CORS, ...extra, 'content-type': type });
    res.end(payload);
  }
  const notFound = (res) => send(res, 404, { error: 'Not found' });

  async function handleStream(res, user, type, rawId) {
    const started = Date.now();
    const decoded = decode(rawId);
    const id = decoded?.endsWith('.json') ? decoded.slice(0, -5) : null;
    const m = id === null ? null : STREAM_ID.exec(id);
    if ((type !== 'movie' && type !== 'series') || !m) {
      return send(res, 200, { streams: [] });
    }
    const req = { type, id };
    if (m[2] !== undefined) {
      req.season = Number(m[2]);
      req.episode = Number(m[3]);
    }
    let rows = [];
    let upstream = 'ok';
    try {
      const answer = await streams.lookup(req, user);
      if (Array.isArray(answer?.rows)) rows = answer.rows;
      if (answer?.upstream === 'fail' || answer?.upstream === 'timeout') upstream = answer.upstream;
    } catch {
      rows = [];
      upstream = 'fail';
    }
    logger.info(
      `stream ${logSafe(id)} services=${logSafe(user.services.join(','))} rows=${rows.length} upstream=${upstream} ${Date.now() - started}ms`,
    );
    return send(res, 200, { streams: rows });
  }

  async function handlePackages(res, url) {
    const country = url.searchParams.get('country') ?? '';
    if (!COUNTRY.test(country)) return send(res, 400, { error: 'country must be 2 letters' });
    if (!KNOWN_COUNTRIES.has(country.toLowerCase())) return send(res, 400, { error: 'unknown country' });
    try {
      return send(res, 200, await justWatch.listPackages(country.toLowerCase()));
    } catch {
      return send(res, 502, { error: 'Could not load the service list' });
    }
  }

  function handleConfigure(res, req, user) {
    if (!page) return notFound(res);
    const accept = String(req.headers['accept-language'] ?? '').trim().toLowerCase();
    const lang = user ? user.lang : accept.startsWith('es') ? 'es' : 'en';
    return send(res, 200, page.render(user, lang), 'text/html; charset=utf-8', {
      'content-security-policy': PAGE_CSP,
    });
  }

  async function route(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);

    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').slice(1);

    /** @type {import('./userConfig.js').UserConfig | null} */
    let user = null;
    let configured = false;
    if (parts.length > 1 && !RESERVED.has(parts[0])) {
      const segment = decode(parts[0]);
      user = segment === null ? null : parseUserConfig(segment);
      if (!user || !KNOWN_COUNTRIES.has(user.country)) return notFound(res);
      configured = true;
      parts.shift();
    }

    const [head, a, b] = parts;
    if (parts.length === 1 && head === 'manifest.json') {
      return send(res, 200, manifest(user, cfg.defaults.lang));
    }
    if (parts.length === 3 && head === 'stream') {
      return handleStream(res, user ?? cfg.defaults, a, b);
    }
    if (parts.length === 1 && head === 'configure') return handleConfigure(res, req, user);
    if (!configured && parts.length === 2 && head === 'api' && a === 'packages') {
      return handlePackages(res, url);
    }
    if (!configured && parts.length === 1 && head === 'health') {
      return send(res, 200, { ok: true, version: pkg.version });
    }
    return notFound(res);
  }

  return async (req, res) => {
    try {
      await route(req, res);
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'Internal error' });
      else res.end();
      logger.error('request failed');
    }
  };
}
