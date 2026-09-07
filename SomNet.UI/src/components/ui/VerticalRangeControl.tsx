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
  muted = false,
}: {
  divisions: number;
  side: 'left' | 'right';
  muted?: boolean;
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
            'block h-px shrink-0',
            muted ? 'bg-slate-700' : 'bg-slate-600',
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
  muted = false,
}: {
  top: number | string;
  bottom: number | string;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        'flex h-full w-8 shrink-0 flex-col justify-between text-xs leading-none',
        muted ? 'text-slate-700' : 'text-slate-500',
      ].join(' ')}
    >
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
  disabled,
  ...props
}: VerticalRangeControlProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  const showScale = scaleTop !== undefined || scaleBottom !== undefined;
  const showTicks = tickDivisions !== undefined && tickDivisions > 0;
  const isDisabled = Boolean(disabled);

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      {!hideValueHeader ? (
        <p className="text-center text-sm font-medium text-slate-300">
          {label}: <span className="font-bold text-white">{value}</span>
        </p>
      ) : null}

      <div className="flex h-36 items-stretch gap-2 sm:h-40">
        <ScaleLabels top="100%" bottom="0%" muted={isDisabled} />

        {showTicks ? (
          <SliderTicks divisions={tickDivisions} side="left" muted={isDisabled} />
        ) : null}

        <div
          className={[
            'vertical-slider-track-shell',
            isDisabled ? 'vertical-slider-track-shell--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <input
            id={inputId}
            type="range"
            value={value}
            disabled={disabled}
            className={[
              'vertical-slider',
              isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />
        </div>

        {showTicks ? (
          <SliderTicks divisions={tickDivisions} side="right" muted={isDisabled} />
        ) : null}

        {showScale ? (
          <ScaleLabels top={scaleTop ?? ''} bottom={scaleBottom ?? ''} muted={isDisabled} />
        ) : null}
      </div>
    </div>
  );
}
