const STORAGE_KEY = 'somnet-video-aside-tab';

export type VideoAsideTab = 'feeds' | 'graph';

export function readVideoAsideTab(): VideoAsideTab | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (value === 'feeds' || value === 'graph') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeVideoAsideTab(tab: VideoAsideTab): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}
