/**
 * Duration — how long is this shoot?
 *
 * Point it at a folder and it walks every subfolder, measures each clip and
 * gives one total, plus a breakdown you can read three ways: by folder, every
 * file, or by file type. Nothing is written and nothing is re-encoded.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, ChevronDown, ChevronRight, Eye, EyeOff, FileWarning, FolderOpen, RefreshCw } from 'lucide-react';
import type { DurationFile, DurationKind, DurationScanResult } from '../../../../../shared/contracts';
import {
  applyExclusions, buildTree, byExtension, csvText, excludedFolders, flatten, folderLine,
  includedFiles, summaryText, totalsFor, unreadableList, unreadableNames,
} from '../../../utils/durationTree';
import type { DurationFolderNode } from '../../../utils/durationTree';
import { fmtBytes, fmtClock, fmtClockPadded, fmtInt } from '../../../utils/utilityFormat';
import { CopyButton, DropZone, ProgressBar, StatBlock, ToolSection } from './parts';
import { durationCache } from './state';

type Mode = 'folders' | 'files' | 'types';
type Sort = 'path' | 'longest' | 'shortest' | 'largest';

const SKIP_KEY = 'baawaray.utilities.duration.skipNames';

/** Lowercased folder names from the skip field. */
function skipNameSet(value: string): Set<string> {
  return new Set(value.split(',').map(name => name.trim().toLowerCase()).filter(Boolean));
}

