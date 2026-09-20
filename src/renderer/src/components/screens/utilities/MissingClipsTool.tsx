/**
 * Missing Clips — the gap in the camera numbering, and the message about it.
 *
 * Every subfolder is checked, paths in the report are relative to the folder
 * that was picked, and the message is deliberately short. The gap check itself
 * only reads filenames, which is why it finishes in a second or two; measuring
 * runtimes means opening every clip, so "With duration" is opt-in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import type { ClipSequence, SequenceScanOptions, SequenceScanResult } from '../../../../../shared/contracts';
import {
  buildMessage, detailedReport, isComplete, locationLabel, missingNumbers, missingSummary,
  patternLabel, totalMissing,
} from '../../../utils/sequenceReport';
import type { ReportOptions } from '../../../utils/sequenceReport';
import { fmtClockPadded, fmtInt } from '../../../utils/utilityFormat';
import { CopyButton, DropZone, ProgressBar, StatBlock, ToolSection } from './parts';
import { missingCache } from './state';

export function MissingClipsTool(): React.JSX.Element {
  const [folder, setFolder] = useState<string | null>(missingCache.folder);
  const [result, setResult] = useState<SequenceScanResult | null>(missingCache.result);
  const [scanOptions, setScanOptions] = useState<SequenceScanOptions>(missingCache.scanOptions);
  const [reportOptions, setReportOptions] = useState<ReportOptions>(missingCache.reportOptions);
  const [scanning, setScanning] = useState(false);
  const [seen, setSeen] = useState(0);
  const [error, setError] = useState('');
  const [withDuration, setWithDuration] = useState(missingCache.withDuration);
  const [durations, setDurations] = useState<Record<string, number>>(missingCache.durations);
  const [measuring, setMeasuring] = useState(false);
  const [measured, setMeasured] = useState({ done: 0, total: 0 });
  const [edited, setEdited] = useState<string | null>(null);
  const token = useRef(0);

  useEffect(() => {
    missingCache.folder = folder;
    missingCache.result = result;
    missingCache.scanOptions = scanOptions;
    missingCache.reportOptions = reportOptions;
    missingCache.durations = durations;
    missingCache.withDuration = withDuration;
  }, [folder, result, scanOptions, reportOptions, durations, withDuration]);

  useEffect(() => window.api.onSequenceProgress(progress => setSeen(progress.seen)), []);
  useEffect(() => window.api.onDurationProgress(progress => setMeasured(progress)), []);

  async function scan(root: string, options: SequenceScanOptions): Promise<void> {
    const attempt = ++token.current;
    setScanning(true); setError(''); setSeen(0); setDurations({}); setEdited(null);
    try {
      const scanned = await window.api.scanSequences(root, options);
      if (attempt !== token.current) return;
      setResult(scanned);
      if (withDuration) void measure(root);
    } catch (err) {
      if (attempt === token.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (attempt === token.current) setScanning(false);
    }
  }

  /**
   * Runtimes per folder, so a heading can read "01 - Bride Vatna — 00:21:11".
   * Deliberately separate from the gap check: on a 580-clip delivery this is
   * about half a minute, and it is not what the tool is for.
   */
  async function measure(root: string): Promise<void> {
    setMeasuring(true);
    try {
      const scanned = await window.api.scanDurations(root, scanOptions.includeAudio ? ['video', 'audio'] : ['video']);
      const map: Record<string, number> = {};
      for (const file of scanned.files) map[file.folderPath] = (map[file.folderPath] ?? 0) + file.duration;
      setDurations(map);
    } catch { /* the headings simply stay without a runtime */ }
    finally { setMeasuring(false); }
  }

  function pick(path: string): void {
    setFolder(path);
    setResult(null);
    if (!reportOptions.projectName) {
      setReportOptions(options => ({ ...options, projectName: path.split('/').filter(Boolean).pop() ?? '' }));
    }
    void scan(path, scanOptions);
  }

  async function choose(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Select the master folder you received from the client.', 'Check This Folder');
    if (picked) pick(picked);
  }

  function setScanOption(patch: Partial<SequenceScanOptions>): void {
    const next = { ...scanOptions, ...patch };
    setScanOptions(next);
    if (folder) void scan(folder, next);
  }

  function toggleDurations(on: boolean): void {
    setWithDuration(on);
    if (!on) { setDurations({}); return; }
    if (folder) void measure(folder);
  }

  /** Total runtime behind one heading — a heading can span several folders. */
  function durationFor(sequences: ClipSequence[]): number | null {
    if (!Object.keys(durations).length) return null;
    const folders = new Set<string>();
    for (const sequence of sequences) for (const one of sequence.folders) folders.add(one);
    if (!folders.size) folders.add('');
    let total = 0;
    for (const one of folders) total += durations[one] ?? 0;
    return total > 0 ? total : null;
  }

  const message = useMemo(() => {
    if (!result) return '';
    return edited ?? buildMessage(result, reportOptions);
  }, [result, reportOptions, edited]);

  const grouped = useMemo(() => {
    if (!result) return [];
    const shown = reportOptions.includeComplete ? result.sequences : result.sequences.filter(sequence => !isComplete(sequence));
    const groups = new Map<string, ClipSequence[]>();
    for (const sequence of shown) {
      const label = locationLabel(sequence);
      const bucket = groups.get(label);
      if (bucket) bucket.push(sequence); else groups.set(label, [sequence]);
    }
    return [...groups.entries()];
  }, [result, reportOptions.includeComplete]);

  const missing = result ? totalMissing(result) : 0;
  const received = result ? result.sequences.reduce((sum, sequence) => sum + sequence.numbers.length, 0) : 0;

  return (
    <div className="tool-panel">
      <div className="tool-grid">
        <div className="panel tool-panel">
          <DropZone
            folder={folder}
            detail={result ? `${fmtInt(result.totalFiles)} files checked` : 'Checking…'}
            emptyTitle="Drop the client's folder here"
            emptyDetail="Filenames only — this takes a second or two"
            disabled={scanning}
            onChoose={() => { void choose(); }}
            onPick={pick}
          />

          <ToolSection title="What to check">
            <div className="option-list">
              <label className="check-label">
                <input type="checkbox" checked={scanOptions.includeVideo} onChange={e => setScanOption({ includeVideo: e.target.checked })} /> Video
              </label>
              <label className="check-label">
                <input type="checkbox" checked={scanOptions.includePhoto} onChange={e => setScanOption({ includePhoto: e.target.checked })} /> Photos
              </label>
              <label className="check-label">
                <input type="checkbox" checked={scanOptions.includeAudio} onChange={e => setScanOption({ includeAudio: e.target.checked })} /> Audio
              </label>
              <label className="check-label">
                <input type="checkbox" checked={scanOptions.ignoreSidecars} onChange={e => setScanOption({ ignoreSidecars: e.target.checked })} />
                Ignore sidecars <span className="inline-note">(LRF, THM, XML…)</span>
              </label>
              <label className="check-label">
                <input type="checkbox" checked={scanOptions.combineAcrossSubfolders} onChange={e => setScanOption({ combineAcrossSubfolders: e.target.checked })} />
                Merge subfolders <span className="inline-note">(100MEDIA → 101MEDIA)</span>
              </label>
              <label className="check-label">
                <input type="checkbox" checked={withDuration} disabled={!result || measuring} onChange={e => toggleDurations(e.target.checked)} />
                With duration <span className="inline-note">(opens every clip)</span>
              </label>
            </div>
          </ToolSection>

          <ToolSection title="The message">
            <input
              className="inline-input"
              placeholder="Project name"
              value={reportOptions.projectName}
              onChange={event => { setEdited(null); setReportOptions(options => ({ ...options, projectName: event.target.value })); }}
            />
            <div className="option-list">
              <label className="check-label">
                <input type="checkbox" checked={reportOptions.detailed} onChange={e => { setEdited(null); setReportOptions(o => ({ ...o, detailed: e.target.checked })); }} />
                Detailed report <span className="inline-note">(counts, date, sign-off)</span>
              </label>
              <label className="check-label">
                <input type="checkbox" checked={reportOptions.includeComplete} onChange={e => { setEdited(null); setReportOptions(o => ({ ...o, includeComplete: e.target.checked })); }} />
                List complete folders too
              </label>
              {reportOptions.detailed ? (
                <>
                  <label className="check-label">
                    <input type="checkbox" checked={reportOptions.useEmoji} onChange={e => { setEdited(null); setReportOptions(o => ({ ...o, useEmoji: e.target.checked })); }} /> Emoji
                  </label>
                  <label className="check-label">
                    <input type="checkbox" checked={reportOptions.showDate} onChange={e => { setEdited(null); setReportOptions(o => ({ ...o, showDate: e.target.checked })); }} /> Show the date
                  </label>
                </>
              ) : null}
            </div>
          </ToolSection>

          <div className="actions">
            <button disabled={!folder || scanning} onClick={() => { if (folder) void scan(folder, scanOptions); }}>
              <RefreshCw size={14} /> Rescan
            </button>
            {scanning ? <button className="danger" onClick={() => { void window.api.cancelSequenceScan(); }}>Stop</button> : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="panel tool-panel">
          {scanning ? (<><p className="muted">Reading filenames — {fmtInt(seen)} so far…</p><ProgressBar fraction={0} indeterminate /></>) : null}
          {measuring ? (
            <>
              <p className="muted">Measuring runtimes — {fmtInt(measured.done)} of {fmtInt(measured.total)}…</p>
              <ProgressBar fraction={measured.total ? measured.done / measured.total : 0} indeterminate={!measured.total} />
            </>
          ) : null}

          {!result && !scanning ? (
            <div className="empty">
              <h3>Nothing checked yet</h3>
              <p>Cameras number what they record, so a gap is a file that did not arrive. Point this at the folder the client sent.</p>
            </div>
          ) : null}

          {result ? (
            <>
              <div className="stat-row">
                <StatBlock value={fmtInt(received)} label="Files received" />
                <StatBlock value={fmtInt(missing)} label={missing === 0 ? 'Nothing missing' : `Missing clip${missing === 1 ? '' : 's'}`} tone={missing ? 'stop' : undefined} />
                <StatBlock value={fmtInt(result.sequences.length)} label="Sequences" />
                {result.unnumberedCount ? <StatBlock value={fmtInt(result.unnumberedCount)} label="Not numbered" tone="warn" /> : null}
              </div>

              <ToolSection title="Folders">
                <div className="scroll-box short">
                  {grouped.map(([label, sequences]) => {
                    const runtime = durationFor(sequences);
                    return (
                      <div key={label} className="sequence-card">
                        <header>
                          <div className="folder">
                            <span title={label}>{label}</span>
                            {runtime ? <span className="inline-note">— {fmtClockPadded(runtime)}</span> : null}
                          </div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <CopyButton title="Copy this folder's heading" text={() => (runtime ? `${label} — ${fmtClockPadded(runtime)}` : label)} />
                            <button className="icon-button" title="Reveal in Finder"
                              onClick={() => {
                                const relative = sequences[0].folder || sequences[0].folders[0] || '';
                                void window.api.revealInFinder(relative ? `${result.rootPath}/${relative}` : result.rootPath);
                              }}>
                              <FolderOpen size={14} />
                            </button>
                          </div>
                        </header>
                        {sequences.map(sequence => {
                          const gaps = missingNumbers(sequence);
                          return (
                            <div key={sequence.id} style={{ marginTop: 6 }}>
                              <div className="inline-note">
                                {sequence.displayExt.toUpperCase()} · {fmtInt(sequence.numbers.length)} file
                                {sequence.numbers.length === 1 ? '' : 's'}
                                {sequences.length > 1 ? ` · ${patternLabel(sequence)}` : ''}
                              </div>
                              <div className="ends">
                                {sequence.numbers.length === 1
                                  ? `Only clip: ${sequence.firstName}`
                                  : `First: ${sequence.firstName} · Last: ${sequence.lastName}`}
                              </div>
                              {gaps.length ? (
                                <div className="missing">Missing ({gaps.length}): {missingSummary(sequence, reportOptions.maxMissingListed)}</div>
                              ) : (
                                <div className="present">All clips present</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!grouped.length ? <p className="muted">No numbered clips were found in this folder.</p> : null}
                </div>
              </ToolSection>

              <ToolSection title="Message">
                <textarea className="message-box" value={message} onChange={event => setEdited(event.target.value)} />
                <div className="actions">
                  <CopyButton className="primary" label="Copy message" text={() => message} />
                  <button onClick={() => {
                    const base = (reportOptions.projectName || result.rootName).replace(/\//g, '-');
                    void window.api.saveTextFile(`Clip Check - ${base}.txt`, detailedReport(result, reportOptions));
                  }}>Save report</button>
                  {edited ? <button className="text-button" onClick={() => setEdited(null)}>Reset to generated</button> : null}
                </div>
              </ToolSection>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
