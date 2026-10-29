import type { ChangeEvent } from 'react';
import { NumberField } from '@/components/ui/NumberField';

export interface ClampedNumberFieldProps {
  label?: string;
  inline?: boolean;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
  alignLabelHeight?: boolean;
  title?: string;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/** Native number input with working steppers — commits clamped integer on each change. */
export function ClampedNumberField({
  label,
  inline,
  value,
  min,
  max,
  onCommit,
  disabled,
  className,
  alignLabelHeight,
  title,
}: ClampedNumberFieldProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const parsed = Math.trunc(Number(event.target.value));
    if (!Number.isFinite(parsed)) {
      return;
    }

    onCommit(clampInt(parsed, min, max));
  }

  return (
    <NumberField
      label={label}
      inline={inline}
      alignLabelHeight={alignLabelHeight}
      type="number"
      inputMode="numeric"
      step={1}
      value={value}
      min={min}
      max={max}
      className={className}
      disabled={disabled}
      title={title}
      onChange={handleChange}
    />
  );
}
