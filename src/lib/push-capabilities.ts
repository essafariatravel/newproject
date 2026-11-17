/**
 * Mobile Web Push display policy. On iOS, Safari/Chrome tabs do NOT expose
 * PushManager; the installed Home Screen web app does (iOS 16.4+).
 */
export function isIOSLikeDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iP(hone|ad|od)/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function pushAvailability(
  ios: boolean,
  standalone: boolean,
  supported: boolean,
): "install" | "unsupported" | "ready" {
  if (ios && !standalone) return "install";
  return supported ? "ready" : "unsupported";
}
