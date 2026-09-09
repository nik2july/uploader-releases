import { useEffect, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { UpdateInfo } from '../../../shared/contracts';

const DISMISSED = 'baawaray-uploader-dismissed-update';

/**
 * "There is a newer version" — and nothing more.
 *
 * The app is not signed with an Apple Developer ID, and macOS will not install
 * an update into an unsigned application: Apple's updater checks the signature
 * before it will replace anything. So this deliberately does not pretend to
 * update itself. It tells the studio a version exists and opens the download;
 * installing is a drag into Applications, the same as the first time.
 *
 * It also stays quiet about failure. A version check that could not reach
 * GitHub is not something to interrupt a two-terabyte upload with.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState<string>(() => {
    try { return localStorage.getItem(DISMISSED) || ''; } catch { return ''; }
  });

  useEffect(() => {
    let cancelled = false;
    const look = (): void => {
      void window.api.checkForUpdate()
        .then(found => { if (!cancelled) setUpdate(found); })
        .catch(() => { /* offline, rate-limited, no release yet — all fine */ });
    };
    look();
    // Six hours: often enough that nobody works a week behind, rare enough to
    // stay well inside GitHub's unauthenticated rate limit.
    const timer = setInterval(look, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (!update || dismissed === update.version) return null;

  function hide(version: string): void {
    setDismissed(version);
    try { localStorage.setItem(DISMISSED, version); } catch { /* fine, it reappears next launch */ }
  }

  return (
    <div className="update-banner" role="status">
      <ArrowDownToLine size={15} />
      <span>
        <strong>Version {update.version} is available.</strong>{' '}
        Download it, then drag it into Applications over the current app. Your transfers and
        Drive connection are kept.
      </span>
      <button className="primary" onClick={() => void window.api.openExternal(update.url)}>
        Download
      </button>
      <button className="icon-button" aria-label="Not now" onClick={() => hide(update.version)}>
        <X size={16} />
      </button>
    </div>
  );
}
