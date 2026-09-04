import { useEffect, useState } from 'react';
import { addSub, fetchSubs, removeSub } from '@/api/subs';
import { SUB_ROLE, type SubTargetName } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { Button } from '@/components/ui/Button';

export function SubSelectionDialog() {
  const { selectedSub, setSelectedSub, isDialogOpen, closeDialog } = useSubTarget();
  const { user } = useAuth();
  const { endActiveSessionIfNeeded } = useLiveSession();
  const domName = user?.displayName ?? 'Unknown';
  const [pendingSub, setPendingSub] = useState<SubTargetName>(selectedSub);
  const [availableSubs, setAvailableSubs] = useState<SubTargetName[]>([]);
  const [newSubName, setNewSubName] = useState('');
  const [subPendingRemoval, setSubPendingRemoval] = useState<SubTargetName | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [addError, setAddError] = useState('');
  const [removeError, setRemoveError] = useState('');

  useEffect(() => {
    if (isDialogOpen) {
      setPendingSub(selectedSub);
      setNewSubName('');
      setAddError('');
      setRemoveError('');
      setSubPendingRemoval(null);
    }
  }, [isDialogOpen, selectedSub]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    fetchSubs()
      .then((subs) => {
        if (!cancelled) {
          setAvailableSubs(subs);
          if (subs.length > 0 && !subs.includes(pendingSub)) {
            setPendingSub(subs.includes(selectedSub) ? selectedSub : subs[0]);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableSubs([]);
          setLoadError('Unable to load Sub list from the API.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, domName]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (subPendingRemoval) {
          setSubPendingRemoval(null);
          setRemoveError('');
        } else {
          closeDialog();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closeDialog, subPendingRemoval]);

  if (!isDialogOpen) {
    return null;
  }

  async function applySubSelection(sub: SubTargetName) {
    if (sub !== selectedSub) {
      await endActiveSessionIfNeeded('sub-change');
    }

    setSelectedSub(sub);
    closeDialog();
  }

  async function handleAddSub() {
    const trimmed = newSubName.trim();
    if (!trimmed) {
      setAddError('Enter a Sub name.');
      return;
    }

    setIsAdding(true);
    setAddError('');

    try {
      const subs = await addSub(trimmed);
      const addedSub = subs.find((sub) => sub === trimmed) ?? trimmed;
      await applySubSelection(addedSub);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Unable to add Sub.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleConfirmRemove() {
    if (!subPendingRemoval) {
      return;
    }

    setIsRemoving(true);
    setRemoveError('');

    try {
      const subs = await removeSub(subPendingRemoval);
      setAvailableSubs(subs);
      setSubPendingRemoval(null);

      if (subPendingRemoval === pendingSub) {
        setPendingSub(subs.includes(selectedSub) ? selectedSub : subs[0] ?? pendingSub);
      }

      if (subPendingRemoval === selectedSub && subs.length > 0) {
        const nextSub = subs[0];
        if (nextSub !== selectedSub) {
          await endActiveSessionIfNeeded('sub-change');
          setSelectedSub(nextSub);
        }
      }
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Unable to remove Sub.');
    } finally {
      setIsRemoving(false);
    }
  }

  async function handleConfirm() {
    await applySubSelection(pendingSub);
  }

  const canConfirm = availableSubs.includes(pendingSub);

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

        {isLoading ? (
          <p className="mb-4 text-sm text-slate-500">Loading {SUB_ROLE} list…</p>
        ) : null}
        {loadError ? (
          <p className="mb-4 text-sm text-amber-400">{loadError}</p>
        ) : null}

        {availableSubs.length === 0 && !isLoading ? (
          <p className="mb-4 text-sm text-slate-500">
            No {SUB_ROLE} targets yet. Add one below to get started.
          </p>
        ) : null}

        <ul className="space-y-2" role="listbox" aria-label={`${SUB_ROLE} targets`}>
          {availableSubs.map((sub) => {
            const isSelected = pendingSub === sub;
            const isConfirmingRemoval = subPendingRemoval === sub;

            if (isConfirmingRemoval) {
              return (
                <li
                  key={sub}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 p-4"
                >
                  <p className="text-sm text-white">
                    Remove <span className="font-semibold">{sub}</span>?
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    This {SUB_ROLE} will no longer appear in your list. Session history is kept.
                  </p>
                  {removeError ? (
                    <p className="mt-2 text-sm text-red-400">{removeError}</p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRemoving}
                      onClick={() => {
                        setSubPendingRemoval(null);
                        setRemoveError('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isRemoving}
                      onClick={() => void handleConfirmRemove()}
                    >
                      {isRemoving ? 'Removing…' : 'Remove'}
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li key={sub}>
                <div
                  className={[
                    'flex items-center gap-2 rounded-xl border transition-colors',
                    isSelected
                      ? 'border-indigo-500/60 bg-indigo-500/15'
                      : 'border-slate-700 bg-slate-900/60',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={[
                      'flex min-w-0 flex-1 items-center justify-between px-4 py-3 text-left text-sm transition-colors',
                      isSelected ? 'text-white' : 'text-slate-300 hover:text-white',
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-2 shrink-0 text-slate-400 hover:text-red-400"
                    disabled={isRemoving || isAdding}
                    onClick={() => {
                      setSubPendingRemoval(sub);
                      setRemoveError('');
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <label htmlFor="new-sub-name" className="block text-sm font-medium text-slate-300">
            Add {SUB_ROLE}
          </label>
          <div className="flex gap-2">
            <input
              id="new-sub-name"
              type="text"
              value={newSubName}
              onChange={(event) => setNewSubName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleAddSub();
                }
              }}
              placeholder="e.g. Slv69"
              maxLength={32}
              disabled={isAdding || isRemoving}
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={isAdding || isRemoving || !newSubName.trim()}
              onClick={() => void handleAddSub()}
            >
              {isAdding ? 'Adding…' : 'Add'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Letters, numbers, underscores, or hyphens. Must start with a letter.
          </p>
          {addError ? <p className="text-sm text-red-400">{addError}</p> : null}
        </div>

        <footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth className="sm:w-auto" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            fullWidth
            className="sm:w-auto"
            disabled={!canConfirm || isRemoving}
            onClick={() => void handleConfirm()}
          >
            Select {SUB_ROLE}
          </Button>
        </footer>
      </div>
    </div>
  );
}
