export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const RECOMMENDED_IMAGE_BYTES = 5 * 1024 * 1024;
export const RECOMMENDED_SHORTEST_SIDE = 512;

export interface EphemeralImageDescriptor {
  /** Stable only for the lifetime of this tab; no URL or image bytes belong here. */
  readonly id: string;
  readonly name: string;
  readonly mimeType: ImageMimeType;
  readonly sizeBytes: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Untrusted image metadata at the validation boundary. A candidate deliberately
 * accepts any MIME type; successful validation is what permits narrowing it to
 * an {@link EphemeralImageDescriptor}.
 */
export interface ImageDescriptorCandidate {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width?: number;
  readonly height?: number;
}

export type ImageValidationCode = 'empty-image' | 'image-too-large' | 'unsupported-image-type';

export interface ImageValidationIssue {
  readonly code: ImageValidationCode;
  readonly message: string;
}

export type ImageQualityWarningCode =
  'large-image' | 'low-resolution' | 'weak-character-aspect' | 'weak-garment-aspect';

export interface ImageQualityWarning {
  readonly code: ImageQualityWarningCode;
  readonly message: string;
}

export const isImageMimeType = (value: string): value is ImageMimeType =>
  IMAGE_MIME_TYPES.some((type) => type === value);

export const validateImageDescriptor = (
  image: ImageDescriptorCandidate,
): readonly ImageValidationIssue[] => {
  const issues: ImageValidationIssue[] = [];
  if (image.sizeBytes <= 0) {
    issues.push({ code: 'empty-image', message: 'Choose a nonempty image.' });
  }
  if (image.sizeBytes > MAX_IMAGE_BYTES) {
    issues.push({
      code: 'image-too-large',
      message: 'Choose an image that is 10 MiB or smaller.',
    });
  }
  if (!isImageMimeType(image.mimeType)) {
    issues.push({
      code: 'unsupported-image-type',
      message: 'Choose a JPEG, PNG, or WebP image.',
    });
  }
  return issues;
};

export const getImageQualityWarnings = (
  image: ImageDescriptorCandidate,
  semantics: 'character' | 'garment',
): readonly ImageQualityWarning[] => {
  const warnings: ImageQualityWarning[] = [];
  if (image.sizeBytes > RECOMMENDED_IMAGE_BYTES) {
    warnings.push({
      code: 'large-image',
      message: 'Images below 5 MiB usually respond faster in a realtime session.',
    });
  }

  if (image.width && image.height) {
    if (Math.min(image.width, image.height) < RECOMMENDED_SHORTEST_SIDE) {
      warnings.push({
        code: 'low-resolution',
        message: 'A shortest side of at least 512 px usually produces clearer guidance.',
      });
    }
    const ratio = image.width / image.height;
    if (semantics === 'character' && (ratio < 0.55 || ratio > 1.05)) {
      warnings.push({
        code: 'weak-character-aspect',
        message: 'A clear portrait-oriented reference generally works best for character identity.',
      });
    }
    if (semantics === 'garment' && (ratio < 0.4 || ratio > 2.5)) {
      warnings.push({
        code: 'weak-garment-aspect',
        message: 'Use an image where the garment is clearly visible and fills the frame.',
      });
    }
  }

  return warnings;
};
