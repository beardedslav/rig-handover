import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

it('GET /api/digest/2026-10-28 lists jobs in job order', async () => {
  const res = await createApp(loadConfig()).request('/api/digest/2026-10-28');
  expect(res.status).toBe(200);
  const body = (await res.json()) as { rows: { job: string }[] };
  const jobs = body.rows.map((r) => r.job);
  expect(jobs).toHaveLength(5);
  expect(jobs).toEqual([...jobs].sort());
});
