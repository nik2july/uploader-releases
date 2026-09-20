/**
 * Clip Delivery — camera masters into files clients can actually play.
 *
 * The conversion itself runs in the main process, so leaving this page, or the
 * Utilities section altogether, does not stop it. The page reattaches to
 * whatever is running when it comes back.
 */
import { useEffect, useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { ClipQuality, ClipRunState } from '../../../../../shared/contracts';
import { fmtBytes, fmtDuration, fmtInt } from '../../../utils/utilityFormat';
import { DropZone, ProgressBar, StatBlock, ToolSection } from './parts';
import { clipCache } from './state';

const QUALITIES: { id: ClipQuality; name: string; blurb: string; recommended?: boolean }[] = [
  { id: 'archive', name: 'Highest', blurb: 'Near-master quality. Largest files.' },
  {
    id: 'balanced', name: 'Balanced', recommended: true,
    blurb: 'Excellent for viewing on any screen, and the settings used for our deliveries so far. 65 Mbps for 4K, 18 Mbps for HD.',
  },
  { id: 'compact', name: 'Compact', blurb: 'Still very good. Smallest files.' },
];

/** The same arithmetic the engine uses, so the page can show the estimate. */
const HD_RATIO = 0.28;
const UHD_BITRATE: Record<ClipQuality, number> = { archive: 90_000_000, balanced: 65_000_000, compact: 40_000_000 };

function estimate(clips: { width: number; duration: number; bytes: number }[], uhd: number, hd: number): number {
  let total = 0;
  for (const clip of clips) {
    const target = clip.width > 2000 ? uhd : hd;
    const source = clip.duration > 0 ? (clip.bytes * 8) / clip.duration : 0;
    const cap = source * 0.9;
    total += ((cap > 0 && cap < target ? cap : target) + 256_000) * clip.duration / 8;
  }
  return total;
}

function estimateForTarget(clips: { width: number; duration: number; bytes: number }[], targetGB: number): number {
  let lo = 2_000_000, hi = 300_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (estimate(clips, mid, mid * HD_RATIO) > targetGB * 1e9) hi = mid; else lo = mid;
  }
  const uhd = (lo + hi) / 2;
  return estimate(clips, uhd, uhd * HD_RATIO);
}

