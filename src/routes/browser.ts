import { Router, type Request, type Response } from 'express';
import type { BridgeConfig } from '../config.js';
import { getBrowser } from '../lib/browser.js';

const MAX_TEXT_CHARS = 500_000;
const MAX_LINKS = 200;

export interface BrowserOpenResult {
  title: string;
  url: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  screenshotBase64?: string;
}

export function browserRouter(config: BridgeConfig): Router {
  const router = Router();

  router.post('/api/browser/open', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing or empty "url" (string) in request body.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: `Invalid URL: "${rawUrl}".` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Only http:// and https:// URLs are supported.' });
      return;
    }

    const screenshot = body.screenshot === true;
    const timeoutMs =
      typeof body.timeoutMs === 'number' && Number.isFinite(body.timeoutMs) && body.timeoutMs > 0
        ? Math.min(Math.floor(body.timeoutMs), 300_000)
        : config.browserTimeoutMs;
    const maxChars =
      typeof body.maxChars === 'number' && Number.isFinite(body.maxChars) && body.maxChars > 0
        ? Math.min(Math.floor(body.maxChars), MAX_TEXT_CHARS)
        : MAX_TEXT_CHARS;

    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.goto(rawUrl, { waitUntil: 'networkidle2', timeout: timeoutMs });

        const title = await page.title();
        const finalUrl = page.url();
        const text = await page.evaluate((max: number) => {
          const bodyEl = document.body;
          if (!bodyEl) return '';
          return (bodyEl.innerText ?? '').slice(0, max);
        }, maxChars);
        const links = await page.evaluate((max: number) =>
          Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
            .map((a) => ({ text: (a.textContent ?? '').trim().slice(0, 200), href: a.href }))
            .filter((l) => l.href.startsWith('http'))
            .slice(0, max),
        MAX_LINKS);

        const result: BrowserOpenResult = { title, url: finalUrl, text, links };

        if (screenshot) {
          const shot = await page.screenshot({ type: 'png', fullPage: true });
          result.screenshotBase64 = Buffer.from(shot).toString('base64');
        }

        res.json(result);
      } finally {
        await page.close().catch(() => {
          /* page already closed */
        });
      }
    } catch (err) {
      res.status(500).json({
        error: 'Browser operation failed.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
