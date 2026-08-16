import express, { type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { loadConfig, type BridgeConfig } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { execRouter } from './routes/exec.js';
import { browserRouter } from './routes/browser.js';

export const BRIDGE_VERSION = '0.1.0';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));

export function createApp(config: BridgeConfig = loadConfig()): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Dashboard UI (src/public/index.html is copied to dist/public at build time).
  app.use(express.static(publicDir, { maxAge: '1h' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
  });

  app.get('/api/info', (_req: Request, res: Response) => {
    res.json({
      name: 'Calamox Execution Bridge',
      version: BRIDGE_VERSION,
      endpoints: {
        health: 'GET /health',
        info: 'GET /api/info',
        systemExec: 'POST /api/system/exec',
        browserOpen: 'POST /api/browser/open',
      },
    });
  });

  if (config.token) {
    app.use('/api', authMiddleware(config.token));
  }

  app.use(execRouter(config));
  app.use(browserRouter(config));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[calamox] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.', detail: err.message });
  });

  return app;
}
