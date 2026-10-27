import { useEffect, useId, useMemo, useState } from 'react';
import { MOTOR_CHART_MIN_WINDOW_SEC } from '@/utils/motorChartViewRange';
import { Button } from '@/components/ui/Button';
import type { MotorSpeedSchedule } from '@/utils/motorSpeedSchedule';
import {
  computeMotorChartViewRange,
  zoomInWindowSec,
  zoomOutWindowSec,
} from '@/utils/motorChartViewRange';

interface MotorSpeedPatternChartProps {
  schedule: MotorSpeedSchedule;
  nowSec?: number | null;
  nowSpeedPercent?: number | null;
  runningLabel?: string;
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 160;
const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 24;

function formatAxisMinutes(tSec: number): string {
  if (tSec < 60) {
    return `${Math.round(tSec)}s`;
  }
  const minutes = tSec / 60;
  return minutes < 10 ? `${minutes.toFixed(1)}m` : `${Math.round(minutes)}m`;
}

export function MotorSpeedPatternChart({
  schedule,
  nowSec = null,
  nowSpeedPercent = null,
  runningLabel,
}: MotorSpeedPatternChartProps) {
  const clipId = useId().replace(/:/g, '');
  const horizonSec = schedule.horizonSec;
  const [windowSec, setWindowSec] = useState<number | null>(null);

  useEffect(() => {
    setWindowSec(null);
  }, [horizonSec]);

  const effectiveWindowSec = windowSec ?? horizonSec;
  const followNow = nowSec != null && nowSec >= 0;

  const view = useMemo(
    () =>
      computeMotorChartViewRange(
        horizonSec,
        effectiveWindowSec,
        followNow ? nowSec : null,
      ),
    [effectiveWindowSec, followNow, horizonSec, nowSec],
  );

  const isZoomed = effectiveWindowSec < horizonSec - 0.5;

  const plotClipId = `motor-chart-plot-${clipId}`;

  const { pathD, nowX, nowY, yTicks, xTicks } = useMemo(() => {
    const plotW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const viewSpan = Math.max(view.endSec - view.startSec, 0.001);

    const xAt = (tSec: number) => PAD_LEFT + ((tSec - view.startSec) / viewSpan) * plotW;
    const yAt = (speed: number) => PAD_TOP + plotH - (speed / 100) * plotH;

    const segments: string[] = [];
    for (const point of schedule.points) {
      segments.push(`${xAt(point.tSec).toFixed(2)},${yAt(point.speedPercent).toFixed(2)}`);
    }
    const pathD = segments.length > 0 ? `M ${segments.join(' L ')}` : '';

    const clampedNowSec =
      nowSec != null && nowSec >= 0 ? nowSec : null;
    const nowX =
      clampedNowSec != null &&
      clampedNowSec >= view.startSec - 0.001 &&
      clampedNowSec <= view.endSec + 0.001
        ? xAt(clampedNowSec)
        : null;
    const nowY =
      nowX != null && nowSpeedPercent != null
        ? yAt(Math.min(100, Math.max(0, nowSpeedPercent)))
        : null;

    const yTickValues = [0, 50, 100].map((speed) => ({
      speed,
      y: yAt(speed),
      label: `${speed}%`,
    }));

    const tickCount = viewSpan <= 45 ? 4 : 5;
    const xTickValues = Array.from({ length: tickCount + 1 }, (_, index) => {
      const tSec = view.startSec + (viewSpan * index) / tickCount;
      return { tSec, label: formatAxisMinutes(tSec), x: xAt(tSec) };
    });

    return {
      pathD,
      nowX,
      nowY,
      yTicks: yTickValues,
      xTicks: xTickValues,
    };
  }, [horizonSec, nowSec, nowSpeedPercent, schedule.points, view.endSec, view.startSec]);

  const canZoomIn = effectiveWindowSec > MOTOR_CHART_MIN_WINDOW_SEC + 0.5;
  const canZoomOut = isZoomed;

  function handleZoomIn() {
    setWindowSec(zoomInWindowSec(effectiveWindowSec, horizonSec));
  }

  function handleZoomOut() {
    const next = zoomOutWindowSec(effectiveWindowSec, horizonSec);
    setWindowSec(next >= horizonSec - 0.5 ? null : next);
  }

  function handleResetZoom() {
    setWindowSec(null);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {isZoomed
            ? `${formatAxisMinutes(view.startSec)} – ${formatAxisMinutes(view.endSec)}`
            : `0 – ${formatAxisMinutes(horizonSec)}`}
          {followNow && isZoomed ? ' · following Now' : null}
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-w-[2.25rem] px-2"
            disabled={!canZoomIn}
            aria-label="Zoom in"
            onClick={handleZoomIn}
          >
            +
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-w-[2.25rem] px-2"
            disabled={!canZoomOut}
            aria-label="Zoom out"
            onClick={handleZoomOut}
          >
            −
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isZoomed}
            aria-label="Reset zoom"
            onClick={handleResetZoom}
          >
            Fit
          </Button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full text-slate-400"
        role="img"
        aria-label="Commanded motor speed over time"
      >
        <defs>
          <clipPath id={plotClipId}>
            <rect
              x={PAD_LEFT}
              y={PAD_TOP}
              width={CHART_WIDTH - PAD_LEFT - PAD_RIGHT}
              height={CHART_HEIGHT - PAD_TOP - PAD_BOTTOM}
            />
          </clipPath>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.speed}>
            <line
              x1={PAD_LEFT}
              x2={CHART_WIDTH - PAD_RIGHT}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity={0.15}
            />
            <text
              x={PAD_LEFT - 6}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-slate-500 text-[10px]"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text
            key={tick.tSec}
            x={tick.x}
            y={CHART_HEIGHT - 4}
            textAnchor="middle"
            className="fill-slate-500 text-[10px]"
          >
            {tick.label}
          </text>
        ))}

        <path
          d={pathD}
          fill="none"
          stroke="rgb(129, 140, 248)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${plotClipId})`}
        />

        {nowX != null ? (
          <g clipPath={`url(#${plotClipId})`}>
            <line
              x1={nowX}
              x2={nowX}
              y1={PAD_TOP}
              y2={CHART_HEIGHT - PAD_BOTTOM}
              stroke="rgb(251, 191, 36)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {nowY != null ? (
              <circle
                cx={nowX}
                cy={nowY}
                r={4}
                fill="rgb(251, 191, 36)"
                stroke="rgb(15, 23, 42)"
                strokeWidth={1.5}
              />
            ) : null}
          </g>
        ) : null}

        {nowX != null && runningLabel ? (
          <text
            x={Math.min(nowX + 4, CHART_WIDTH - PAD_RIGHT - 40)}
            y={PAD_TOP + 12}
            className="fill-amber-300 text-[10px]"
          >
            {runningLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