export function DurationTool(): React.JSX.Element {
  const [folder, setFolder] = useState<string | null>(durationCache.folder);
  const [result, setResult] = useState<DurationScanResult | null>(durationCache.result);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [includeVideo, setIncludeVideo] = useState(durationCache.includeVideo);
  const [includeAudio, setIncludeAudio] = useState(durationCache.includeAudio);
  const [skipNames, setSkipNames] = useState(() => localStorage.getItem(SKIP_KEY) ?? '');
  const [manualExclusions, setManualExclusions] = useState<Set<string>>(durationCache.manualExclusions);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(durationCache.mode);
  const [sort, setSort] = useState<Sort>('path');
  const [showUnreadable, setShowUnreadable] = useState(false);
  const scanToken = useRef(0);

  // Keep what was measured while the studio is off using another tool.
  useEffect(() => {
    durationCache.folder = folder;
    durationCache.result = result;
    durationCache.manualExclusions = manualExclusions;
    durationCache.includeVideo = includeVideo;
    durationCache.includeAudio = includeAudio;
    durationCache.mode = mode;
  }, [folder, result, manualExclusions, includeVideo, includeAudio, mode]);

  useEffect(() => window.api.onDurationProgress(setProgress), []);

  const kinds = useMemo<DurationKind[]>(() => {
    const wanted: DurationKind[] = [];
    if (includeVideo) wanted.push('video');
    if (includeAudio) wanted.push('audio');
    return wanted.length ? wanted : ['video'];
  }, [includeVideo, includeAudio]);

  async function scan(root: string, wanted: DurationKind[], keepExclusions: boolean): Promise<void> {
    const token = ++scanToken.current;
    setScanning(true); setError(''); setProgress({ done: 0, total: 0 });
    if (!keepExclusions) setManualExclusions(new Set());
    try {
      const scanned = await window.api.scanDurations(root, wanted);
      if (token !== scanToken.current) return;
      setResult(scanned);
    } catch (err) {
      if (token === scanToken.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (token === scanToken.current) setScanning(false);
    }
  }

  /**
   * Turning a kind on or off changes what there is to measure, so the folder is
   * read again — but the folders ticked off by hand are kept, because they are
   * about this shoot rather than about this scan.
   */
  function setKind(kind: DurationKind, on: boolean): void {
    const nextVideo = kind === 'video' ? on : includeVideo;
    const nextAudio = kind === 'audio' ? on : includeAudio;
    setIncludeVideo(nextVideo);
    setIncludeAudio(nextAudio);
    const wanted: DurationKind[] = [];
    if (nextVideo) wanted.push('video');
    if (nextAudio) wanted.push('audio');
    if (folder) void scan(folder, wanted.length ? wanted : ['video'], true);
  }

  function pick(path: string): void {
    setFolder(path);
    setResult(null);
    void scan(path, kinds, false);
  }

  async function choose(): Promise<void> {
    const picked = await window.api.chooseUtilityFolder('Choose a folder — every subfolder is measured too.', 'Measure This Folder');
    if (picked) pick(picked);
  }

  // The tree, and the totals the exclusions leave standing. Rebuilt whenever
  // the exclusions change: nothing is rescanned, because every clip was
  // measured either way.
  const view = useMemo(() => {
    if (!result) return null;
    const root = buildTree(result);
    const names = skipNameSet(skipNames);
    const seeded = names.size
      ? flatten(root).filter(node => node.path && names.has(node.name.toLowerCase())).map(node => node.path)
      : [];
    const excluded = new Set([...manualExclusions, ...seeded]);
    applyExclusions(root, excluded);
    const files = includedFiles(root);
    return { root, files, excluded, totals: totalsFor(root, files), nameSeeded: new Set(seeded) };
  }, [result, manualExclusions, skipNames]);

  const sortedFiles = useMemo(() => {
    if (!view) return [];
    const files = [...view.files];
    if (sort === 'longest') return files.sort((a, b) => b.duration - a.duration);
    if (sort === 'shortest') return files.sort((a, b) => a.duration - b.duration);
    if (sort === 'largest') return files.sort((a, b) => b.bytes - a.bytes);
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));
  }, [view, sort]);

  function toggleExclusion(node: DurationFolderNode): void {
    if (!node.path) return;  // leaving out everything would just be an empty screen
    setManualExclusions(current => {
      const next = new Set(current);
      // A folder the skip list put there is dropped by ticking it back on.
      if (next.has(node.path)) next.delete(node.path);
      else if (view?.nameSeeded.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }

  function toggleCollapse(path: string): void {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  const rootName = result?.rootName ?? '';
  const totals = view?.totals;
  const hiddenFolders = view ? excludedFolders(view.root) : [];

  const rows: DurationFolderNode[] = useMemo(() => {
    if (!view) return [];
    const out: DurationFolderNode[] = [];
    (function walk(node: DurationFolderNode): void {
      out.push(node);
      if (collapsed.has(node.path)) return;
      for (const child of node.subfolders) walk(child);
    })(view.root);
    return out;
  }, [view, collapsed]);

  return (
    <div className="tool-panel">
      <div className="tool-grid">
        <div className="panel tool-panel">
          <DropZone
            folder={folder}
            detail={result ? `${fmtInt(result.files.length)} files measured` : 'Measuring…'}
            emptyTitle="Drop a folder here"
            emptyDetail="Every subfolder is measured too"
            disabled={scanning}
            onChoose={() => { void choose(); }}
            onPick={pick}
          />

          <ToolSection title="What to count">
            <div className="option-list">
              <label className="check-label">
                <input type="checkbox" checked={includeVideo} disabled={scanning}
                  onChange={event => setKind('video', event.target.checked)} />
                Video
              </label>
              <label className="check-label">
                <input type="checkbox" checked={includeAudio} disabled={scanning}
                  onChange={event => setKind('audio', event.target.checked)} />
                Audio <span className="inline-note">(WAV recorder files)</span>
              </label>
            </div>
          </ToolSection>

          <ToolSection title="Skip folders">
            <input
              className="inline-input"
              placeholder="Proxies, proxy, Audio"
              value={skipNames}
              onChange={event => { setSkipNames(event.target.value); localStorage.setItem(SKIP_KEY, event.target.value); }}
            />
            <p className="inline-note">
              Matched at any depth, ignoring case, and remembered between launches. Folders you tick
              off by hand are kept separately, so editing this never wipes them.
            </p>
          </ToolSection>

          <div className="actions">
            <button disabled={!folder || scanning} onClick={() => { if (folder) void scan(folder, kinds, true); }}>
              <RefreshCw size={14} /> Rescan
            </button>
            {scanning ? <button className="danger" onClick={() => { void window.api.cancelDurationScan(); }}>Stop</button> : null}
            {view && view.excluded.size > 0 ? (
              <button className="text-button" onClick={() => setManualExclusions(new Set())} title="Clears folders ticked off by hand">
                Count everything
              </button>
            ) : null}
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="panel tool-panel">
          {scanning ? (
            <>
              <p className="muted">
                Measuring {progress.total ? `${fmtInt(progress.done)} of ${fmtInt(progress.total)}` : 'files'}…
              </p>
              <ProgressBar fraction={progress.total ? progress.done / progress.total : 0} indeterminate={!progress.total} />
            </>
          ) : null}

          {!result && !scanning ? (
            <div className="empty">
              <h3>Nothing measured yet</h3>
              <p>Choose a folder and every clip beneath it is timed — MP4, MOV, MXF, MTS, R3D and the rest.</p>
            </div>
          ) : null}

          {result && totals && view ? (
            <>
              <div className="stat-row">
                <StatBlock value={fmtClockPadded(totals.duration)} label={`Total runtime · ${(totals.duration / 3600).toFixed(2)} hours`} />
                <StatBlock value={fmtInt(totals.count)} label="Clips" />
                <StatBlock value={fmtBytes(totals.bytes)} label="Size" />
                <StatBlock value={fmtClock(totals.average)} label="Average" />
                {totals.unreadable.length ? (
                  <button className="stat-block stop" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }}
                    onClick={() => setShowUnreadable(value => !value)}>
                    <div className="value" style={{ color: 'var(--burgundy)' }}>{fmtInt(totals.unreadable.length)}</div>
                    <div className="label" style={{ textDecoration: 'underline' }}>unreadable</div>
                  </button>
                ) : null}
              </div>

              {totals.excludedDuration > 0 ? (
                <p className="notice">
                  Not counting {fmtClockPadded(totals.excludedDuration)} in {hiddenFolders.length} folder
                  {hiddenFolders.length === 1 ? '' : 's'} — {hiddenFolders.map(node => node.path).join(', ')}
                </p>
              ) : null}

              {showUnreadable && totals.unreadable.length ? (
                <div className="warning">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <strong>{fmtInt(totals.unreadable.length)} file(s) could not be read — counted as zero</strong>
                    <CopyButton className="text-button" label="Copy list" text={() => unreadableList(rootName, totals.unreadable)} />
                  </div>
                  <div className="scroll-box short" style={{ marginTop: 8 }}>
                    <table className="file-table">
                      <tbody>
                        {totals.unreadable.map(file => (
                          <tr key={file.relativePath}>
                            <td>
                              <div>{file.name}</div>
                              <div className="path">{file.folderPath || rootName}</div>
                            </td>
                            <td className="right">{fmtBytes(file.bytes)}</td>
                            <td className="right">
                              <button className="icon-button" title="Reveal in Finder"
                                onClick={() => { void window.api.revealInFinder(`${result.rootPath}/${file.relativePath}`); }}>
                                <FolderOpen size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="segmented">
                {(['folders', 'files', 'types'] as Mode[]).map(option => (
                  <button key={option} aria-current={mode === option} onClick={() => setMode(option)}>
                    {option === 'folders' ? 'By folder' : option === 'files' ? 'Every file' : 'By file type'}
                  </button>
                ))}
              </div>

              {mode === 'folders' ? (
                <div className="scroll-box">
                  <div className="folder-tree">
                    {rows.map(node => (
                      <FolderRow
                        key={node.path || '·root'}
                        node={node}
                        rootName={rootName}
                        rootTotal={view.root.rawDuration}
                        collapsed={collapsed.has(node.path)}
                        onToggleCollapse={() => toggleCollapse(node.path)}
                        onToggleExclusion={() => toggleExclusion(node)}
                        onReveal={() => { void window.api.revealInFinder(node.path ? `${result.rootPath}/${node.path}` : result.rootPath); }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {mode === 'files' ? (
                <div className="scroll-box">
                  <table className="file-table">
                    <thead>
                      <tr>
                        <th onClick={() => setSort('path')}>Path {sort === 'path' ? '↓' : ''}</th>
                        <th onClick={() => setSort(sort === 'longest' ? 'shortest' : 'longest')} className="right">
                          Length {sort === 'longest' ? '↓' : sort === 'shortest' ? '↑' : ''}
                        </th>
                        <th onClick={() => setSort('largest')} className="right">Size {sort === 'largest' ? '↓' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFiles.map(file => <FileRow key={file.relativePath} file={file} rootName={rootName} />)}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {mode === 'types' ? (
                <table className="file-table">
                  <thead><tr><th>Type</th><th className="right">Clips</th><th className="right">Runtime</th><th className="right">Size</th></tr></thead>
                  <tbody>
                    {byExtension(view.files).map(row => (
                      <tr key={row.ext}>
                        <td>{row.ext}</td>
                        <td className="right">{fmtInt(row.count)}</td>
                        <td className="right">{fmtClockPadded(row.duration)}</td>
                        <td className="right">{fmtBytes(row.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <div className="actions">
                <CopyButton className="primary" label="Copy summary" text={() => summaryText(rootName, view.root, view.files)} />
                <button onClick={() => {
                  void window.api.saveTextFile(`Duration — ${rootName.replace(/\//g, '-')}.csv`, csvText(rootName, view.root, sortedFiles));
                }}>Save CSV</button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FolderRow({ node, rootName, rootTotal, collapsed, onToggleCollapse, onToggleExclusion, onReveal }: {
  node: DurationFolderNode; rootName: string; rootTotal: number; collapsed: boolean;
  onToggleCollapse: () => void; onToggleExclusion: () => void; onReveal: () => void;
}): React.JSX.Element {
  const share = rootTotal > 0 ? (node.isExcluded ? node.rawDuration : node.totalDuration) / rootTotal : 0;
  const ownShown = node.subfolders.length > 0 && node.ownCount > 0;
  return (
    <div className={`folder-row${node.isExcluded ? ' excluded' : ''}`} style={{ paddingLeft: 8 + node.depth * 16 }}>
      <div className="name">
        {node.subfolders.length ? (
          <button className="icon-button" onClick={onToggleCollapse} title={collapsed ? 'Show subfolders' : 'Hide subfolders'}>
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : <span style={{ width: 13 }} />}
        <span title={node.path || rootName}>{node.path ? node.name : rootName}</span>
        {node.unreadableCount > 0 ? (
          <span title={unreadableNames(node)} style={{ color: 'var(--burgundy)', lineHeight: 0 }}>
            <AlertTriangle size={13} />
          </span>
        ) : null}
        {ownShown ? (
          <span className="inline-note" title="Sitting directly in this folder">
            · {fmtInt(node.ownCount)} here, {fmtClockPadded(node.ownDuration)}
          </span>
        ) : null}
      </div>
      <div className="clock">{node.isExcluded ? `(${fmtClockPadded(node.rawDuration)})` : fmtClockPadded(node.totalDuration)}</div>
      <div className="count">{fmtInt(node.isExcluded ? node.rawCount : node.totalCount)} clips</div>
      <div className="row-actions">
        <CopyButton title="Copy this folder's line" text={() => folderLine(node, rootName)} />
        <button className="icon-button" title="Reveal in Finder" onClick={onReveal}><FolderOpen size={14} /></button>
        {node.path ? (
          <button className="icon-button" title={node.isExcluded ? 'Count this folder' : 'Leave this folder out'} onClick={onToggleExclusion}>
            {node.isExcluded ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        ) : <span style={{ width: 26 }} />}
      </div>
      <div className="share"><span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} /></div>
    </div>
  );
}

function FileRow({ file, rootName }: { file: DurationFile; rootName: string }): React.JSX.Element {
  return (
    <tr className={file.duration <= 0 ? 'unreadable' : undefined}>
      <td>
        <div>{file.name} {file.duration <= 0 ? <FileWarning size={12} style={{ verticalAlign: '-2px' }} /> : null}</div>
        <div className="path">{file.folderPath || rootName}</div>
      </td>
      <td className="right">{file.duration > 0 ? fmtClockPadded(file.duration) : <span title="No reader could open this file"><Ban size={13} /></span>}</td>
      <td className="right">{fmtBytes(file.bytes)}</td>
    </tr>
  );
}
