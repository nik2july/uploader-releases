/**
 * Robust clipboard writing utility.
 *
 * Tries:
 * 1. Native Electron IPC via `window.api.copyToClipboard` (synchronous Cocoa NSPasteboard,
 *    never blocked by Chromium focus or sandbox policies).
 * 2. `navigator.clipboard.writeText` (modern web standard, allowed by session permission handlers).
 * 3. `document.execCommand('copy')` via offscreen textarea fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Native Electron IPC
  try {
    if (typeof window !== 'undefined' && window.api?.copyToClipboard) {
      const ok = await window.api.copyToClipboard(text);
      if (ok) return true;
    }
  } catch (err) {
    console.warn('[clipboard] Native IPC copy error:', err);
  }

  // 2. Modern Web Clipboard API
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[clipboard] Web Clipboard API error:', err);
  }

  // 3. Document execCommand fallback
  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) return true;
    }
  } catch (err) {
    console.warn('[clipboard] execCommand copy error:', err);
  }

  return false;
}
