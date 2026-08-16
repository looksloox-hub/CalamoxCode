import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: Express;

beforeAll(() => {
  app = createApp(loadConfig({ ...process.env, CALAMOX_TOKEN: '' }));
});

describe('service routes', () => {
  it('serves the dashboard UI at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Calamox Bridge');
    expect(res.text).toContain('System Exec');
  });

  it('exposes service info as JSON at /api/info', async () => {
    const res = await request(app).get('/api/info');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Calamox Execution Bridge');
    expect(res.body.endpoints.systemExec).toBe('POST /api/system/exec');
  });

  it('returns JSON 404 for unknown /api paths', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
