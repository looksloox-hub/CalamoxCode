import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { closeBrowser } from './lib/browser.js';

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`[calamox] Bridge listening on http://${config.host}:${config.port}`);
  if (config.token) {
    console.log('[calamox] Auth enabled (CALAMOX_TOKEN set). All /api calls require a Bearer token.');
  } else {
    console.warn(
      '[calamox] WARNING: no CALAMOX_TOKEN set — anyone with network access to this port can execute arbitrary commands.',
    );
  }
});

function shutdown(signal: string): void {
  console.log(`[calamox] ${signal} received, shutting down...`);
  server.close(() => {
    void closeBrowser().finally(() => process.exit(0));
  });
  // Safety net: never hang on shutdown.
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
