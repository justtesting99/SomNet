import { useEffect, useMemo, useState } from 'react';
import { fetchSessionSnapshots, type SessionActionSnapshot } from '@/api/videoSnapshots';
import { AuthenticatedSnapshotImage } from '@/components/video/AuthenticatedSnapshotImage';
import { SnapshotLightbox } from '@/components/video/SnapshotLightbox';
import {
  captionForSnapshotGroup,
  modeForSnapshotGroup,
} from '@/utils/snapshotActionCaption';

interface SessionSnapshotGalleryProps {
  sessionId: string;
}

function groupSnapshotsByAction(snapshots: SessionActionSnapshot[]) {
  const groups = new Map<number, SessionActionSnapshot[]>();

  for (const snapshot of snapshots) {
    const existing = groups.get(snapshot.actionIndex) ?? [];
    existing.push(snapshot);
    groups.set(snapshot.actionIndex, existing);
  }

  return [...groups.entries()].sort(([left], [right]) => left - right);
}

export function SessionSnapshotGallery({ sessionId }: SessionSnapshotGalleryProps) {
  const [snapshots, setSnapshots] = useState<SessionActionSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedSnapshot, setExpandedSnapshot] = useState<SessionActionSnapshot | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    void fetchSessionSnapshots(sessionId)
      .then((entries) => {
        if (!cancelled) {
          setSnapshots(entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshots([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const groups = useMemo(() => groupSnapshotsByAction(snapshots), [snapshots]);

  if (!loaded) {
    return <p className="mt-3 text-xs text-slate-500">Loading action stills…</p>;
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      {expandedSnapshot ? (
        <SnapshotLightbox
          imageUrl={expandedSnapshot.imageUrl}
          alt={`${expandedSnapshot.feed} snapshot`}
          caption={`${expandedSnapshot.actionSummary?.trim() || `Action ${expandedSnapshot.actionIndex + 1}`} · ${expandedSnapshot.feed}`}
          onClose={() => setExpandedSnapshot(null)}
        />
      ) : null}

      <div className="mt-3 space-y-3">
      {groups.map(([actionIndex, actionSnapshots]) => {
        const caption = captionForSnapshotGroup(actionSnapshots);
        const actionMode = modeForSnapshotGroup(actionSnapshots);
        return (
        <div key={actionIndex} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {actionMode ? (
              <span
                className={[
                  'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                  actionMode === 'manual'
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-indigo-500/20 text-indigo-200',
                ].join(' ')}
              >
                {actionMode}
              </span>
            ) : null}
            <p className="min-w-0 flex-1 text-sm leading-snug text-slate-300">{caption}</p>
          </div>
          <div
            className={[
              'grid gap-2',
              actionSnapshots.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
            ].join(' ')}
          >
            {actionSnapshots.map((snapshot) => (
              <figure
                key={snapshot.id}
                className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950/60"
              >
                <AuthenticatedSnapshotImage
                  imageUrl={snapshot.imageUrl}
                  alt={`${snapshot.feed} snapshot`}
                  className="mx-auto max-h-72 w-auto max-w-full cursor-zoom-in object-contain"
                  onDoubleClick={() => setExpandedSnapshot(snapshot)}
                />
                <figcaption className="px-2 py-1 text-xs capitalize text-slate-400">
                  {snapshot.feed}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        );
      })}
      </div>
    </>
  );
}
