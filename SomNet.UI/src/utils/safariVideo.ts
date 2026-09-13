/** True for Safari (including iOS) — used for video playback UX tweaks. */
export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent;
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/i.test(ua);

  return isSafari;
}
