/**
 * The Utilities channels.
 *
 * Everything here works on folders the studio points at on this Mac — nothing
 * touches Drive, the queue or the studio's records — so these handlers are open
 * to any signed-in account rather than the owner alone: an editor measuring a
 * delivery is the whole point of the tool.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { toolsStatus } from './ffTools';
import { scanDurations } from './durationScan';
import { scanSequences } from './sequenceScan';
import { ClipDeliveryEngine, planForQuality, planForTargetSize } from './clipDelivery';
import { PhotoDeliveryRunner } from './photoDelivery';
import type {
  ClipPlan, ClipQuality, ClipRunState, ClipScanResult, DurationKind, DurationScanResult,
  PhotoRunState, SequenceScanOptions, SequenceScanResult,
} from '../../shared/contracts';

/**
 * `handle` from the main IPC module, passed in so these channels are registered
 * with the same trusted-frame check as every other one. Its handlers take
 * whatever the channel takes, which is what the `any` is for.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Register = (channel: string, fn: (...args: any[]) => unknown, requiresOwner?: boolean) => void;

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

/** A folder the studio picked. Rejects anything that is not a real directory. */
async function directory(input: unknown): Promise<string> {
  if (typeof input !== 'string' || !input || input.length > 4096) throw new Error('Choose a folder first.');
  const resolved = await fs.realpath(input);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error('That is not a folder.');
  return resolved;
}

export interface UtilitiesHandlers { shutdown: () => Promise<void> }

