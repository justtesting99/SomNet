import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthenticatedSnapshotImage } from '@/components/video/AuthenticatedSnapshotImage';

interface SnapshotLightboxProps {
  imageUrl: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}

export function SnapshotLightbox({
  imageUrl,
  alt,
  caption,
  onClose,
}: SnapshotLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold capitalize text-white">
            {caption ?? alt}
          </p>
          <p className="text-xs text-slate-400">Esc to close</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <AuthenticatedSnapshotImage
          imageUrl={imageUrl}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
