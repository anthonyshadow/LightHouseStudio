/**
 * The one owner of "hand the browser a Blob to save as a file". The object URL is revoked only
 * after the click has been dispatched — revoking synchronously cancels the download in some
 * browsers — and the anchor is detached again either way.
 */
export const downloadBlobFile = (blob: Blob, filename: string): void => {
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot save a file from the page.');
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
};
