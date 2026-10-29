import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads 5 jobs sorted by name and counts the truncated line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts retries and keeps the last status', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the error of a failed job', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('keeps a null owner as null', () => {
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('digest/render')?.lastError).toBeNull();
  });

  it('keeps times as logged, offset included', () => {
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(row('lane/sync')?.runs).toBe(8);
    expect(row('lane/sync')?.retries).toBe(1);
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('gives no rows for an empty file', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts bad lines without throwing and skips blank lines', () => {
    const lines = [
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      'not json',
      '[1,2]',
      'null',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T02:00:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T02:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '',
      '{"at":"2026-01-01T03:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
      '{"at":"2026-01-01T04:00:00+01:00","job":"a","status":"ok","owner":"x"}',
    ];
    writeFileSync(join(dir, '2026-01-01.jsonl'), `${lines.join('\n')}\n\n`);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(6);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 3,
        retries: 0,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: '2026-01-01T01:00:00+01:00',
        lastAt: '2026-01-01T04:00:00+01:00',
      },
    ]);
  });
});
