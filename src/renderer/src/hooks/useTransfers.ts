import { useCallback, useEffect, useState } from 'react';
import type { DriveStatus, Transfer } from '../../../shared/contracts';

interface TransfersState { transfers: Transfer[]; drive: DriveStatus | null; error: string; loading: boolean }

/**
 * The queue lives in the main process — it has to, because it must keep running
 * with the window closed and survive a crash. The renderer therefore holds no
 * copy of its own: it reads the journal and re-reads it whenever the engine says
 * something moved, which is also what makes a second window impossible to
 * desynchronise.
 */
export function useTransfers(): TransfersState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<TransfersState>({ transfers: [], drive: null, error: '', loading: true });
  const refresh = useCallback(async () => {
    try {
      const [transfers, drive] = await Promise.all([window.api.list(), window.api.driveStatus()]);
      setState({ transfers, drive, error: '', loading: false });
    } catch (err) {
      setState(old => ({ ...old, loading: false, error: err instanceof Error ? err.message : 'Could not read the transfer queue.' }));
    }
  }, []);
  useEffect(() => {
    void refresh();
    return window.api.onChange(() => { void refresh(); });
  }, [refresh]);
  return { ...state, refresh };
}
