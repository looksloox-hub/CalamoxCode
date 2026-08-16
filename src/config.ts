/**
 * Environment configuration for the Calamox Bridge.
 *
 * All settings can be overridden via environment variables (or a .env file):
 *   CALAMOX_HOST                 — bind address (default: 127.0.0.1)
 *   CALAMOX_PORT                 — listen port (default: 3000)
 *   CALAMOX_TOKEN                — optional bearer token; when set, every /api
 *                                  request must send `Authorization: Bearer <token>`
 *   CALAMOX_EXEC_TIMEOUT_MS      — default timeout for system commands (default: 120000)
 *   CALAMOX_BROWSER_TIMEOUT_MS   — default timeout for page loads (default: 60000)
 *   CALAMOX_MAX_OUTPUT_BYTES     — per-stream output capture cap (default: 10 MiB)
 */

export interface BridgeConfig {
  host: string;
  port: number;
  token: string | null;
  execTimeoutMs: number;
  browserTimeoutMs: number;
  maxOutputBytes: number;
}

const DEFAULTS = {
  host: '127.0.0.1',
  port: 3000,
  execTimeoutMs: 120_000,
  browserTimeoutMs: 60_000,
  maxOutputBytes: 10 * 1024 * 1024,
} as const;

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return {
    host: env.CALAMOX_HOST?.trim() || DEFAULTS.host,
    port: toPositiveInt(env.CALAMOX_PORT, DEFAULTS.port),
    token: env.CALAMOX_TOKEN?.trim() ? env.CALAMOX_TOKEN.trim() : null,
    execTimeoutMs: toPositiveInt(env.CALAMOX_EXEC_TIMEOUT_MS, DEFAULTS.execTimeoutMs),
    browserTimeoutMs: toPositiveInt(env.CALAMOX_BROWSER_TIMEOUT_MS, DEFAULTS.browserTimeoutMs),
    maxOutputBytes: toPositiveInt(env.CALAMOX_MAX_OUTPUT_BYTES, DEFAULTS.maxOutputBytes),
  };
}
