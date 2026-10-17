/** Formatting the Utilities tools share, matching the standalone app's output. */

export function fmtInt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0';
}

/** File-style bytes, as macOS writes them: "4.4 GB", "812 KB". */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Zero KB';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  if (unit === 0) return `${Math.round(value)} bytes`;
  if (unit === 1) return `${Math.round(value)} KB`;
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** Rough and readable: "2h 14m", "45s". */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

/** Exact, timecode-style: "12:04:37" or "04:37". */
export function fmtClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Zero-padded so a column of them lines up: "00:04:37". */
export function fmtClockPadded(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--:--';
  const total = Math.round(seconds);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}
