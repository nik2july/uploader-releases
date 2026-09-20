/**
 * What each tool remembers while you are using another one.
 *
 * Clip Delivery and Photo Delivery run in the main process, so their work
 * carries on regardless; these are the answers the interface would otherwise
 * lose when the section unmounts — a measured shoot that took four minutes to
 * read, the folders ticked off it, the message written for a client.
 */
import type { DurationScanResult, SequenceScanResult } from '../../../../../shared/contracts';
import { defaultReportOptions } from '../../../utils/sequenceReport';
import type { ReportOptions } from '../../../utils/sequenceReport';
import type { SequenceScanOptions } from '../../../../../shared/contracts';

export type UtilityTool = 'duration' | 'missing' | 'clips' | 'photos';

export const utilitiesCache: { tool: UtilityTool } = { tool: 'duration' };

export const durationCache: {
  folder: string | null;
  result: DurationScanResult | null;
  manualExclusions: Set<string>;
  includeVideo: boolean;
  includeAudio: boolean;
  mode: 'folders' | 'files' | 'types';
} = {
  folder: null, result: null, manualExclusions: new Set(),
  includeVideo: true, includeAudio: false, mode: 'folders',
};

export const missingCache: {
  folder: string | null;
  result: SequenceScanResult | null;
  scanOptions: SequenceScanOptions;
  reportOptions: ReportOptions;
  durations: Record<string, number>;
  withDuration: boolean;
} = {
  folder: null,
  result: null,
  scanOptions: {
    mediaOnly: true, ignoreSidecars: true, combineAcrossSubfolders: false,
    includeVideo: true, includePhoto: true, includeAudio: true,
  },
  reportOptions: { ...defaultReportOptions },
  durations: {},
  withDuration: false,
};

export const clipCache: { quality: 'archive' | 'balanced' | 'compact'; mode: 'quality' | 'size'; targetGB: number } = {
  quality: 'balanced', mode: 'quality', targetGB: 500,
};
