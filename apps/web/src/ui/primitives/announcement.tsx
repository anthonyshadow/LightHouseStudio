import { useCallback, useState } from 'react';
import { VisuallyHidden } from './VisuallyHidden';

/** One sentence to be said aloud, and the count that makes a repeat of it audible. */
export interface Announcement {
  readonly text: string;
  readonly nonce: number;
}

/**
 * A live region a surface writes to, and the one thing that makes a repeat of a sentence audible.
 *
 * A screen reader announces a live region when it *changes*, and React writes nothing to the DOM
 * when the same string is rendered twice — so "Clip removed from the arrangement." twice in a row
 * would be heard once. The count rides along with the text and remounts it, which makes the second
 * one a change.
 *
 * For an announcement that is *derived* rather than said — "12 voices shown" — this is the wrong
 * tool: an identical string there means nothing happened, and React's own skip is what you want.
 * Render those through {@link VisuallyHidden} with a `role` directly.
 *
 * Deliberately outside the `ui` barrel, and imported by its path: only lazily loaded surfaces
 * announce anything, and the shell imports that barrel — so exporting it there would put this in
 * the closure every authenticated route loads, for nothing. `Skeleton` and `LoadingPlaceholder`
 * sit outside it for the same reason.
 */
export const useAnnouncement = () => {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', nonce: 0 });
  const announce = useCallback(
    (text: string) => setAnnouncement((held) => ({ text, nonce: held.nonce + 1 })),
    [],
  );
  return { announcement, announce };
};

/**
 * The region itself. `status` is the polite, read-whole live region — it implies `aria-live` and
 * `aria-atomic`, so neither is written here.
 */
export const AnnouncementRegion = ({ announcement }: { readonly announcement: Announcement }) => (
  <VisuallyHidden role="status">
    <span key={announcement.nonce}>{announcement.text}</span>
  </VisuallyHidden>
);