export function setupUtilityHandlers(handle: Register): UtilitiesHandlers {
  const clips = new ClipDeliveryEngine(state => broadcast('utility:clip', state));
  const photos = new PhotoDeliveryRunner(state => broadcast('utility:photo', state));

  // One scan at a time per tool: two ffprobe storms at once help nobody.
  let durationScan: AbortController | null = null;
  let sequenceScan: AbortController | null = null;

  handle('utility:status', () => toolsStatus(), false);

  handle('utility:chooseFolder', async (title: string, buttonLabel?: string) => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(window, {
      title: typeof title === 'string' ? title : 'Choose a folder',
      buttonLabel: typeof buttonLabel === 'string' ? buttonLabel : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
  }, false);

  /** A dropped item may be a file — take its folder in that case. */
  handle('utility:folderOf', async (input: string) => {
    if (typeof input !== 'string' || !input) return null;
    try {
      const stat = await fs.stat(input);
      return stat.isDirectory() ? input : path.dirname(input);
    } catch { return null; }
  }, false);

  handle('utility:reveal', async (target: string) => {
    if (typeof target !== 'string' || !target) return;
    shell.showItemInFolder(target);
  }, false);

  handle('utility:open', async (target: string) => {
    if (typeof target !== 'string' || !target) return;
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  }, false);

  handle('utility:saveText', async (defaultName: string, text: string) => {
    if (typeof text !== 'string' || text.length > 20_000_000) throw new Error('Nothing to save.');
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(window, {
      title: 'Save',
      defaultPath: typeof defaultName === 'string' ? defaultName : 'baawaray.txt',
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, text, 'utf8');
    return true;
  }, false);

  // MARK: Duration

  handle('utility:duration:scan', async (rootPath: string, kinds: DurationKind[]): Promise<DurationScanResult> => {
    const root = await directory(rootPath);
    const wanted = Array.isArray(kinds) ? kinds.filter(kind => kind === 'video' || kind === 'audio') : ['video' as const];
    durationScan?.abort();
    const controller = new AbortController();
    durationScan = controller;
    try {
      return await scanDurations(root, wanted, controller.signal, (done, total) => {
        broadcast('utility:duration:progress', { done, total });
      });
    } finally {
      if (durationScan === controller) durationScan = null;
    }
  }, false);

  handle('utility:duration:cancel', () => { durationScan?.abort(); }, false);

  // MARK: Missing Clips

  handle('utility:sequences:scan', async (rootPath: string, options: SequenceScanOptions): Promise<SequenceScanResult> => {
    const root = await directory(rootPath);
    if (!options || typeof options !== 'object') throw new Error('Invalid scan options.');
    sequenceScan?.abort();
    const controller = new AbortController();
    sequenceScan = controller;
    try {
      return await scanSequences(root, {
        mediaOnly: Boolean(options.mediaOnly),
        ignoreSidecars: Boolean(options.ignoreSidecars),
        combineAcrossSubfolders: Boolean(options.combineAcrossSubfolders),
        includeVideo: Boolean(options.includeVideo),
        includePhoto: Boolean(options.includePhoto),
        includeAudio: Boolean(options.includeAudio),
      }, controller.signal, seen => broadcast('utility:sequences:progress', { seen }));
    } finally {
      if (sequenceScan === controller) sequenceScan = null;
    }
  }, false);

  handle('utility:sequences:cancel', () => { sequenceScan?.abort(); }, false);

  // MARK: Clip Delivery

  handle('utility:clip:state', (): ClipRunState => clips.snapshot(), false);
  handle('utility:clip:scan', async (source: string): Promise<ClipScanResult> => clips.scan(await directory(source)), false);
  handle('utility:clip:destination', async (destination: string) => {
    clips.setDestination(await directory(destination));
  }, false);
  handle('utility:clip:start', async (destination: string, choice: { mode: 'quality' | 'size'; quality: ClipQuality; targetGB: number }) => {
    const resolved = await directory(destination);
    const scan = clips.snapshot().scan;
    if (!scan) throw new Error('Scan a source folder first.');
    if (resolved === scan.sourcePath || resolved.startsWith(scan.sourcePath + path.sep)) {
      throw new Error('Choose a destination outside the source folder so the originals are never touched.');
    }
    const plan: ClipPlan = choice?.mode === 'size'
      ? planForTargetSize(Math.max(1, Math.min(100_000, Number(choice.targetGB) || 500)), scan.clips)
      : planForQuality(['archive', 'balanced', 'compact'].includes(choice?.quality) ? choice.quality : 'balanced', scan.clips);
    clips.start(resolved, plan);
  }, false);
  handle('utility:clip:cancel', () => clips.cancel(), false);

  // MARK: Photo Delivery

  handle('utility:photo:state', (): PhotoRunState => photos.snapshot(), false);
  handle('utility:photo:scan', async (source: string): Promise<PhotoRunState> => photos.scan(await directory(source)), false);
  handle('utility:photo:presets', (presetIds: string[]) => {
    photos.setPresets(Array.isArray(presetIds) ? presetIds.filter(id => typeof id === 'string') : []);
  }, false);
  handle('utility:photo:outputRoot', async (outputRoot: string) => { photos.setOutputRoot(await directory(outputRoot)); }, false);
  handle('utility:photo:start', () => photos.start(), false);
  handle('utility:photo:cancel', () => photos.cancel(), false);

  return {
    shutdown: async () => {
      durationScan?.abort();
      sequenceScan?.abort();
      await Promise.all([clips.shutdown(), photos.shutdown()]);
    },
  };
}

/** Removes the channels this module registered, for a clean teardown in tests. */
export function removeUtilityHandlers(): void {
  for (const channel of [
    'utility:status', 'utility:chooseFolder', 'utility:folderOf', 'utility:reveal', 'utility:open',
    'utility:saveText', 'utility:duration:scan', 'utility:duration:cancel', 'utility:sequences:scan',
    'utility:sequences:cancel', 'utility:clip:state', 'utility:clip:scan', 'utility:clip:destination',
    'utility:clip:start', 'utility:clip:cancel', 'utility:photo:state', 'utility:photo:scan',
    'utility:photo:presets', 'utility:photo:outputRoot', 'utility:photo:start', 'utility:photo:cancel',
  ]) ipcMain.removeHandler(channel);
}
