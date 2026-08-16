import { Router, type Request, type Response } from 'express';
import type { BridgeConfig } from '../config.js';
import { runCommand } from '../lib/exec.js';

const MAX_COMMAND_LENGTH = 64 * 1024; // 64 KiB of shell command text

export function execRouter(config: BridgeConfig): Router {
  const router = Router();

  router.post('/api/system/exec', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const command = typeof body.command === 'string' ? body.command.trim() : '';
    if (!command) {
      res.status(400).json({ error: 'Missing or empty "command" (string) in request body.' });
      return;
    }
    if (command.length > MAX_COMMAND_LENGTH) {
      res.status(400).json({ error: `"command" exceeds the ${MAX_COMMAND_LENGTH}-byte limit.` });
      return;
    }

    const cwd = typeof body.cwd === 'string' && body.cwd.trim() ? body.cwd : undefined;
    const env =
      body.env && typeof body.env === 'object' && !Array.isArray(body.env)
        ? (body.env as Record<string, string>)
        : undefined;
    const requestedTimeout =
      typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs) && body.timeoutMs > 0
        ? Math.min(Math.floor(body.timeoutMs), 600_000)
        : config.execTimeoutMs;

    try {
      const result = await runCommand({
        command,
        cwd,
        env,
        timeoutMs: requestedTimeout,
        maxOutputBytes: config.maxOutputBytes,
      });

      const status = result.timedOut ? 504 : result.exitCode === 0 ? 200 : 500;
      res.status(status).json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to execute command.', detail: String(err) });
    }
  });

  return router;
}
