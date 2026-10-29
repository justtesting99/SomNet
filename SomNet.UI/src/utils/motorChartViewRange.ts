export const MOTOR_CHART_MIN_WINDOW_SEC = 8;
export const MOTOR_CHART_ZOOM_STEP = 1.35;

export interface MotorChartViewRange {
  startSec: number;
  endSec: number;
  windowSec: number;
}

/** Visible time window; when focusSec is set, pan so focus stays near the horizontal center. */
export function computeMotorChartViewRange(
  horizonSec: number,
  windowSec: number,
  focusSec: number | null,
): MotorChartViewRange {
  const horizon = Math.max(horizonSec, 0.001);
  const window = Math.min(Math.max(MOTOR_CHART_MIN_WINDOW_SEC, windowSec), horizon);

  if (focusSec == null || !Number.isFinite(focusSec)) {
    return { startSec: 0, endSec: window, windowSec: window };
  }

  const focus = Math.max(0, focusSec);
  let startSec = focus - window / 2;
  if (startSec < 0) {
    startSec = 0;
  }
  const maxStart = Math.max(0, horizon - window);
  if (startSec > maxStart) {
    startSec = maxStart;
  }

  return {
    startSec,
    endSec: startSec + window,
    windowSec: window,
  };
}

export function zoomInWindowSec(currentWindowSec: number, horizonSec: number): number {
  const horizon = Math.max(horizonSec, MOTOR_CHART_MIN_WINDOW_SEC);
  const current = currentWindowSec > 0 ? currentWindowSec : horizon;
  return Math.max(MOTOR_CHART_MIN_WINDOW_SEC, current / MOTOR_CHART_ZOOM_STEP);
}

export function zoomOutWindowSec(currentWindowSec: number, horizonSec: number): number {
  const horizon = Math.max(horizonSec, MOTOR_CHART_MIN_WINDOW_SEC);
  const current = currentWindowSec > 0 ? currentWindowSec : horizon;
  return Math.min(horizon, current * MOTOR_CHART_ZOOM_STEP);
}
