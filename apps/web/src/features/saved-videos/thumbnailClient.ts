/** The longest edge of a stored poster frame. The short edge follows the source aspect ratio. */
const THUMBNAIL_LONG_EDGE = 480;

/** Where in the video an automatic poster frame is taken from, in seconds. */
const autoFrameTimestamp = (durationSeconds: number): number =>
  Math.min(1, Math.max(0, durationSeconds / 10));

/**
 * One bounded dimension, so `CanvasSink` deduces the other from the source aspect ratio.
 *
 * Constraining both would centre-crop portrait sources into a landscape tile. Sources already
 * inside the bound are never upscaled.
 */
const boundedCanvasSize = (
  displayWidth: number,
  displayHeight: number,
): { readonly width: number } | { readonly height: number } => {
  const usable =
    Number.isFinite(displayWidth) &&
    Number.isFinite(displayHeight) &&
    displayWidth > 0 &&
    displayHeight > 0;
  if (!usable) return { width: THUMBNAIL_LONG_EDGE };
  return displayWidth >= displayHeight
    ? { width: Math.min(THUMBNAIL_LONG_EDGE, Math.round(displayWidth)) }
    : { height: Math.min(THUMBNAIL_LONG_EDGE, Math.round(displayHeight)) };
};

const canvasBlob = async (canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> => {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.78 });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode the video thumbnail.'));
      },
      'image/webp',
      0.78,
    );
  });
};

/** Which frame of the video the poster is taken from. */
export type SavedVideoThumbnailFrame = 'auto' | 'first';

export const createSavedVideoThumbnail = async (
  video: Blob,
  signal: AbortSignal,
  frame: SavedVideoThumbnailFrame = 'auto',
): Promise<Blob> => {
  if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
  try {
    if (!(await input.canRead())) throw new Error('The video cannot be decoded for a thumbnail.');
    const track = await input.getPrimaryVideoTrack();
    if (track === null) throw new Error('The video has no thumbnail frame.');
    const duration = (await input.getDurationFromMetadata()) ?? 0;
    const sink = new CanvasSink(track, boundedCanvasSize(track.displayWidth, track.displayHeight));
    const canvas = await sink.getCanvas(frame === 'first' ? 0 : autoFrameTimestamp(duration));
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    if (canvas === null) throw new Error('The video has no thumbnail frame.');
    const thumbnail = await canvasBlob(canvas.canvas);
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    return thumbnail;
  } finally {
    input.dispose();
  }
};

const drawToCanvas = (
  source: ImageBitmap,
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof document === 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    const context = offscreen.getContext('2d');
    if (context === null) throw new Error('The browser could not prepare the thumbnail image.');
    context.drawImage(source, 0, 0, width, height);
    return offscreen;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The browser could not prepare the thumbnail image.');
  context.drawImage(source, 0, 0, width, height);
  return canvas;
};

/**
 * Re-encodes an operator-supplied image as the same bounded WebP poster the video path produces,
 * so an uploaded preview keeps its own aspect ratio and stays inside the upload limit.
 */
export const createSavedVideoThumbnailFromImage = async (
  image: Blob,
  signal: AbortSignal,
): Promise<Blob> => {
  if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
  const bitmap = await createImageBitmap(image);
  try {
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    const bound = boundedCanvasSize(bitmap.width, bitmap.height);
    const scale = 'width' in bound ? bound.width / bitmap.width : bound.height / bitmap.height;
    const thumbnail = await canvasBlob(
      drawToCanvas(
        bitmap,
        Math.max(1, Math.round(bitmap.width * scale)),
        Math.max(1, Math.round(bitmap.height * scale)),
      ),
    );
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    return thumbnail;
  } finally {
    bitmap.close();
  }
};
