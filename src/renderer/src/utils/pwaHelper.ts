export type PlatformType = 'mac' | 'ios' | 'android' | 'windows' | 'other';
export type BrowserType = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function detectPlatform(): PlatformType {
  if (typeof window === 'undefined') return 'other';
  const ua = window.navigator.userAgent.toLowerCase();

  // iOS detection
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }

  // Android detection
  if (/android/.test(ua)) {
    return 'android';
  }

  // macOS desktop detection
  if (/macintosh|mac os x/.test(ua)) {
    return 'mac';
  }

  // Windows detection
  if (/windows/.test(ua)) {
    return 'windows';
  }

  return 'other';
}

export function detectBrowser(): BrowserType {
  if (typeof window === 'undefined') return 'other';
  const ua = window.navigator.userAgent.toLowerCase();

  if (/edg\//.test(ua)) return 'edge';
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/chrome|crios/.test(ua) && !/edg\//.test(ua)) return 'chrome';
  if (/safari/.test(ua) && !/chrome|crios|edg\//.test(ua)) return 'safari';
  if (/firefox|fxios/.test(ua)) return 'firefox';

  return 'other';
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // Check display-mode standalone media query
  const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // Check iOS Safari standalone property
  const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  // Check Android/TWA referrer
  const isAndroidTWA = document.referrer.includes('android-app://');

  return isDisplayModeStandalone || isIosStandalone || isAndroidTWA;
}

export function isAppInstalledStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('baawaray_pwa_installed') === 'true';
  } catch {
    return false;
  }
}

export function setAppInstalledStored(installed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (installed) {
      localStorage.setItem('baawaray_pwa_installed', 'true');
    } else {
      localStorage.removeItem('baawaray_pwa_installed');
    }
  } catch {
    // Ignore localStorage errors
  }
}
