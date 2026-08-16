import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { closeBrowser } from '../src/lib/browser.js';

const HTML = `<!doctype html>
<html>
  <head><title>Calamox Fixture Page</title></head>
  <body>
    <h1>Bridge Browser Test</h1>
    <p>This is the marker text for the browser test.</p>
    <a href="https://example.com/from-fixture">External Link</a>
  </body>
</html>`;

let fixture: http.Server;
let fixturePort: number;
let app: Express;

beforeAll(async () => {
  fixture = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address();
  if (!address || typeof address === 'string') throw new Error('fixture failed to bind');
  fixturePort = address.port;
  app = createApp(loadConfig({ ...process.env, CALAMOX_TOKEN: '' }));
});

afterAll(async () => {
  await closeBrowser();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
});

describe('POST /api/browser/open', () => {
  it(
    'opens a page and extracts title, text, and links',
    async () => {
      const res = await request(app).post('/api/browser/open').send({
        url: `http://127.0.0.1:${fixturePort}/`,
      });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Calamox Fixture Page');
      expect(res.body.text).toContain('marker text for the browser test');
      expect(res.body.links.some((l: { href: string }) => l.href.includes('example.com'))).toBe(true);
      expect(res.body.url).toContain(`127.0.0.1:${fixturePort}`);
    },
    60_000,
  );

  it('rejects an invalid URL with 400', async () => {
    const res = await request(app).post('/api/browser/open').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('rejects non-http(s) URLs with 400', async () => {
    const res = await request(app).post('/api/browser/open').send({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when url is missing', async () => {
    const res = await request(app).post('/api/browser/open').send({});
    expect(res.status).toBe(400);
  });
});
