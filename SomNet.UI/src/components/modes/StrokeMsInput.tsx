import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { NumberField } from '@/components/ui/NumberField';

interface StrokeMsInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function StrokeMsInput({
  label,
  value,
  min,
  max,
  onCommit,
  disabled = false,
  className = 'w-20',
}: StrokeMsInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(String(value));
    }
  }, [value, isEditing]);

  function commitDraft() {
    setIsEditing(false);

    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.') {
      setDraft(String(value));
      return;
    }

    const parsed = Math.trunc(Number(trimmed));
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const clamped = Math.max(min, Math.min(max, parsed));
    onCommit(clamped);
    setDraft(String(clamped));
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setIsEditing(true);
    setDraft(String(value));
    event.target.select();
  }

  function handleBlur() {
    commitDraft();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }

    if (event.key === 'Escape') {
      setDraft(String(value));
      setIsEditing(false);
      event.currentTarget.blur();
    }
  }

  return (
    <NumberField
      label={label}
      inline
      type={isEditing ? 'text' : 'number'}
      inputMode="numeric"
      value={isEditing ? draft : value}
      min={isEditing ? undefined : min}
      max={isEditing ? undefined : max}
      className={className}
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
