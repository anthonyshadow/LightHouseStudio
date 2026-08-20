import { useEffect, useState } from 'react';

export type ObjectUrlPreview = Readonly<{ file: File; url: string }>;

/**
 * A preview URL for a picked file, revoked as soon as the file changes or the field unmounts.
 *
 * The ordering is the delicate part, and it is stated once here for every picker that needs it.
 * The URL is created in the effect but published a microtask later, so a URL that is about to be
 * revoked can never reach a render; and the preview is handed back only while it still matches the
 * file it was made from, so a newer pick is never shown against an older image.
 */
export const useObjectUrlPreview = (file: File | null): ObjectUrlPreview | null => {
  const [preview, setPreview] = useState<ObjectUrlPreview | null>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') return;
    const objectUrl = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ file, url: objectUrl });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return preview?.file === file ? preview : null;
};
