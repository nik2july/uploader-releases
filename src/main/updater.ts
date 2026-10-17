import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { log } from './log';
import type { UpdateInfo } from '../shared/contracts';

/**
 * Where releases are published. A public repository, so the check needs no
 * token — anything shipped inside the app is readable by whoever has the app.
 *
 * This holds releases only; the source stays private. Change it here if the
 * account or repository name is ever different.
 */
export const RELEASES_REPO = 'nik2july/uploader-releases';

export type { UpdateInfo } from '../shared/contracts';

/**
 * Compare two dotted version strings. Returns > 0 when `a` is newer.
 *
 * Deliberately not a semver library: releases here are plain x.y.z, and a
 * string comparison would call 1.10.0 older than 1.9.0.
 */
/** Releases are only ever fetched from GitHub's own hosts. */
export function trustedReleaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * The .app bundle the running process lives inside.
 *
 * Everything the installer does is scoped to this path, so it is derived from
 * the running executable rather than guessed at or taken from the renderer.
 * Returns null when the app is not running from a bundle at all — a dev run,
 * for instance — which is the signal to refuse to install.
 */
export function appBundlePath(execPath: string): string | null {
  const marker = '.app/Contents/MacOS/';
  const at = execPath.indexOf(marker);
  return at === -1 ? null : execPath.slice(0, at + '.app'.length);
}

export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] =>
    value.replace(/^v/i, '').split('.').map(piece => Number.parseInt(piece, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Ask GitHub whether there is a newer release than the running app.
 *
 * Returns null for "nothing new" and for every failure alike. A studio in the
 * middle of a two-terabyte upload does not need to hear that a version check
 * timed out, and the uploader works perfectly well without ever running one.
 */
export async function checkForUpdate(currentVersion = app.getVersion()): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Baawaray-Uploader' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;

    const release = await response.json() as {
      tag_name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean;
      assets?: { name: string; browser_download_url: string }[];
    };
    if (!release.tag_name || release.draft || release.prerelease) return null;

    const version = release.tag_name.replace(/^v/i, '');
    if (compareVersions(version, currentVersion) <= 0) return null;

    // Link straight at the disk image when the release has one, so "Download"
    // is one click rather than a hunt through a releases page.
    const dmg = release.assets?.find(asset => asset.name.toLowerCase().endsWith('.dmg'));
    const url = dmg?.browser_download_url || release.html_url;
    if (!url || !trustedReleaseUrl(url)) return null;

    const zip = release.assets?.find(asset => /-mac\.zip$/i.test(asset.name));
    const packageUrl = zip && trustedReleaseUrl(zip.browser_download_url) ? zip.browser_download_url : undefined;

    return {
      version,
      url,
      packageUrl,
      notes: (release.body || '').slice(0, 2000),
      publishedAt: release.published_at || '',
    };
  } catch {
    return null;
  }
}

/** Where a downloaded update is unpacked before it replaces anything. */
function stagingDirectory(): string {
  return join(app.getPath('userData'), 'updates');
}

