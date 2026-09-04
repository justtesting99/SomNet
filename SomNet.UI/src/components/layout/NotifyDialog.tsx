import { useEffect, useMemo, useState } from 'react';
import { sendSessionNotification } from '@/api/notifications';
import { SUB_ROLE } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useNotify } from '@/context/NotifyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  buildNotificationPreview,
  createDefaultNotificationForm,
  type SessionNotificationForm,
} from '@/types/notification';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { TextArea } from '@/components/ui/TextArea';

export function NotifyDialog() {
  const { isDialogOpen, closeDialog } = useNotify();
  const { selectedSub } = useSubTarget();
  const { user } = useAuth();
  const domName = user?.displayName ?? 'Unknown';
  const [form, setForm] = useState<SessionNotificationForm>(createDefaultNotificationForm);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isDialogOpen) {
      setForm(createDefaultNotificationForm());
      setStatusMessage('');
      setIsSending(false);
    }
  }, [isDialogOpen]);

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

  const preview = useMemo(
    () => buildNotificationPreview(form, selectedSub, domName),
    [form, selectedSub, domName],
  );

  if (!isDialogOpen) {
    return null;
  }

  function updateForm<K extends keyof SessionNotificationForm>(
    key: K,
    value: SessionNotificationForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatusMessage('');
  }

  async function handleSend() {
    if (!form.sessionDateTime) {
      setStatusMessage('Select a session date and time before sending.');
      return;
    }

    setIsSending(true);
    setStatusMessage('');

    try {
      const message = await sendSessionNotification(domName, selectedSub, form);
      setStatusMessage(message);
    } catch {
      setStatusMessage('Unable to send notification. Check that the API is running.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        className="flex max-h-[min(90dvh,760px)] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <h2 id="notify-dialog-title" className="text-lg font-semibold text-white">
            Notify {SUB_ROLE}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Send an email to <span className="text-slate-200">{selectedSub}</span> about an
            upcoming session.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Input
            label="Subject"
            value={form.subject}
            onChange={(event) => updateForm('subject', event.target.value)}
          />

          <DateTimeInput
            label="Session date and time"
            value={form.sessionDateTime}
            onValueChange={(value) => updateForm('sessionDateTime', value)}
          />

          <TextArea
            label="Additional message"
            value={form.customBody}
            placeholder="Optional notes to include in the notification"
            hint="This text is added to the standard notification and signed with your name."
            onChange={(value) => updateForm('customBody', value)}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-slate-300">Preview</p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-400">
              {preview}
            </pre>
          </div>

          {statusMessage ? (
            <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
              {statusMessage}
            </p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-slate-800 px-5 py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeDialog} disabled={isSending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? 'Sending…' : 'Send notification'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
