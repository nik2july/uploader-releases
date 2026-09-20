/**
 * ffmpeg / ffprobe, wherever this Mac keeps them.
 *
 * Both ship with the app — ffprobe-static for measuring, ffmpeg-static for
 * encoding — so Clip Delivery works on a machine that has never seen Homebrew.
 * A copy in the app's `resources/` folder wins over the bundled one, so a build
 * can be given a different ffmpeg without a code change, and an installed
 * Homebrew copy is the last resort if the bundled binary is missing (it is
 * unpacked from the asar archive at build time, and a mistake there would
 * otherwise leave the studio with no encoder at all).
 */
import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { app } from 'electron';
import ffprobeStatic from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';
import type { UtilityToolsStatus } from '../../shared/contracts';

/** A binary cannot be executed from inside the asar archive. */
function unpacked(path: string): string {
  return path.replace(/\.asar([\\/])/, '.asar.unpacked$1');
}

function executable(path: string): boolean {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
}

export function ffprobePath(): string {
  const bundled = unpacked(ffprobeStatic.path);
  if (executable(bundled)) return bundled;
  for (const candidate of homebrewCandidates('ffprobe')) if (executable(candidate)) return candidate;
  return bundled;
}

function homebrewCandidates(name: string): string[] {
  if (process.platform === 'win32') return [];
  return [
    `/opt/homebrew/opt/ffmpeg-full/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ];
}

/** Where ffmpeg is looked for, in order. */
export function ffmpegCandidates(): string[] {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const resources = process.resourcesPath ? [join(process.resourcesPath, name)] : [];
  const local = app?.isPackaged ? [] : [join(process.cwd(), 'resources', name)];
  const bundled = ffmpegStatic ? [unpacked(ffmpegStatic)] : [];
  return [...resources, ...local, ...bundled, ...homebrewCandidates('ffmpeg')];
}

export function ffmpegPath(): string | null {
  return ffmpegCandidates().find(executable) ?? null;
}

export function toolsStatus(): UtilityToolsStatus {
  const ffmpeg = ffmpegPath();
  return {
    ffprobe: executable(ffprobePath()),
    ffmpeg: Boolean(ffmpeg),
    ffmpegPath: ffmpeg,
    searched: ffmpegCandidates(),
  };
}

export interface RunResult { stdout: string; stderr: string; code: number }

/** Runs a tool and returns what it said. Never throws for a non-zero exit. */
export function run(binary: string, args: string[], options: { timeout?: number; signal?: AbortSignal } = {}): Promise<RunResult> {
  return new Promise(resolve => {
    execFile(binary, args, { timeout: options.timeout ?? 60_000, maxBuffer: 4 * 1024 * 1024, signal: options.signal },
      (error, stdout, stderr) => {
        const code = error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
          ? Number((error as { code?: number }).code) : error ? 1 : 0;
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
      });
  });
}

/** One clip's length in seconds, or 0 when no reader could open it. */
export async function probeDuration(path: string, signal?: AbortSignal): Promise<number> {
  const { stdout, code } = await run(ffprobePath(),
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
    { timeout: 30_000, signal });
  if (code !== 0) return 0;
  const seconds = Number(stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}
