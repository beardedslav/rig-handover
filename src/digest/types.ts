// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log; views render it as `—`
  runs: number; // lines for this job, every status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the last line that had one
  firstAt: string; // `at` as logged, offset kept
  lastAt: string;
};

export type DigestNight = {
  night: string; // YYYY-MM-DD, the file name
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse; counted, never thrown
};

// Reads `<runsDir>/<night>.jsonl`. Returns null when the night has no file;
// an empty file gives `rows: []`.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
