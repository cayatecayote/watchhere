import { parseUserConfig } from './userConfig.js';

const DEFAULT_SEGMENT = 'ar-es-disneyplus,netflix';

/**
 * Reads the server configuration from the environment. Anything invalid
 * throws, so a bad deployment fails at start rather than on the first request.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function loadConfig(env = process.env) {
  let port = 7020;
  if (env.PORT !== undefined && env.PORT !== '') {
    port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`Invalid PORT: ${JSON.stringify(env.PORT)}`);
    }
  }

  const segment = env.DEFAULT_CONFIG || DEFAULT_SEGMENT;
  const defaults = parseUserConfig(segment);
  if (!defaults) {
    throw new Error(
      `Invalid DEFAULT_CONFIG: ${JSON.stringify(segment)} (expected e.g. ${DEFAULT_SEGMENT})`,
    );
  }

  return {
    port,
    requestTimeoutMs: 4000,
    streamTimeoutMs: 5000,
    defaults,
    tmdbKey: env.TMDB_API_KEY ?? '',
  };
}
