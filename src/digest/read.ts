// Plan morning-digest § 1: read one night's run log into one row per job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

const isStatus = (value: unknown): value is RunStatus =>
  typeof value === 'string' && STATUSES.includes(value);

// Parse one line at the edge. null means a bad line.
function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { at, job, status, owner, error } = record;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  return {
    at,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines += 1;
      continue;
    }
    const row = rows.get(run.job);
    if (row === undefined) {
      rows.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.owner = run.owner;
    row.runs += 1;
    if (run.status === 'retry') row.retries += 1;
    row.lastStatus = run.status;
    row.lastAt = run.at;
    if (run.error !== null) row.lastError = run.error;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines };
};
