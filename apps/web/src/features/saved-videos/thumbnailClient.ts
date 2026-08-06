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

export const createSavedVideoThumbnail = async (
  video: Blob,
  signal: AbortSignal,
): Promise<Blob> => {
  if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
  try {
    if (!(await input.canRead())) throw new Error('The video cannot be decoded for a thumbnail.');
    const track = await input.getPrimaryVideoTrack();
    if (track === null) throw new Error('The video has no thumbnail frame.');
    const duration = (await input.getDurationFromMetadata()) ?? 0;
    const sink = new CanvasSink(track, { width: 480, height: 270, fit: 'cover' });
    const frame = await sink.getCanvas(Math.min(1, Math.max(0, duration / 10)));
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    if (frame === null) throw new Error('The video has no thumbnail frame.');
    const thumbnail = await canvasBlob(frame.canvas);
    if (signal.aborted) throw new DOMException('Thumbnail creation was aborted.', 'AbortError');
    return thumbnail;
  } finally {
    input.dispose();
  }
};
