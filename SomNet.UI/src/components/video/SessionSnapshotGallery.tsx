import { useEffect, useMemo, useState } from 'react';
import { fetchSessionSnapshots, type SessionActionSnapshot } from '@/api/videoSnapshots';
import { AuthenticatedSnapshotImage } from '@/components/video/AuthenticatedSnapshotImage';

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
    <div className="mt-3 space-y-3">
      {groups.map(([actionIndex, actionSnapshots]) => (
        <div key={actionIndex} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Action {actionIndex + 1}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {actionSnapshots.map((snapshot) => (
              <figure
                key={snapshot.id}
                className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950/60"
              >
                <AuthenticatedSnapshotImage
                  imageUrl={snapshot.imageUrl}
                  alt={`${snapshot.feed} snapshot`}
                />
                <figcaption className="px-2 py-1 text-xs capitalize text-slate-400">
                  {snapshot.feed}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
