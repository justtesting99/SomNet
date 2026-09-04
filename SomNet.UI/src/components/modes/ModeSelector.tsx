import { useMode } from '@/context/ModeProvider';
import type { OperationMode } from '@/types/modes';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface ModeOption {
  id: OperationMode;
  title: string;
  description: string;
  highlights: string[];
}

const modeOptions: ModeOption[] = [
  {
    id: 'manual',
    title: 'Manual mode',
    description: 'Direct operator control with immediate stroke and burst commands.',
    highlights: [
      'Master Settings for minimum and maximum stroke (ms)',
      'Vertical power slider with live percent and millisecond readout',
      'Stroke and Burst actions with configurable burst count and delay',
      'Abort to stop an in-progress manual sequence',
      'Dual 16:9 video monitors with expand on command (mobile)',
    ],
  },
  {
    id: 'automatic',
    title: 'Automatic mode',
    description: 'Hands-off operation with configurable power, timing, bursts, and session limits.',
    highlights: [
      'Minimum and maximum power sliders (0–400)',
      'Stroke interval range, start delay, and end-session rules',
      'Optional burst mode with power, delay, and stroke count ranges',
      'Start and Stop controls for automated sessions',
      'Dual 16:9 video monitors with expand on start (mobile)',
    ],
  },
];

export function ModeSelector() {
  const { setMode } = useMode();

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Choose operation mode
        </h1>
        <p className="max-w-2xl text-sm text-slate-400 sm:text-base">
          Select how you want to run SomNet. You can switch modes at any time from the header.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-stretch">
        {modeOptions.map((option) => (
          <Card
            key={option.id}
            title={option.title}
            description={option.description}
            className="flex h-full flex-col"
          >
            <ul className="mb-5 flex-1 space-y-2 text-sm text-slate-400">
              {option.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button fullWidth className="mt-auto shrink-0" onClick={() => setMode(option.id)}>
              Enter {option.title.toLowerCase()}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
