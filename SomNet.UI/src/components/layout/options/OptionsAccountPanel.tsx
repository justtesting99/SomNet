import { useEffect, useState } from 'react';
import { changePassword } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthProvider';
import { MIN_PASSWORD_LENGTH } from '@/types/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface OptionsAccountPanelProps {
  active: boolean;
}

export function OptionsAccountPanel({ active }: OptionsAccountPanelProps) {
  const { user, updateSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordMessage('');
    setIsChangingPassword(false);
  }, [active]);

  async function handleChangePassword() {
    setPasswordError('');
    setPasswordMessage('');

    if (!currentPassword.trim()) {
      setPasswordError('Current password is required.');
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from the current password.');
      return;
    }

    if (!user) {
      setPasswordError('You must be signed in to change your password.');
      return;
    }

    setIsChangingPassword(true);

    try {
      const token = await changePassword({
        currentPassword,
        newPassword,
      });

      updateSession({ user, token });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMessage('Password updated successfully.');
    } catch (error) {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : 'Unable to change password. Check that the API is running.';
      setPasswordError(message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500">
        Signed in as <span className="text-slate-300">{user?.username}</span>
      </p>
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <Input
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirmNewPassword}
        onChange={(event) => setConfirmNewPassword(event.target.value)}
      />
      {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
      {passwordMessage ? <p className="text-sm text-emerald-400">{passwordMessage}</p> : null}
      <Button variant="secondary" onClick={handleChangePassword} disabled={isChangingPassword}>
        {isChangingPassword ? 'Updating password…' : 'Change password'}
      </Button>
    </section>
  );
}
