import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig, type BridgeConfig } from '../src/config.js';

function cleanEnv(): NodeJS.ProcessEnv {
  return { ...process.env, CALAMOX_TOKEN: '' };
}

function configWith(overrides: Partial<BridgeConfig>): BridgeConfig {
  return { ...loadConfig(cleanEnv()), ...overrides };
}

let app: Express;
let authedApp: Express;

beforeAll(() => {
  app = createApp(configWith({}));
  authedApp = createApp(configWith({ token: 'sekret-token' }));
});

describe('POST /api/system/exec', () => {
  it('runs a command and returns stdout with exit code 0', async () => {
    const res = await request(app).post('/api/system/exec').send({ command: 'echo hello calamox' });
    expect(res.status).toBe(200);
    expect(res.body.exitCode).toBe(0);
    expect(res.body.stdout).toContain('hello calamox');
    expect(res.body.timedOut).toBe(false);
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('captures stderr separately', async () => {
    const res = await request(app).post('/api/system/exec').send({ command: 'echo oops 1>&2' });
    expect(res.status).toBe(200);
    expect(res.body.stdout).toBe('');
    expect(res.body.stderr).toContain('oops');
    expect(res.body.exitCode).toBe(0);
  });

  it('returns HTTP 500 with a non-zero exit code', async () => {
    const res = await request(app).post('/api/system/exec').send({ command: 'exit 3' });
    expect(res.status).toBe(500);
    expect(res.body.exitCode).toBe(3);
  });

  it('honors the cwd option', async () => {
    const res = await request(app).post('/api/system/exec').send({ command: 'pwd', cwd: '/tmp' });
    expect(res.status).toBe(200);
    expect(res.body.stdout.trim()).toBe('/tmp');
  });

  it('passes extra environment variables', async () => {
    const res = await request(app).post('/api/system/exec').send({
      command: 'printf "%s" "$CALAMOX_TEST_VAR"',
      env: { CALAMOX_TEST_VAR: 'bridge-works' },
    });
    expect(res.status).toBe(200);
    expect(res.body.stdout).toBe('bridge-works');
  });

  it('enforces the timeout and kills the process tree', async () => {
    const res = await request(app).post('/api/system/exec').send({
      command: 'sleep 30',
      timeoutMs: 400,
    });
    expect(res.status).toBe(504);
    expect(res.body.timedOut).toBe(true);
    expect(res.body.exitCode).toBeNull();
    expect(res.body.durationMs).toBeLessThan(5_000);
  });

  it('rejects a missing command with 400', async () => {
    const res = await request(app).post('/api/system/exec').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects an empty command with 400', async () => {
    const res = await request(app).post('/api/system/exec').send({ command: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('auth (CALAMOX_TOKEN set)', () => {
  it('returns 401 without a token', async () => {
    const res = await request(authedApp).post('/api/system/exec').send({ command: 'echo hi' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong token', async () => {
    const res = await request(authedApp)
      .post('/api/system/exec')
      .set('Authorization', 'Bearer nope')
      .send({ command: 'echo hi' });
    expect(res.status).toBe(401);
  });

  it('executes with the correct token', async () => {
    const res = await request(authedApp)
      .post('/api/system/exec')
      .set('Authorization', 'Bearer sekret-token')
      .send({ command: 'echo authed' });
    expect(res.status).toBe(200);
    expect(res.body.stdout).toContain('authed');
  });

  it('leaves /health unauthenticated', async () => {
    const res = await request(authedApp).get('/health');
    expect(res.status).toBe(200);
  });
});
