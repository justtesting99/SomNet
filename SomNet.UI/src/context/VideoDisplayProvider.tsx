import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useOptions } from '@/context/OptionsProvider';
import type { VideoExpandMode } from '@/types/videoDisplay';
import { isMobileViewport } from '@/hooks/useIsMobileViewport';

interface VideoDisplayContextValue {
  expandMode: VideoExpandMode;
  setExpandMode: (mode: VideoExpandMode) => void;
  expandOnAction: () => void;
  closeExpanded: () => void;
}

const VideoDisplayContext = createContext<VideoDisplayContextValue | null>(null);

export function VideoDisplayProvider({ children }: { children: ReactNode }) {
  const [expandMode, setExpandMode] = useState<VideoExpandMode>('none');
  const { options } = useOptions();

  const closeExpanded = useCallback(() => {
    setExpandMode('none');
  }, []);

  const expandOnAction = useCallback(() => {
    if (!isMobileViewport() || !options.autoExpandVideoOnMobile) {
      return;
    }
    setExpandMode(options.mobileVideoExpandDefault);
  }, [options.autoExpandVideoOnMobile, options.mobileVideoExpandDefault]);

  useEffect(() => {
    if (expandMode === 'none') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeExpanded();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandMode, closeExpanded]);

  const value = useMemo(
    () => ({
      expandMode,
      setExpandMode,
      expandOnAction,
      closeExpanded,
    }),
    [expandMode, expandOnAction, closeExpanded],
  );

  return (
    <VideoDisplayContext.Provider value={value}>{children}</VideoDisplayContext.Provider>
  );
}

export function useVideoDisplay(): VideoDisplayContextValue {
  const context = useContext(VideoDisplayContext);
  if (!context) {
    throw new Error('useVideoDisplay must be used within a VideoDisplayProvider');
  }
  return context;
}
