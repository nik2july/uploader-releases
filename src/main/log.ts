import { app } from 'electron';
import { appendFileSync, readFileSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A short diary of what the app did, kept on disk.
 *
 * Written because "it does not connect" is not something anybody can act on,
 * and a studio in the middle of a wedding cannot be asked to open developer
 * tools. Every step of a sign-in is recorded, so a failure names the step it
 * failed at rather than leaving the screen blank.
 *
 * Deliberately holds no secrets: tokens, codes and the client secret are never
 * written, because this file exists to be sent to someone for help.
 */
const MAX_BYTES = 512 * 1024;

function file(): string {
  return join(app.getPath('userData'), 'uploader.log');
}

export function log(step: string, detail?: unknown): void {
  try {
    const path = file();
    try { if (statSync(path).size > MAX_BYTES) renameSync(path, path + '.1'); } catch { /* first write */ }
    const extra = detail === undefined ? ''
      : ` ${typeof detail === 'string' ? detail : (detail as Error)?.message || JSON.stringify(detail)}`;
    appendFileSync(path, `${new Date().toISOString()}  ${step}${extra}\n`);
  } catch { /* logging must never be the thing that breaks the app */ }
}

/** The tail of the diary, for the studio to copy and send on. */
export function recentLog(lines = 120): string {
  try {
    return readFileSync(file(), 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return 'No log yet.';
  }
}
