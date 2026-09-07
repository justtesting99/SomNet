import { useEffect } from 'react';
import { useHardwareDialog } from '@/context/HardwareProvider';
import { Button } from '@/components/ui/Button';
import { HardwarePanel } from '@/components/layout/options/HardwarePanel';

export function HardwareDialog() {
  const { isDialogOpen, closeDialog } = useHardwareDialog();

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[min(90dvh,820px)] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hardware-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <h2 id="hardware-dialog-title" className="text-lg font-semibold text-white">
            Hardware
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Pair ESP32 devices to Subs, review connection state, and manage token expiry.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <HardwarePanel active />
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={closeDialog}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
}