export function ClipDeliveryTool({ ffmpegAvailable }: { ffmpegAvailable: boolean }): React.JSX.Element {
  const [run, setRun] = useState<ClipRunState | null>(null);
  const [quality, setQuality] = useState<ClipQuality>(clipCache.quality);
  const [mode, setMode] = useState<'quality' | 'size'>(clipCache.mode);
  const [targetGB, setTargetGB] = useState(clipCache.targetGB);
  const [error, setError] = useState('');

  useEffect(() => { void window.api.clipState().then(setRun); return window.api.onClipState(setRun); }, []);
  useEffect(() => { clipCache.quality = quality; clipCache.mode = mode; clipCache.targetGB = targetGB; }, [quality, mode, targetGB]);

  const clips = run?.scan?.clips ?? [];
  const estimated = useMemo(() => {
    if (!clips.length) return 0;
    return mode === 'size'
      ? estimateForTarget(clips, targetGB)
      : estimate(clips, UHD_BITRATE[quality], UHD_BITRATE[quality] * HD_RATIO);
  }, [clips, mode, quality, targetGB]);

  async function chooseSource(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Choose the folder of camera masters', 'Read This Folder');
    if (picked) void pickSource(picked);
  }

  async function pickSource(path: string): Promise<void> {
    setError('');
    try { await window.api.clipScan(path); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function chooseDestination(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Where should the delivery files go?', 'Deliver Here');
    if (picked) { setError(''); await window.api.clipSetDestination(picked); }
  }

  async function start(): Promise<void> {
    if (!run?.destinationPath) { setError('Choose a destination folder first.'); return; }
    setError('');
    try { await window.api.clipStart(run.destinationPath, { mode, quality, targetGB }); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const running = run?.state === 'running';
  const scanning = run?.state === 'scanning';
  const fraction = run && run.totalDuration > 0 ? run.completedDuration / run.totalDuration : 0;
  const elapsed = run?.startedAt ? (Date.now() - run.startedAt) / 1000 : 0;
  const throughput = elapsed > 0 && run ? run.completedDuration / elapsed : 0;
  const eta = throughput > 0 && run ? (run.totalDuration - run.completedDuration) / throughput : 0;

  return (
    <div className="tool-panel">
      {!ffmpegAvailable ? (
        <p className="warning">
          The encoder that ships with the app could not be found, so nothing can be converted
          yet. Reinstalling the app usually puts it back; failing that,{' '}
          <code>brew install ffmpeg</code> gives this Mac one of its own. Everything else in
          Utilities works without it.
        </p>
      ) : null}

      <div className="tool-grid">
        <div className="panel tool-panel">
          <DropZone
            folder={run?.sourcePath ?? null}
            detail={run?.scan ? `${fmtInt(run.scan.clips.length)} clips · ${(run.scan.totalDuration / 3600).toFixed(2)} h · ${fmtBytes(run.scan.totalBytes)}` : 'Reading…'}
            emptyTitle="Drop the camera masters here"
            emptyDetail="MP4, MOV, MXF and M4V, in every subfolder"
            disabled={running || scanning}
            onChoose={() => { void chooseSource(); }}
            onPick={path => { void pickSource(path); }}
          />

          <ToolSection title="Destination">
            <button onClick={() => { void chooseDestination(); }} disabled={running}>
              <FolderOpen size={14} /> {run?.destinationPath ? 'Change destination' : 'Choose destination'}
            </button>
            {run?.destinationPath ? <p className="inline-note" title={run.destinationPath}>{run.destinationPath}</p> : null}
            <p className="inline-note">Originals are never modified. A run can be stopped and picked up again later.</p>
          </ToolSection>

          <ToolSection title="How big">
            <div className="segmented">
              <button aria-current={mode === 'quality'} onClick={() => setMode('quality')}>By quality</button>
              <button aria-current={mode === 'size'} onClick={() => setMode('size')}>By target size</button>
            </div>

            {mode === 'quality' ? (
              <div style={{ marginTop: 4 }}>
                {QUALITIES.map(option => (
                  <button key={option.id} type="button" className="preset-card" aria-pressed={quality === option.id}
                    disabled={running} onClick={() => setQuality(option.id)}>
                    <div>
                      <div className="name">
                        {option.name}
                        {option.recommended ? <span className="badge-recommended">RECOMMENDED</span> : null}
                      </div>
                      <div className="sub">{option.blurb}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <label className="check-label" style={{ gap: 12 }}>
                <input type="number" min={1} max={100000} value={targetGB} disabled={running}
                  onChange={event => setTargetGB(Math.max(1, Number(event.target.value) || 1))} style={{ width: 120 }} />
                GB in total
              </label>
            )}
            {clips.length ? <p className="inline-note">Estimated output: {fmtBytes(estimated)}</p> : null}
          </ToolSection>

          <div className="actions">
            <button className="primary" disabled={!clips.length || running || !ffmpegAvailable} onClick={() => { void start(); }}>
              {run?.state === 'paused' || run?.state === 'finished' ? 'Continue' : 'Start converting'}
            </button>
            {running ? <button className="danger" onClick={() => { void window.api.clipCancel(); }}>Stop</button> : null}
            {run?.destinationPath && !running ? (
              <button className="text-button" onClick={() => { void window.api.openPath(run.destinationPath!); }}>Open destination</button>
            ) : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="panel tool-panel">
          {scanning ? (<><p className="muted">Reading clip properties…</p><ProgressBar fraction={run?.scanProgress ?? 0} /></>) : null}

          {!run?.scan && !scanning ? (
            <div className="empty">
              <h3>Nothing read yet</h3>
              <p>H.264 High / 8-bit 4:2:0 / Rec.709 / AAC in an MP4 — plays on effectively any phone, TV or laptop.</p>
            </div>
          ) : null}

          {run?.scan ? (
            <>
              <div className="stat-row">
                <StatBlock value={`${fmtInt(run.completedCount)} / ${fmtInt(run.totalCount)}`} label="Clips converted" />
                <StatBlock value={fmtBytes(run.bytesWritten)} label="Written" />
                {run.scan.hlgCount ? <StatBlock value={fmtInt(run.scan.hlgCount)} label="HLG → Rec.709" /> : null}
                {run.scan.highFPSCount ? <StatBlock value={fmtInt(run.scan.highFPSCount)} label="90fps+ halved" /> : null}
                {run.failures.length ? <StatBlock value={fmtInt(run.failures.length)} label="Failed" tone="stop" /> : null}
              </div>

              {running || run.state === 'paused' ? (
                <>
                  <ProgressBar fraction={fraction} />
                  <p className="inline-note">
                    {run.currentFile ? `${run.currentFile} · ` : ''}
                    {throughput > 0 ? `${throughput.toFixed(1)}× realtime · ${fmtDuration(eta)} left` : 'Starting…'}
                  </p>
                </>
              ) : null}

              {run.state === 'finished' ? <p className="success">Finished — every output was length-checked against its source.</p> : null}
              {run.state === 'paused' ? <p className="notice">Stopped. Starting again picks up where it left off.</p> : null}

              {run.failures.length ? (
                <ToolSection title="Failed">
                  <div className="log-box">{run.failures.join('\n')}</div>
                </ToolSection>
              ) : null}

              <ToolSection title="Log">
                <div className="log-box">{run.log.join('\n')}</div>
              </ToolSection>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
