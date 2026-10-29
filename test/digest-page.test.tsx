import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('GET /digest/:night', () => {
  it('renders a night and 404s a bad one', async () => {
    const app = createApp(loadConfig());
    const ok = await app.request('/digest/2026-10-28');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('<table>');
    expect((await app.request('/digest/nope')).status).toBe(404);
  });
});
