import { useMemo } from 'react';
import type { MotorSpeedSchedule } from '@/utils/motorSpeedSchedule';

interface MotorSpeedPatternChartProps {
  schedule: MotorSpeedSchedule;
  nowSec?: number | null;
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
  runningLabel,
}: MotorSpeedPatternChartProps) {
  const { pathD, nowX, yTicks } = useMemo(() => {
    const plotW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const horizon = Math.max(schedule.horizonSec, 0.001);

    const xAt = (tSec: number) => PAD_LEFT + (tSec / horizon) * plotW;
    const yAt = (speed: number) => PAD_TOP + plotH - (speed / 100) * plotH;

    const segments: string[] = [];
    for (const point of schedule.points) {
      segments.push(`${xAt(point.tSec).toFixed(2)},${yAt(point.speedPercent).toFixed(2)}`);
    }
    const pathD = segments.length > 0 ? `M ${segments.join(' L ')}` : '';

    const nowX =
      nowSec != null && nowSec >= 0
        ? xAt(Math.min(nowSec, horizon))
        : null;

    const yTicks = [0, 50, 100].map((speed) => ({
      speed,
      y: yAt(speed),
      label: `${speed}%`,
    }));

    return { pathD, nowX, yTicks };
  }, [nowSec, schedule]);

  const xTicks = useMemo(() => {
    const horizon = schedule.horizonSec;
    const count = horizon <= 120 ? 4 : 5;
    return Array.from({ length: count + 1 }, (_, index) => {
      const tSec = (horizon * index) / count;
      return { tSec, label: formatAxisMinutes(tSec) };
    });
  }, [schedule.horizonSec]);

  const plotW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-auto w-full text-slate-400"
        role="img"
        aria-label="Commanded motor speed over time"
      >
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

        {xTicks.map((tick) => {
          const x = PAD_LEFT + (tick.tSec / schedule.horizonSec) * plotW;
          return (
            <text
              key={tick.tSec}
              x={x}
              y={CHART_HEIGHT - 4}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {tick.label}
            </text>
          );
        })}

        <path
          d={pathD}
          fill="none"
          stroke="rgb(129, 140, 248)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {nowX != null ? (
          <>
            <line
              x1={nowX}
              x2={nowX}
              y1={PAD_TOP}
              y2={CHART_HEIGHT - PAD_BOTTOM}
              stroke="rgb(251, 191, 36)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {runningLabel ? (
              <text
                x={Math.min(nowX + 4, CHART_WIDTH - PAD_RIGHT - 40)}
                y={PAD_TOP + 12}
                className="fill-amber-300 text-[10px]"
              >
                {runningLabel}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>
    </div>
  );
}
