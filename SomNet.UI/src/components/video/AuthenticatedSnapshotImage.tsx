import { useEffect, useState } from 'react';
import { apiFetchBlob } from '@/api/client';

interface AuthenticatedSnapshotImageProps {
  imageUrl: string;
  alt: string;
}

export function AuthenticatedSnapshotImage({
  imageUrl,
  alt,
}: AuthenticatedSnapshotImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    void apiFetchBlob(imageUrl)
      .then((blob) => {
        if (cancelled) {
          return;
        }

        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setObjectUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [imageUrl]);

  if (!objectUrl) {
    return <div className="aspect-video w-full bg-slate-900" aria-hidden="true" />;
  }

  return (
    <img src={objectUrl} alt={alt} className="aspect-video w-full object-cover" loading="lazy" />
  );
}
