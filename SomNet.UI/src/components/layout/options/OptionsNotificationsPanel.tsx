import type { AppOptions } from '@/types/options';
import { Checkbox } from '@/components/ui/Checkbox';

interface OptionsNotificationsPanelProps {
  pendingOptions: AppOptions;
  onUpdate: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => void;
}

export function OptionsNotificationsPanel({
  pendingOptions,
  onUpdate,
}: OptionsNotificationsPanelProps) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <Checkbox
          label="Enable sound alerts"
          checked={pendingOptions.enableSoundAlerts}
          onChange={(event) => onUpdate('enableSoundAlerts', event.target.checked)}
        />
      </div>
      <div>
        <Checkbox
          label="Show session timestamps in history"
          checked={pendingOptions.showSessionTimestamps}
          onChange={(event) => onUpdate('showSessionTimestamps', event.target.checked)}
        />
      </div>
    </section>
  );
}
