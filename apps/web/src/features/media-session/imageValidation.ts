const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { blockingError: 'Choose a JPEG, PNG, or WebP image.', warnings: [] };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { blockingError: 'Images may be at most 10 MiB.', warnings: [] };
  }
  if (file.size === 0) {
    return { blockingError: 'The selected image is empty.', warnings: [] };
  }

  try {
    const dimensions = await loadDimensions(file);
    const warnings: string[] = [];
    if (Math.min(dimensions.width, dimensions.height) < 512) {
      warnings.push(
        'A shortest side of at least 512 px usually produces a clearer realtime result.',
      );
    }
    const ratio = dimensions.width / dimensions.height;
    if (mode === 'lucy-2.5' && (ratio < 0.55 || ratio > 1.15)) {
      warnings.push('A clear portrait-oriented character reference is usually most consistent.');
    }
    if (mode === 'lucy-vton-3' && ratio > 2.2) {
      warnings.push('A centered garment on a simple background is usually easiest to reproduce.');
    }
    if (file.size > 5 * 1024 * 1024) {
      warnings.push('Files below 5 MiB usually update more quickly in a live session.');
    }
    return { blockingError: null, warnings, ...dimensions };
  } catch {
    return { blockingError: 'The browser could not decode this image.', warnings: [] };
  }
};
