import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { app } from 'electron';
import ffprobeStatic from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';

function unpacked(binPath: string): string {
  return binPath.replace(/\.asar([\\/])/, '.asar.unpacked$1');
}

function executable(binPath: string): boolean {
  try {
    accessSync(binPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function homebrewCandidates(name: string): string[] {
  if (process.platform === 'win32') return [];
  return [
    `/opt/homebrew/bin/${name}`,
    `/opt/homebrew/opt/ffmpeg/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`
  ];
}

export function ffprobePath(): string {
  // Try Homebrew first on macOS for full codec support, then fallback to bundled
  for (const candidate of homebrewCandidates('ffprobe')) {
    if (executable(candidate)) return candidate;
  }
  const bundled = unpacked(ffprobeStatic.path);
  if (executable(bundled)) return bundled;
  return bundled;
}

export function ffmpegPath(): string {
  for (const candidate of homebrewCandidates('ffmpeg')) {
    if (executable(candidate)) return candidate;
  }
  const resources = process.resourcesPath ? [join(process.resourcesPath, 'ffmpeg')] : [];
  const local = app?.isPackaged ? [] : [join(process.cwd(), 'resources', 'ffmpeg')];
  const bundled = ffmpegStatic ? [unpacked(ffmpegStatic)] : [];
  for (const candidate of [...resources, ...local, ...bundled]) {
    if (executable(candidate)) return candidate;
  }
  return 'ffmpeg';
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function run(
  binary: string,
  args: string[],
  options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<RunResult> {
  return new Promise(resolve => {
    try {
      execFile(
        binary,
        args,
        {
          timeout: options.timeout ?? 60_000,
          maxBuffer: 8 * 1024 * 1024,
          signal: options.signal
        },
        (error, stdout, stderr) => {
          const code =
            error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
              ? (error as NodeJS.ErrnoException & { code?: number }).code!
              : error
                ? 1
                : 0;
          resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '', code });
        }
      );
    } catch (err: any) {
      resolve({ stdout: '', stderr: err?.message || 'Execution error', code: 1 });
    }
  });
}
