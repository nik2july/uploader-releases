import { app } from 'electron';

/**
 * Where releases are published. A public repository, so the check needs no
 * token — anything shipped inside the app is readable by whoever has the app.
 *
 * This holds releases only; the source stays private. Change it here if the
 * account or repository name is ever different.
 */
export const RELEASES_REPO = 'nik2july/uploader-releases';

export interface UpdateInfo {
  version: string;
  /** Where to send the studio to get it — the .dmg if the release has one. */
  url: string;
  notes: string;
  publishedAt: string;
}

/**
 * Compare two dotted version strings. Returns > 0 when `a` is newer.
 *
 * Deliberately not a semver library: releases here are plain x.y.z, and a
 * string comparison would call 1.10.0 older than 1.9.0.
 */
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
    if (!url || !/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(url)) return null;

    return {
      version,
      url,
      notes: (release.body || '').slice(0, 2000),
      publishedAt: release.published_at || '',
    };
  } catch {
    return null;
  }
}
