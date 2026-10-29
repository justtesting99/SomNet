const STORAGE_KEY = 'somnet-video-aside-tab';
const LEGACY_SESSION_KEY = 'somnet-video-aside-tab';

export type VideoAsideTab = 'feeds' | 'graph';

function readFromStorage(storage: Storage): VideoAsideTab | null {
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (value === 'feeds' || value === 'graph') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function readVideoAsideTab(): VideoAsideTab | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const fromLocal = readFromStorage(localStorage);
  if (fromLocal) {
    return fromLocal;
  }

  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const fromSession = readFromStorage(sessionStorage);
  if (fromSession) {
    try {
      localStorage.setItem(STORAGE_KEY, fromSession);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // ignore
    }
    return fromSession;
  }

  return null;
}

export function writeVideoAsideTab(tab: VideoAsideTab): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}
