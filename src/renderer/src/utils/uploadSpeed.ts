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
  const [, tick] = useState(0);

  useEffect(() => {
    if (!active) { samples.current = []; return; }
    samples.current.push({ at: Date.now(), bytes: uploadedBytes });
    // Twenty seconds of history: long enough to ride out one slow chunk, short
    // enough that a connection dropping away shows up quickly.
    const cutoff = Date.now() - 20000;
    while (samples.current.length > 2 && samples.current[0].at < cutoff) samples.current.shift();
  }, [uploadedBytes, active]);

  // Re-read on a timer as well, so a stall shows as a falling rate rather than
  // a number frozen at its last good value.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick(n => n + 1), 2000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active || samples.current.length < 2) return 0;
  const first = samples.current[0];
  const last = samples.current[samples.current.length - 1];
  const seconds = (Date.now() - first.at) / 1000;
  const bytes = last.bytes - first.bytes;
  if (seconds < 2 || bytes <= 0) return 0;
  return bytes / seconds;
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