/** Runs a command and resolves only when it exits cleanly. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

/** Reads one key out of a bundle's Info.plist, which is usually a binary plist. */
async function bundleVersion(bundle: string): Promise<string> {
  const plist = join(bundle, 'Contents', 'Info.plist');
  const json = await new Promise<string>((resolve, reject) => {
    const child = spawn('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]);
    let out = '';
    child.stdout.on('data', chunk => { out += String(chunk); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error('Could not read the downloaded app.')));
  });
  return String(JSON.parse(json).CFBundleShortVersionString || '');
}

/**
 * Fetch the new version and unpack it, leaving it staged beside the app.
 *
 * Nothing is replaced here. The download is checked over while the current app
 * is still the one running, so a truncated or wrong-version package is caught
 * before it can become the app the studio opens tomorrow.
 */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!info.packageUrl || !trustedReleaseUrl(info.packageUrl)) {
    throw new Error('This release has no installable package. Use Download to install it by hand.');
  }
  const staging = stagingDirectory();
  await run('/bin/rm', ['-rf', staging]).catch(async () => {
    await fs.rm(staging, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  });
  await fs.mkdir(staging, { recursive: true, mode: 0o700 });

  const archive = join(staging, 'update.zip');
  const response = await fetch(info.packageUrl, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Could not download the update (status ${response.status}).`);
  const total = Number(response.headers.get('content-length') || 0);

  let received = 0;
  const body = Readable.fromWeb(response.body as never);
  body.on('data', (chunk: Buffer) => { received += chunk.length; onProgress(received, total); });
  await pipeline(body, createWriteStream(archive), { signal });

  if (total > 0 && received !== total) throw new Error('The download ended early. Try again when the connection is steady.');

  // ditto reads the archives electron-builder writes, keeping symlinks and the
  // bundle's permissions intact — unzip flattens both and breaks the app.
  const unpacked = join(staging, 'unpacked');
  await fs.mkdir(unpacked, { recursive: true });
  await run('/usr/bin/ditto', ['-x', '-k', archive, unpacked]);
  await fs.rm(archive, { force: true });

  const entries = await fs.readdir(unpacked);
  const bundle = entries.filter(name => name.endsWith('.app')).map(name => join(unpacked, name))[0];
  if (!bundle) throw new Error('The downloaded package did not contain an application.');

  const version = await bundleVersion(bundle);
  if (version !== info.version) {
    throw new Error(`The download says it is version ${version || 'unknown'}, not ${info.version}. Nothing was changed.`);
  }
  // Ad-hoc signatures still verify structurally, so this catches a mangled
  // bundle even though it cannot prove who built it.
  await run('/usr/bin/codesign', ['--verify', '--no-strict', bundle]);
  // Without this macOS treats the replaced app as freshly downloaded and
  // refuses to open it until someone clicks through a warning.
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', bundle]).catch(() => {});

  log(`update ${info.version} staged`);
  return bundle;
}

/**
 * Swap the staged bundle in for the running one and reopen it.
 *
 * The swap cannot happen from inside the app it is replacing, so it is handed
 * to a small script that waits for this process to exit first. The old bundle
 * is moved aside rather than deleted, and put back if either move fails, so a
 * half-finished install leaves the studio with the version they already had
 * rather than with nothing.
 */
export async function installUpdate(staged: string, execPath = app.getPath('exe')): Promise<void> {
  if (!app.isPackaged) throw new Error('Updates install into a packaged app only.');
  const target = appBundlePath(execPath);
  if (!target) throw new Error('This app is not running from an application bundle.');
  try {
    await fs.access(target, (await import('node:fs')).constants.W_OK);
  } catch {
    throw new Error('This copy of the app cannot be written to. Move it to your Applications folder and try again.');
  }

  const script = join(stagingDirectory(), 'install.sh');
  await fs.writeFile(script, `#!/bin/bash
# Arguments, never interpolated, so a path with spaces or quotes stays a path.
PID="$1"; STAGED="$2"; TARGET="$3"; BACKUP="$4"
for _ in $(seq 1 600); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
if kill -0 "$PID" 2>/dev/null; then exit 1; fi
rm -rf "$BACKUP"
mv "$TARGET" "$BACKUP" || exit 1
if ! mv "$STAGED" "$TARGET"; then mv "$BACKUP" "$TARGET"; open -a "$TARGET"; exit 1; fi
if [ ! -x "$TARGET/Contents/MacOS" ] && [ ! -d "$TARGET/Contents/MacOS" ]; then
  rm -rf "$TARGET"; mv "$BACKUP" "$TARGET"; open -a "$TARGET"; exit 1
fi
rm -rf "$BACKUP"
open -a "$TARGET"
`, { mode: 0o700 });

  const backup = `${target}.replaced`;
  log(`installing update over ${target}`);
  spawn('/bin/bash', [script, String(process.pid), staged, target, backup], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}
