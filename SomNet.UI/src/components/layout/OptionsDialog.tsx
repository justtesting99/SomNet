import { useEffect, useState } from 'react';
import { useOptions } from '@/context/OptionsProvider';
import { type AppOptions } from '@/types/options';
import {
  getDefaultOptionsForTab,
  getResetDefaultsLabel,
  isOptionsTabWithSaveFooter,
  OPTIONS_DIALOG_TABS,
  readLastOptionsDialogTab,
  writeLastOptionsDialogTab,
  type OptionsDialogTab,
} from '@/config/optionsDialog';
import { Button } from '@/components/ui/Button';
import { OptionsAccountPanel } from '@/components/layout/options/OptionsAccountPanel';
import { OptionsGeneralPanel } from '@/components/layout/options/OptionsGeneralPanel';
import { OptionsNotificationsPanel } from '@/components/layout/options/OptionsNotificationsPanel';

export function OptionsDialog() {
  const { isDialogOpen, closeDialog, options, setOptions } = useOptions();
  const [activeTab, setActiveTab] = useState<OptionsDialogTab>(() => readLastOptionsDialogTab());
  const [pendingOptions, setPendingOptions] = useState<AppOptions>(options);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isDialogOpen) {
      setActiveTab(readLastOptionsDialogTab());
      setPendingOptions(options);
      setSaveError('');
      setIsSaving(false);
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

  function selectTab(tab: OptionsDialogTab) {
    setActiveTab(tab);
    writeLastOptionsDialogTab(tab);
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
    if (!isOptionsTabWithSaveFooter(activeTab)) {
      return;
    }

    setPendingOptions((current) => ({
      ...current,
      ...getDefaultOptionsForTab(activeTab),
    }));
  }

  const showSaveFooter = isOptionsTabWithSaveFooter(activeTab);

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
            Application settings and account management.
          </p>
        </header>

        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 px-5 py-3"
          role="tablist"
          aria-label="Options sections"
        >
          {OPTIONS_DIALOG_TABS.map((tab) => (
            <Button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              size="sm"
              className="shrink-0"
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'account' ? <OptionsAccountPanel active /> : null}
          {activeTab === 'general' ? (
            <OptionsGeneralPanel pendingOptions={pendingOptions} onUpdate={updateOption} />
          ) : null}
          {activeTab === 'notifications' ? (
            <OptionsNotificationsPanel pendingOptions={pendingOptions} onUpdate={updateOption} />
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-slate-800 px-5 py-4">
          {showSaveFooter && saveError ? (
            <p className="mb-3 text-sm text-red-400">{saveError}</p>
          ) : null}
          {showSaveFooter ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
                {getResetDefaultsLabel(activeTab)}
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
          ) : (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={closeDialog}>
                Close
              </Button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
