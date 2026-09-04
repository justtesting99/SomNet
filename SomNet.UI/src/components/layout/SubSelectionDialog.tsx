import { useEffect, useState } from 'react';
import { AVAILABLE_SUBS, SUB_ROLE, type SubTargetName } from '@/config/sessionUsers';
import { useSubTarget } from '@/context/SubTargetProvider';
import { Button } from '@/components/ui/Button';

export function SubSelectionDialog() {
  const { selectedSub, setSelectedSub, isDialogOpen, closeDialog } = useSubTarget();
  const [pendingSub, setPendingSub] = useState<SubTargetName>(selectedSub);

  useEffect(() => {
    if (isDialogOpen) {
      setPendingSub(selectedSub);
    }
  }, [isDialogOpen, selectedSub]);

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

  function handleConfirm() {
    setSelectedSub(pendingSub);
    closeDialog();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub-selection-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 space-y-1">
          <h2 id="sub-selection-title" className="text-lg font-semibold text-white">
            Select {SUB_ROLE} target
          </h2>
          <p className="text-sm text-slate-400">
            Choose which {SUB_ROLE} will receive commands and monitoring data.
          </p>
        </header>

        <ul className="space-y-2" role="listbox" aria-label={`${SUB_ROLE} targets`}>
          {AVAILABLE_SUBS.map((sub) => {
            const isSelected = pendingSub === sub;

            return (
              <li key={sub}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                    isSelected
                      ? 'border-indigo-500/60 bg-indigo-500/15 text-white'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800',
                  ].join(' ')}
                  onClick={() => setPendingSub(sub)}
                >
                  <span className="font-medium">{sub}</span>
                  {isSelected ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                      Selected
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth className="sm:w-auto" onClick={closeDialog}>
            Cancel
          </Button>
          <Button fullWidth className="sm:w-auto" onClick={handleConfirm}>
            Select {SUB_ROLE}
          </Button>
        </footer>
      </div>
    </div>
  );
}
