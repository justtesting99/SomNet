import { useCallback, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 350;

export function useDoubleActivate(onActivate?: () => void, intervalMs = DEFAULT_INTERVAL_MS) {
  const lastActivation = useRef(0);

  const onDoubleClick = useCallback(() => {
    onActivate?.();
  }, [onActivate]);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (!onActivate) {
        return;
      }

      const now = Date.now();
      if (now - lastActivation.current <= intervalMs) {
        event.preventDefault();
        onActivate();
        lastActivation.current = 0;
        return;
      }

      lastActivation.current = now;
    },
    [onActivate, intervalMs],
  );

  return { onDoubleClick, onTouchEnd };
}
