// Up to 5 photos (FR-05): pick or take, shrink in the browser, upload to POST /api/photos, show
// thumbnails from the server. Returns photo ids; the form attaches them when it is saved.
import { IconButton, Notice } from '@lf/ui';
import { ImagePlus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { photoUrl, useUploadPhoto } from '../api/hooks';
import { shrinkForUpload } from '../lib/images';

export function PhotoPicker({
  label,
  value,
  onChange,
  max = 5,
  hint = 'Optional. Compressed to 500 KB or less; location data is removed.',
  addLabel = 'Add photo',
  capture = false,
}: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  hint?: string;
  addLabel?: string;
  /** Open the camera first on phones and tablets (desk intake). */
  capture?: boolean;
}) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const full = value.length + busy >= max;

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    const picked = [...files].slice(0, Math.max(0, max - value.length));
    if (files.length > picked.length) setError(`Add up to ${max} photos.`);
    let ids = value;
    for (const file of picked) {
      setBusy((n) => n + 1);
      try {
        const photo = await upload.mutateAsync(await shrinkForUpload(file));
        ids = [...ids, photo.id];
        onChange(ids);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "That photo couldn't be added; try again or choose another one.",
        );
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <p className="pb-2 text-body font-semibold text-ink">
        {label} <span className="font-normal text-muted">(optional)</span>
      </p>
      <div className="flex flex-wrap items-start gap-3">
        {value.map((id, i) => (
          <div key={id} className="relative">
            <img
              src={photoUrl(id)}
              alt={`Attached ${i + 1} of ${value.length}`}
              className="h-[104px] w-[104px] rounded-md border border-line object-cover"
            />
            <IconButton
              icon={X}
              label={`Remove attached ${i + 1}`}
              className="absolute -top-3 -right-3 border border-line bg-surface"
              onClick={() => onChange(value.filter((v) => v !== id))}
            />
          </div>
        ))}
        {busy > 0 ? (
          <div
            role="status"
            className="flex h-[104px] w-[104px] items-center justify-center rounded-md border border-dashed border-control text-center text-body text-muted"
          >
            Adding…
          </div>
        ) : null}
        {!full ? (
          <label
            htmlFor={inputId}
            className="flex h-[104px] w-[104px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-control text-center text-body text-ink hover:bg-subtle focus-within:outline-2 focus-within:outline-primary"
          >
            <ImagePlus size={20} aria-hidden="true" />
            {addLabel}
            <input
              ref={input}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple={!capture}
              {...(capture ? { capture: 'environment' as const } : {})}
              aria-describedby={hintId}
              className="sr-only"
              onChange={(e) => void add(e.target.files)}
            />
          </label>
        ) : null}
      </div>
      <p id={hintId} className="pt-2 text-body text-muted">
        {value.length} of {max}. {hint}
      </p>
      {error ? (
        <Notice tone="danger" live="assertive" className="mt-2">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
