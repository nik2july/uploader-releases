import type { ClipDeliveryEngine } from './clipDelivery';
import type { DropboxDeliverablesManager } from './dropboxManager';
import type { LutConverterEngine } from './lutConverter';

export const clipDeliveryEngineRef: { current: ClipDeliveryEngine | null } = { current: null };
export const dropboxManagerRef: { current: DropboxDeliverablesManager | null } = { current: null };
export const lutEngineRef: { current: LutConverterEngine | null } = { current: null };
