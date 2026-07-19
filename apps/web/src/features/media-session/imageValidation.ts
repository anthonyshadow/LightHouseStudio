import {
  MAX_IMAGE_BYTES,
  getImageQualityWarnings,
  validateImageDescriptor,
  type ImageDescriptorCandidate,
} from '@studio/domain';

export { MAX_IMAGE_BYTES };

export type ImageValidation = {
  blockingError: string | null;
  warnings: string[];
  width?: number;
  height?: number;
};

const loadDimensions = async (file: File): Promise<{ width: number; height: number }> => {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be decoded.'));
    };
    image.src = url;
  });
};

export const validateReferenceImage = async (
  file: File,
  mode: 'lucy-2.5' | 'lucy-vton-3',
): Promise<ImageValidation> => {
  const candidate: ImageDescriptorCandidate = {
    mimeType: file.type,
    sizeBytes: file.size,
  };
  const blockingIssue = validateImageDescriptor(candidate)[0];
  if (blockingIssue) return { blockingError: blockingIssue.message, warnings: [] };

  try {
    const dimensions = await loadDimensions(file);
    const warnings = getImageQualityWarnings(
      { ...candidate, ...dimensions },
      mode === 'lucy-2.5' ? 'character' : 'garment',
    ).map(({ message }) => message);
    return { blockingError: null, warnings, ...dimensions };
  } catch {
    return { blockingError: 'The browser could not decode this image.', warnings: [] };
  }
};
