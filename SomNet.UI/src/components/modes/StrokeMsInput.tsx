import { ClampedNumberField } from '@/components/ui/ClampedNumberField';

interface StrokeMsInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/** Relay stroke ms bounds — same behavior as motor duty fields (native steppers). */
export function StrokeMsInput(props: StrokeMsInputProps) {
  return <ClampedNumberField inline {...props} />;
}
