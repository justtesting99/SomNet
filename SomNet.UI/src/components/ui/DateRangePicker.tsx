import { useEffect, useId, useRef, useState } from 'react';
import {
  addMonths,
  compareDateKeys,
  getMonthGrid,
  isDateKeyBetween,
  isSameDateKey,
  normalizeDateRange,
  parseDateKey,
  startOfMonth,
  toDateKey,
} from '@/utils/calendar';
import { formatDateOnlyDisplay } from '@/utils/dateTimeLocal';

interface DateRangePickerProps {
  label?: string;
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onClear?: () => void;
  hint?: string;
  error?: string;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function MonthCalendar({
  monthDate,
  todayKey,
  draftFrom,
  draftTo,
  hoverKey,
  onDayClick,
  onDayHover,
}: {
  monthDate: Date;
  todayKey: string;
  draftFrom: string;
  draftTo: string;
  hoverKey: string;
  onDayClick: (key: string) => void;
  onDayHover: (key: string) => void;
}) {
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(monthDate);
  const days = getMonthGrid(monthDate.getFullYear(), monthDate.getMonth());
  const previewEnd =
    draftFrom && !draftTo && hoverKey && compareDateKeys(hoverKey, draftFrom) >= 0
      ? hoverKey
      : draftTo;
  const rangeStart =
    draftFrom && previewEnd
      ? compareDateKeys(draftFrom, previewEnd) <= 0
        ? draftFrom
        : previewEnd
      : draftFrom;
  const rangeEnd =
    draftFrom && previewEnd
      ? compareDateKeys(draftFrom, previewEnd) <= 0
        ? previewEnd
        : draftFrom
      : '';

  return (
    <div className="min-w-[16.5rem]">
      <p className="mb-3 text-center text-sm font-semibold text-white">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1 font-medium">
            {label}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isStart = Boolean(rangeStart && isSameDateKey(day.key, rangeStart));
          const isEnd = Boolean(rangeEnd && isSameDateKey(day.key, rangeEnd));
          const inRange = Boolean(
            rangeStart && rangeEnd && isDateKeyBetween(day.key, rangeStart, rangeEnd),
          );
          const isToday = isSameDateKey(day.key, todayKey);

          return (
            <button
              key={day.key}
              type="button"
              disabled={!day.inCurrentMonth}
              aria-label={formatDateOnlyDisplay(day.key)}
              className={[
                'relative h-9 rounded-lg text-sm transition-colors',
                !day.inCurrentMonth
                  ? 'cursor-default text-slate-700'
                  : 'text-slate-200 hover:bg-slate-800',
                inRange && !isStart && !isEnd ? 'bg-indigo-500/15' : '',
                isStart || isEnd ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500' : '',
                isToday && !isStart && !isEnd ? 'ring-1 ring-indigo-400/60 ring-inset' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (day.inCurrentMonth) {
                  onDayClick(day.key);
                }
              }}
              onMouseEnter={() => {
                if (day.inCurrentMonth) {
                  onDayHover(day.key);
                }
              }}
            >
              {parseDateKey(day.key).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  label = 'Dates',
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onClear,
  hint,
  error,
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const popoverId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const [hoverKey, setHoverKey] = useState('');
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    if (!isOpen) {
      setDraftFrom(fromDate);
      setDraftTo(toDate);
      setHoverKey('');
    }
  }, [fromDate, toDate, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  function openPicker() {
    const anchor = fromDate ? parseDateKey(fromDate) : new Date();
    setViewMonth(startOfMonth(anchor));
    setDraftFrom(fromDate);
    setDraftTo(toDate);
    setHoverKey('');
    setIsOpen(true);
  }

  function applyRange(nextFrom: string, nextTo: string) {
    const normalized = normalizeDateRange(nextFrom, nextTo);
    onFromDateChange(normalized.fromDate);
    onToDateChange(normalized.toDate);
  }

  function handleDayClick(key: string) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(key);
      setDraftTo('');
      return;
    }

    const normalized = normalizeDateRange(draftFrom, key);
    setDraftFrom(normalized.fromDate);
    setDraftTo(normalized.toDate);
    applyRange(normalized.fromDate, normalized.toDate);
    setIsOpen(false);
  }

  function handleApply() {
    applyRange(draftFrom, draftTo);
    setIsOpen(false);
  }

  function handleClear() {
    setDraftFrom('');
    setDraftTo('');
    onFromDateChange('');
    onToDateChange('');
    onClear?.();
    setIsOpen(false);
  }

  const hasSelection = Boolean(fromDate || toDate);
  const leftMonth = viewMonth;
  const rightMonth = addMonths(viewMonth, 1);
  const selectionHint =
    draftFrom && !draftTo
      ? 'Select an end date, or apply with a start date only.'
      : 'Select a start date.';

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <span id={triggerId} className="block text-sm font-medium text-slate-300">
        {label}
      </span>

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        className={[
          'flex w-full overflow-hidden rounded-xl border bg-slate-900/60 text-left transition-colors',
          'hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
          error ? 'border-red-500/70' : 'border-slate-700',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
          } else {
            openPicker();
          }
        }}
      >
        <span className="min-w-0 flex-1 border-r border-slate-700 px-4 py-3">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Start
          </span>
          <span className={fromDate ? 'text-sm text-white' : 'text-sm text-slate-500'}>
            {fromDate ? formatDateOnlyDisplay(fromDate) : 'Add date'}
          </span>
        </span>
        <span className="min-w-0 flex-1 px-4 py-3">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            End
          </span>
          <span className={toDate ? 'text-sm text-white' : 'text-sm text-slate-500'}>
            {toDate ? formatDateOnlyDisplay(toDate) : 'Add date'}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-labelledby={triggerId}
          className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              className="rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
            >
              ‹
            </button>
            <p className="text-xs text-slate-500 sm:hidden">{selectionHint}</p>
            <button
              type="button"
              aria-label="Next month"
              className="rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
            >
              ›
            </button>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:justify-center">
            <MonthCalendar
              monthDate={leftMonth}
              todayKey={todayKey}
              draftFrom={draftFrom}
              draftTo={draftTo}
              hoverKey={hoverKey}
              onDayClick={handleDayClick}
              onDayHover={setHoverKey}
            />
            <MonthCalendar
              monthDate={rightMonth}
              todayKey={todayKey}
              draftFrom={draftFrom}
              draftTo={draftTo}
              hoverKey={hoverKey}
              onDayClick={handleDayClick}
              onDayHover={setHoverKey}
            />
          </div>

          <p className="mt-4 hidden text-xs text-slate-500 sm:block">{selectionHint}</p>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <button
              type="button"
              className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
              onClick={handleClear}
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                disabled={!draftFrom && !draftTo}
                onClick={handleApply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : hasSelection ? null : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
