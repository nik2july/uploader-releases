import { useEffect, useRef, useState } from 'react';
import { formatBytes } from './uploadFormat';

/**
 * How fast it is actually going.
 *
 * Measured from what the queue reports rather than from anything the network
 * layer claims, so it reflects bytes Drive has confirmed rather than bytes
 * handed to a socket. Averaged over a short window because a chunked upload is
 * bursty by nature: an instantaneous figure swings between zero and the link
 * speed and tells the studio nothing.
 *
 * Returns bytes per second, or 0 when there is not enough history to say.
 */
export function useTransferSpeed(uploadedBytes: number, active: boolean): number {
  const samples = useRef<{ at: number; bytes: number }[]>([]);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    if (!active) { samples.current = []; return; }
    samples.current.push({ at: Date.now(), bytes: uploadedBytes });
    // Twenty seconds of history: long enough to ride out one slow chunk, short
    // enough that a connection dropping away shows up quickly.
    const cutoff = Date.now() - 20000;
    while (samples.current.length > 2 && samples.current[0].at < cutoff) samples.current.shift();
  }, [uploadedBytes, active]);

  // The rate is computed in an effect and held in state, never read off the ref
  // while rendering. It is also recomputed on a timer, so a stall shows as a
  // falling rate rather than a number frozen at its last good value.
  useEffect(() => {
    // Functional updates throughout: React bails out when the value is
    // unchanged, so a rate that has not moved does not re-render the screen
    // every two seconds behind a running upload.
    const settle = (next: number): void => setRate(current => (current === next ? current : next));
    const recompute = (): void => {
      const history = samples.current;
      if (!active || history.length < 2) { settle(0); return; }
      const seconds = (Date.now() - history[0].at) / 1000;
      const bytes = history[history.length - 1].bytes - history[0].bytes;
      settle(seconds >= 2 && bytes > 0 ? bytes / seconds : 0);
    };
    recompute();
    if (!active) return;
    const timer = setInterval(recompute, 2000);
    return () => clearInterval(timer);
  }, [active, uploadedBytes]);

  return rate;
}

export function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : '';
}

/** Time remaining at the current rate, in words rather than a ticking clock. */
export function formatEta(remainingBytes: number, bytesPerSecond: number): string {
  if (bytesPerSecond <= 0 || remainingBytes <= 0) return '';
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 90) return 'under 2 minutes left';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} minutes left`;
  const hours = seconds / 3600;
  if (hours < 10) return `about ${hours.toFixed(1).replace('.0', '')} hours left`;
  return `about ${Math.round(hours)} hours left`;
}
