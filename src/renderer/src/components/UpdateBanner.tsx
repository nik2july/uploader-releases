import { useEffect, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { UpdateInfo } from '../../../shared/contracts';

const DISMISSED = 'baawaray-uploader-dismissed-update';

/**
 * "There is a newer version" — and, when the release ships a package, the
 * whole install.
 *
 * The app carries no Apple Developer ID, so Apple's own updater will not touch
 * it: Squirrel checks the signature of what it is replacing. Instead the app
 * fetches the new bundle itself, checks it over, and hands the swap to a script
 * that runs once this process has exited. A release with no zip asset falls
 * back to what this always did — open the download, drag it in by hand.
 *
 * It stays quiet about failure. A version check that could not reach GitHub is
 * not something to interrupt a two-terabyte upload with.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [stage, setStage] = useState<'idle' | 'downloading' | 'ready'>('idle');
  const [percent, setPercent] = useState(0);
  const [failed, setFailed] = useState('');
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

  useEffect(() => window.api.onUpdateProgress(({ received, total }) => {
    setPercent(total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0);
  }), []);

  if (!update || dismissed === update.version) return null;

  async function install(chosen: UpdateInfo): Promise<void> {
    setFailed('');
    if (!chosen.packageUrl) { void window.api.openExternal(chosen.url); return; }
    try {
      setStage('downloading');
      setPercent(0);
      await window.api.downloadUpdate(chosen);
      setStage('ready');
    } catch (error) {
      // Falling back to the manual download is always possible, so say so
      // rather than leaving the studio stuck on a broken button.
      setStage('idle');
      setFailed(error instanceof Error ? error.message : 'The update could not be downloaded.');
    }
  }

  function hide(version: string): void {
    setDismissed(version);
    try { localStorage.setItem(DISMISSED, version); } catch { /* fine, it reappears next launch */ }
  }

  return (
    <div className="update-banner" role="status">
      <ArrowDownToLine size={15} />
      <span>
        <strong>Version {update.version} is available.</strong>{' '}
        {stage === 'ready'
          ? 'Ready to install. The app closes, updates and reopens on its own — transfers in progress are paused and resume after.'
          : stage === 'downloading'
          ? `Downloading… ${percent}%`
          : update.packageUrl
          ? 'Install it without leaving the app. Your transfers, Drive and Backblaze connections are kept.'
          : 'Download it, then drag it into Applications over the current app. Your transfers and Drive connection are kept.'}
        {failed && <><br/><span className="error">{failed} You can still use Download to install it by hand.</span></>}
      </span>
      {stage === 'ready' ? (
        <button className="primary" onClick={() => void window.api.installUpdate()}>
          Install and restart
        </button>
      ) : (
        <button className="primary" disabled={stage === 'downloading'} onClick={() => void install(update)}>
          {stage === 'downloading' ? `${percent}%` : update.packageUrl ? 'Update now' : 'Download'}
        </button>
      )}
      {failed && (
        <button onClick={() => void window.api.openExternal(update.url)}>Download</button>
      )}
      <button className="icon-button" aria-label="Not now" onClick={() => hide(update.version)}>
        <X size={16} />
      </button>
    </div>
  );
}
