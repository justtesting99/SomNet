import type { AppOptions } from '@/types/options';
import {
  DEFAULT_GENERAL_APP_OPTIONS,
  DEFAULT_NOTIFICATIONS_APP_OPTIONS,
} from '@/types/options';

export type OptionsDialogTab = 'general' | 'notifications' | 'account';

export const OPTIONS_DIALOG_TABS: { id: OptionsDialogTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

const STORAGE_KEY = 'somnet.optionsDialog.activeTab';

const VALID_TABS = new Set<OptionsDialogTab>(
  OPTIONS_DIALOG_TABS.map((tab) => tab.id),
);

export function readLastOptionsDialogTab(): OptionsDialogTab {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_TABS.has(stored as OptionsDialogTab)) {
      return stored as OptionsDialogTab;
    }
  } catch {
    // Ignore storage errors and fall back to General.
  }

  return 'general';
}

export function writeLastOptionsDialogTab(tab: OptionsDialogTab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Ignore storage errors.
  }
}

export function isOptionsTabWithSaveFooter(tab: OptionsDialogTab): boolean {
  return tab === 'general' || tab === 'notifications';
}

export function getDefaultOptionsForTab(tab: OptionsDialogTab): Partial<AppOptions> {
  switch (tab) {
    case 'general':
      return DEFAULT_GENERAL_APP_OPTIONS;
    case 'notifications':
      return DEFAULT_NOTIFICATIONS_APP_OPTIONS;
    default:
      return {};
  }
}

export function getResetDefaultsLabel(tab: OptionsDialogTab): string {
  switch (tab) {
    case 'general':
      return 'Reset General defaults';
    case 'notifications':
      return 'Reset Notifications defaults';
    default:
      return 'Reset defaults';
  }
}
