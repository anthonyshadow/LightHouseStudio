import {
  createSavedVideoThumbnail,
  createSavedVideoThumbnailFromImage,
  type SavedVideoThumbnailMedia,
} from './thumbnailClient';

/**
 * Where a poster frame comes from. `auto` is the long-standing behaviour — an early frame chosen
 * for the operator — and stays the default for every caller that expresses no preference.
 */
export type SavedVideoThumbnailChoice =
  | { readonly kind: 'auto' }
  | { readonly kind: 'first-frame' }
  | { readonly kind: 'image'; readonly file: File };

export const DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE: SavedVideoThumbnailChoice = { kind: 'auto' };

/** Only a choice that reads a frame needs the video bytes at all. */
export const thumbnailChoiceNeedsVideo = (choice: SavedVideoThumbnailChoice): boolean =>
  choice.kind !== 'image';

const createOnce = (
  choice: SavedVideoThumbnailChoice,
  media: SavedVideoThumbnailMedia | null,
  signal: AbortSignal,
): Promise<Blob> => {
  if (choice.kind === 'image') return createSavedVideoThumbnailFromImage(choice.file, signal);
  if (media === null) throw new Error('The video bytes for this preview are unavailable.');
  return createSavedVideoThumbnail(media, signal, choice.kind === 'first-frame' ? 'first' : 'auto');
};

const aborted = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted || (error instanceof DOMException && error.name === 'AbortError');

/**
 * Generates the chosen poster, retrying a transient failure once. An aborted attempt is never
 * retried, and the last failure is rethrown so callers decide whether it is fatal.
 */
export const createThumbnailForChoice = async (
  choice: SavedVideoThumbnailChoice,
  media: SavedVideoThumbnailMedia | null,
  signal: AbortSignal,
): Promise<Blob> => {
  try {
    return await createOnce(choice, media, signal);
  } catch (error) {
    if (aborted(error, signal)) throw error;
    return await createOnce(choice, media, signal);
  }
};
