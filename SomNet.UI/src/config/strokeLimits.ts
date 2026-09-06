import type { StrokeMsLimits } from '@/utils/strokeMsLimits';

/** Fallback until `/api/settings/stroke-limits` loads; values come from appsettings. */
export const DEFAULT_STROKE_MS_LIMITS: StrokeMsLimits = {
  absoluteMinimum: 25,
  absoluteMaximum: 30000,
};
