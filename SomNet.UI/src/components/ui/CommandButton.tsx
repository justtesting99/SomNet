import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import type { HardwareCommandKey } from '@/types/hardwareCommand';
import { Button } from '@/components/ui/Button';

interface CommandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  commandKey: HardwareCommandKey;
  onCommand: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: ReactNode;
}

export function CommandButton({
  commandKey,
  onCommand,
  disabled,
  children,
  ...props
}: CommandButtonProps) {
  const { executeCommand, isCommandPending } = useHardwareCommand();
  const pending = isCommandPending(commandKey);

  return (
    <Button
      {...props}
      pending={pending}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => void executeCommand(commandKey, onCommand)}
    >
      {children}
    </Button>
  );
}
