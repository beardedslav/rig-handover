import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Route tests for GET /digest/:night (HTML) and GET /api/digest/:night (JSON). Fixtures live in a
// temp runs dir; runs/ is never written.

const line = (fields: Record<string, unknown>) => JSON.stringify(fields);

// Night with three retries then ok (flagged), a fail (flagged), a clean job, and an owner-less job.
// Lines are out of job order on purpose: the output must be sorted by job.
const FULL_NIGHT = [
  line({ at: '2026-10-29T05:00:04+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
  line({ at: '2026-10-29T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:31:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:33:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: '2026-10-29T01:37:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-29T02:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-29T05:41:09+01:00', job: 'digest/render', status: 'ok', owner: null }),
].join('\n');
const FULL_JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];

const BAD_LINE_NIGHT = [
  line({ at: '2026-10-28T08:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  'this is not json',
  line({ at: '2026-10-28T09:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-28T09:30:00+01:00', job: 'notes/backup', status: 'ok', owner: 'lane-07' }),
].join('\n');

const decode = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Parses the body rows of the digest table: cell text (decoded) and whether the row is flagged.
function pageRows(html: string) {
  return [...html.matchAll(/<tr(?: class="([^"]+)")?>([\s\S]*?)<\/tr>/g)]
    .map((m) => ({
      warn: m[1] === 'warn',
      cells: [...m[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => decode(c[1] ?? '')),
    }))
    .filter((row) => row.cells.length > 0);
}

type Job = { job: string; owner: string | null; runs: number; retries: number; lastStatus: string; lastError: string | null; firstAt: string; lastAt: string };

describe('digest routes', () => {
  let runsDir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), `${FULL_NIGHT}\n`);
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), `${BAD_LINE_NIGHT}\n`);
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
    app = createApp(config);
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  describe('night with a file', () => {
    it('HTML: 200, jobs in job order, flagged rows marked, owner null as dash', async () => {
      const res = await app.request('/digest/2026-10-29');
      expect(res.status).toBe(200);
      const rows = pageRows(await res.text());
      expect(rows.map((r) => r.cells[0].replace(' ⚠', ''))).toEqual(FULL_JOBS);

      const byJob = Object.fromEntries(rows.map((r) => [r.cells[0].replace(' ⚠', ''), r]));
      expect(byJob['fixtures/refresh'].warn).toBe(true);
      expect(byJob['fixtures/refresh'].cells[3]).toBe('3');
      expect(byJob['notes/backup'].warn).toBe(true);
      expect(byJob['notes/backup'].cells[4]).toBe('fail');
      expect(byJob['lane/sync'].warn).toBe(false);
      expect(byJob['digest/render'].cells[1]).toBe('—');
    });

    it('JSON: 200, same jobs in order, owner null stays null', async () => {
      const res = await app.request('/api/digest/2026-10-29');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { night: string; rows: Job[]; badLines: number };
      expect(body.night).toBe('2026-10-29');
      expect(body.badLines).toBe(0);
      expect(body.rows.map((r) => r.job)).toEqual(FULL_JOBS);

      const byJob = Object.fromEntries(body.rows.map((r) => [r.job, r]));
      expect(byJob['fixtures/refresh']).toMatchObject({ owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok' });
      expect(byJob['notes/backup']).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
      expect(byJob['digest/render'].owner).toBeNull();
    });
  });

  describe('night without a file, or invalid night', () => {
    it.each(['/digest/2026-10-30', '/digest/nope'])('HTML %s: 404', async (path) => {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('no run log');
    });

    it.each(['/api/digest/2026-10-30', '/api/digest/nope'])('JSON %s: 404 with error', async (path) => {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'no run log' });
    });
  });

  describe('empty night', () => {
    it('HTML: 200 and says nothing ran', async () => {
      const res = await app.request('/digest/2026-10-27');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table>');
    });

    it('JSON: 200 with no rows', async () => {
      const res = await app.request('/api/digest/2026-10-27');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
    });
  });

  describe('night with a bad line', () => {
    it('HTML: 200, good rows rendered, says one line did not parse', async () => {
      const res = await app.request('/digest/2026-10-28');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(decode(html)).toContain("1 line(s) in the log didn't parse");
      const rows = pageRows(html);
      expect(rows.map((r) => r.cells[0])).toEqual(['lane/sync', 'notes/backup']);
    });

    it('JSON: 200, badLines 1, good rows still there', async () => {
      const res = await app.request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rows: Job[]; badLines: number };
      expect(body.badLines).toBe(1);
      expect(body.rows.map((r) => [r.job, r.runs, r.owner])).toEqual([
        ['lane/sync', 2, 'rook'],
        ['notes/backup', 1, 'lane-07'],
      ]);
    });
  });

  describe('page and JSON agree', () => {
    it('same jobs, same order, same flags for one night', async () => {
      const page = pageRows(await (await app.request('/digest/2026-10-29')).text());
      const json = (await (await app.request('/api/digest/2026-10-29')).json()) as { rows: Job[] };

      expect(page.map((r) => r.cells[0].replace(' ⚠', ''))).toEqual(json.rows.map((r) => r.job));
      expect(page.map((r) => r.warn)).toEqual(
        json.rows.map((r) => r.retries >= 3 || r.lastStatus === 'fail'),
      );
      expect(page.map((r) => r.cells[3])).toEqual(json.rows.map((r) => String(r.retries)));
    });
  });
});
