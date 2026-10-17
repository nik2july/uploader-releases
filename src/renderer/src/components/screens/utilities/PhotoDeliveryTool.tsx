/**
 * Photo Delivery — a shoot into a viewing set and a print set.
 *
 * Two presets, runnable together. The run itself lives in the main process, so
 * it carries on while another tool is on screen.
 */
import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { PHOTO_PRESETS } from '../../../../../shared/contracts';
import type { PhotoRunState } from '../../../../../shared/contracts';
import { fmtBytes, fmtDuration, fmtInt } from '../../../utils/utilityFormat';
import { CopyButton, DropZone, ProgressBar, StatBlock, ToolSection } from './parts';

export function PhotoDeliveryTool(): React.JSX.Element {
  const [run, setRun] = useState<PhotoRunState | null>(null);
  const [error, setError] = useState('');
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => { void window.api.photoState().then(setRun); return window.api.onPhotoState(setRun); }, []);

  async function choose(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Choose the folder of photos', 'Read This Folder');
    if (picked) void pick(picked);
  }

  async function pick(path: string): Promise<void> {
    setError('');
    try { await window.api.photoScan(path); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function chooseOutput(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Where should the delivery folders go?', 'Write Here');
    if (picked) { setError(''); await window.api.photoSetOutputRoot(picked); }
  }

  function togglePreset(id: string): void {
    if (!run) return;
    const next = run.presetIds.includes(id) ? run.presetIds.filter(one => one !== id) : [...run.presetIds, id];
    void window.api.photoSetPresets(next);
  }

  async function start(): Promise<void> {
    setError('');
    try { await window.api.photoStart(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const running = run?.state === 'running';
  const fraction = run && run.totalUnits > 0 ? run.completed / run.totalUnits : 0;
  const rate = run && run.elapsed > 0 ? run.completed / run.elapsed : 0;
  const eta = rate > 0 && run ? (run.totalUnits - run.completed) / rate : 0;
  const saved = run && run.bytesIn > 0 ? Math.round((1 - run.bytesOut / run.bytesIn) * 100) : 0;
  const wantsPrint = Boolean(run?.presetIds.includes('print'));

  return (
    <div className="tool-panel">
      <div className="tool-grid">
        <div className="panel tool-panel">
          <DropZone
            folder={run?.sourcePath ?? null}
            detail={run ? `${fmtInt(run.fileCount)} photos found` : 'Reading…'}
            emptyTitle="Drop the shoot here"
            emptyDetail="JPEG, PNG, HEIC and TIFF, in every subfolder"
            disabled={running}
            onChoose={() => { void choose(); }}
            onPick={path => { void pick(path); }}
          />

          <ToolSection title="Presets">
            {PHOTO_PRESETS.map(preset => (
              <button key={preset.id} type="button" className="preset-card" disabled={running}
                aria-pressed={Boolean(run?.presetIds.includes(preset.id))} onClick={() => togglePreset(preset.id)}>
                <div>
                  <div className="name">{preset.name}</div>
                  <div className="sub">{preset.subtitle}</div>
                  <div className="detail">{preset.detail}</div>
                </div>
              </button>
            ))}
            <p className="inline-note">
              Never upscales, never crops, bakes rotation into the pixels, forces sRGB, and drops
              maker notes, thumbnails and GPS. Photos already written are skipped.
            </p>
          </ToolSection>

          <ToolSection title="Where they go">
            <button onClick={() => { void chooseOutput(); }} disabled={running}>
              <FolderOpen size={14} /> {run?.outputRoot ? 'Change location' : 'Choose location'}
            </button>
            {run?.sourcePath && run.outputRoot ? (
              <p className="inline-note">
                {run.presetIds.length
                  ? PHOTO_PRESETS.filter(preset => run.presetIds.includes(preset.id))
                      .map(preset => `${run.sourcePath!.split('/').pop()} — ${preset.folderSuffix}`).join('  ·  ')
                  : 'Choose at least one preset.'}
              </p>
            ) : null}
          </ToolSection>

          <div className="actions">
            <button className="primary" disabled={!run?.fileCount || running || !run?.presetIds.length} onClick={() => { void start(); }}>
              Start
            </button>
            {running ? <button className="danger" onClick={() => { void window.api.photoCancel(); }}>Stop</button> : null}
            {run?.outputRoot && !running ? (
              <button className="text-button" onClick={() => { void window.api.openPath(run.outputRoot!); }}>Open location</button>
            ) : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="panel tool-panel">
          {!run || run.state === 'idle' ? (
            <div className="empty">
              <h3>Nothing chosen yet</h3>
              <p>4K Viewing for phones, TVs and laptops; 16×24 Print at 300 DPI for the lab. Both can run in one pass.</p>
            </div>
          ) : null}

          {run && run.state !== 'idle' ? (
            <>
              <div className="stat-row">
                <StatBlock value={`${fmtInt(run.completed)} / ${fmtInt(run.totalUnits || run.fileCount * Math.max(run.presetIds.length, 1))}`} label="Photos written" />
                <StatBlock value={run.bytesIn ? `${fmtBytes(run.bytesIn)} → ${fmtBytes(run.bytesOut)}` : '—'} label={run.bytesIn ? `${saved}% smaller` : 'Size'} />
                {run.skipped ? <StatBlock value={fmtInt(run.skipped)} label="Already existed" /> : null}
                {run.keptOriginal ? <StatBlock value={fmtInt(run.keptOriginal)} label="Originals kept" /> : null}
                {run.failed ? <StatBlock value={fmtInt(run.failed)} label="Failed" tone="stop" /> : null}
                {run.warnings.length && wantsPrint ? (
                  <button className="stat-block warn" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }}
                    onClick={() => setShowWarnings(value => !value)}>
                    <div className="value" style={{ color: '#8a6100' }}>{fmtInt(run.warnings.length)}</div>
                    <div className="label" style={{ textDecoration: 'underline' }}>too low-res for 16×24</div>
                  </button>
                ) : null}
              </div>

              {running ? (
                <>
                  <ProgressBar fraction={fraction} />
                  <p className="inline-note">
                    {run.currentLabel ? `${run.currentLabel} · ` : ''}
                    {rate > 0 ? `${rate.toFixed(1)} photos/sec · ${fmtDuration(eta)} left` : 'Starting…'}
                  </p>
                </>
              ) : null}

              {run.state === 'finished' ? (
                <div className="success">
                  {fmtInt(run.completed - run.failed)} photos written across {run.presetIds.length} preset
                  {run.presetIds.length === 1 ? '' : 's'}
                  {run.bytesIn ? ` · ${fmtBytes(run.bytesIn)} in → ${fmtBytes(run.bytesOut)} out (${saved}% smaller)` : ''}.
                </div>
              ) : null}

              {showWarnings && run.warnings.length ? (
                <ToolSection
                  title="Below the lab floor for a full-quality 16×24"
                  actions={<CopyButton className="text-button" label="Copy list"
                    text={() => run.warnings.map(warning => `${warning.path}  (${warning.longEdge} px · ${warning.dpiAt24in} DPI at 24 in)`).join('\n')} />}
                >
                  <div className="scroll-box short">
                    <table className="file-table">
                      <tbody>
                        {run.warnings.slice(0, 500).map(warning => (
                          <tr key={warning.path}>
                            <td>
                              <div>{warning.path.split('/').pop()}</div>
                              <div className="path">{warning.path}</div>
                            </td>
                            <td className="right">{fmtInt(warning.longEdge)} px</td>
                            <td className="right">{warning.dpiAt24in} DPI</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ToolSection>
              ) : null}

              {run.errors.length ? (
                <ToolSection title="Failed">
                  <div className="log-box">{run.errors.join('\n')}</div>
                </ToolSection>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
