import { useEffect, useState } from 'react';
import { changePassword } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { DEFAULT_APP_OPTIONS, MOBILE_VIDEO_EXPAND_OPTIONS, type AppOptions } from '@/types/options';
import { MIN_PASSWORD_LENGTH } from '@/types/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/RadioGroup';
import type { MobileVideoExpandDefault } from '@/types/options';
import { DevicePairingPanel } from '@/components/layout/DevicePairingPanel';

export function OptionsDialog() {
  const { user, updateSession } = useAuth();
  const { isDialogOpen, closeDialog, options, setOptions } = useOptions();
  const [pendingOptions, setPendingOptions] = useState<AppOptions>(options);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (isDialogOpen) {
      setPendingOptions(options);
      setSaveError('');
      setIsSaving(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordError('');
      setPasswordMessage('');
      setIsChangingPassword(false);
    }
  }, [isDialogOpen, options]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closeDialog]);

  if (!isDialogOpen) {
    return null;
  }

  function updateOption<K extends keyof AppOptions>(key: K, value: AppOptions[K]) {
    setPendingOptions((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaveError('');
    setIsSaving(true);

    try {
      await setOptions(pendingOptions);
      closeDialog();
    } catch {
      setSaveError('Unable to save options. Check that the API is running.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setPendingOptions(DEFAULT_APP_OPTIONS);
  }

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[min(85dvh,720px)] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="options-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <h2 id="options-dialog-title" className="text-lg font-semibold text-white">
            Options
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            General application settings. More options will be added later.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Notifications</h3>
            <Checkbox
              label="Enable sound alerts"
              checked={pendingOptions.enableSoundAlerts}
              onChange={(event) => updateOption('enableSoundAlerts', event.target.checked)}
            />
            <Checkbox
              label="Show session timestamps in history"
              checked={pendingOptions.showSessionTimestamps}
              onChange={(event) => updateOption('showSessionTimestamps', event.target.checked)}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Operation</h3>
            <Checkbox
              label="Confirm before stroke or burst commands"
              checked={pendingOptions.confirmBeforeCommands}
              onChange={(event) => updateOption('confirmBeforeCommands', event.target.checked)}
            />
            <Checkbox
              label="Auto-expand video feeds on mobile when commands run"
              checked={pendingOptions.autoExpandVideoOnMobile}
              onChange={(event) =>
                updateOption('autoExpandVideoOnMobile', event.target.checked)
              }
            />
            <SelectField
              label="Default mobile video feed on command"
              value={pendingOptions.mobileVideoExpandDefault}
              disabled={!pendingOptions.autoExpandVideoOnMobile}
              options={MOBILE_VIDEO_EXPAND_OPTIONS}
              onChange={(event) =>
                updateOption(
                  'mobileVideoExpandDefault',
                  event.target.value as MobileVideoExpandDefault,
                )
              }
            />
            <NumberField
              label="System status reconnect interval (seconds)"
              value={pendingOptions.reconnectIntervalSeconds}
              min={5}
              max={120}
              onChange={(event) =>
                updateOption('reconnectIntervalSeconds', Number(event.target.value))
              }
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Display</h3>
            <Input
              label="Operator display name override"
              value={pendingOptions.operatorDisplayName}
              placeholder="Leave blank to use login name"
              onChange={(event) => updateOption('operatorDisplayName', event.target.value)}
            />
            <Input
              label="Default session notes prefix"
              value={pendingOptions.defaultNotesPrefix}
              onChange={(event) => updateOption('defaultNotesPrefix', event.target.value)}
            />
          </section>

          <DevicePairingPanel active={isDialogOpen} />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Account</h3>
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
            <Button
              variant="secondary"
              onClick={handleChangePassword}
              disabled={isChangingPassword || isSaving}
            >
              {isChangingPassword ? 'Updating password…' : 'Change password'}
            </Button>
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-800 px-5 py-4">
          {saveError ? (
            <p className="mb-3 text-sm text-red-400">{saveError}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
              Reset defaults
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={closeDialog} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
