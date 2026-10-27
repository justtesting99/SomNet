import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useOperationDeviceId } from '@/context/DeviceOperationScope';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { useTabSync } from '@/context/TabSyncProvider';
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
  const deviceId = useOperationDeviceId();
  const { executeCommand, isCommandPending } = useHardwareCommand();
  const { hasRemoteCommandLock, isRemoteCommandPending } = useTabSync();
  const pending = isCommandPending(commandKey, deviceId);
  const remotePending = isRemoteCommandPending(commandKey, deviceId);

  return (
    <Button
      {...props}
      pending={pending}
      disabled={disabled || pending || remotePending || hasRemoteCommandLock(deviceId)}
      aria-busy={pending}
      onClick={() => void executeCommand(commandKey, onCommand, deviceId)}
    >
      {children}
    </Button>
  );
}
