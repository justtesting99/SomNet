/** Phase 3 soak: visible in browser DevTools (not the API console). Set VITE_VIDEO_DEBUG=false to silence. */
export function isVideoDebugLoggingEnabled(): boolean {
  const flag = import.meta.env.VITE_VIDEO_DEBUG;
  if (flag === 'false') {
    return false;
  }

  return true;
}

export function logVideoEvent(message: string, detail?: Record<string, unknown>): void {
  if (!isVideoDebugLoggingEnabled()) {
    return;
  }

  if (detail) {
    console.info(message, detail);
    return;
  }

  console.info(message);
}
