import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 1023px)';

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => setIsMobile(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

export function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}
