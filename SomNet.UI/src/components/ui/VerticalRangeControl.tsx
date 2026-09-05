import type { InputHTMLAttributes } from 'react';

interface VerticalRangeControlProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  value: number;
  scaleTop?: number | string;
  scaleBottom?: number | string;
  hideValueHeader?: boolean;
  tickDivisions?: number;
}

function SliderTicks({
  divisions,
  side,
}: {
  divisions: number;
  side: 'left' | 'right';
}) {
  const ticks = Array.from({ length: divisions + 1 }, (_, index) => index);

  return (
    <div
      className="flex h-full w-3 shrink-0 flex-col justify-between"
      aria-hidden="true"
    >
      {ticks.map((tick) => (
        <span
          key={tick}
          className={[
            'block h-px shrink-0 bg-slate-600',
            tick === 0 || tick === divisions ? 'w-2.5' : 'w-1.5',
            side === 'left' ? 'self-end' : 'self-start',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

function ScaleLabels({
  top,
  bottom,
}: {
  top: number | string;
  bottom: number | string;
}) {
  return (
    <div className="flex h-full w-8 shrink-0 flex-col justify-between text-xs leading-none text-slate-500">
      <span className="self-end">{top}</span>
      <span className="self-end">{bottom}</span>
    </div>
  );
}

export function VerticalRangeControl({
  label,
  value,
  scaleTop,
  scaleBottom,
  hideValueHeader = false,
  tickDivisions,
  id,
  className = '',
  ...props
}: VerticalRangeControlProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  const showScale = scaleTop !== undefined || scaleBottom !== undefined;
  const showTicks = tickDivisions !== undefined && tickDivisions > 0;

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      {!hideValueHeader ? (
        <p className="text-center text-sm font-medium text-slate-300">
          {label}: <span className="font-bold text-white">{value}</span>
        </p>
      ) : null}

      <div className="flex h-36 items-stretch gap-2 sm:h-40">
        <ScaleLabels top="100%" bottom="0%" />

        {showTicks ? <SliderTicks divisions={tickDivisions} side="left" /> : null}

        <div className="vertical-slider-track-shell">
          <input
            id={inputId}
            type="range"
            value={value}
            className={['vertical-slider cursor-pointer', className].filter(Boolean).join(' ')}
            {...props}
          />
        </div>

        {showTicks ? <SliderTicks divisions={tickDivisions} side="right" /> : null}

        {showScale ? (
          <ScaleLabels top={scaleTop ?? ''} bottom={scaleBottom ?? ''} />
        ) : null}
      </div>
    </div>
  );
}
