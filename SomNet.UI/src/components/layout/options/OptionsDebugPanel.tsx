import type { AppOptions } from '@/types/options';
import { Checkbox } from '@/components/ui/Checkbox';

interface OptionsDebugPanelProps {
  pendingOptions: AppOptions;
  onUpdate: <K extends keyof AppOptions>(key: K, value: AppOptions[K]) => void;
}

export function OptionsDebugPanel({ pendingOptions, onUpdate }: OptionsDebugPanelProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-slate-400">
        Developer and troubleshooting settings. Placement may change as the UI matures.
      </p>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">Session</h3>
        <Checkbox
          label="Show active session ID in header"
          checked={pendingOptions.showActiveSessionIdInHeader}
          onChange={(event) =>
            onUpdate('showActiveSessionIdInHeader', event.target.checked)
          }
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Off by default. History and Dom sessions still show the session id when you need it.
        </p>
      </section>
    </div>
  );
}
