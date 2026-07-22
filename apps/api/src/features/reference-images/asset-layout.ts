import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
  characterPromptOptimizationInputHashSchema,
  characterPromptOptimizationResultSchema,
  characterReferenceGeneratorSchema,
  characterReferenceOptionsSchema,
  REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_QUALITY,
  referenceImageSizeSchema,
  type CharacterPromptOptimizationResult,
  type CharacterReferenceGenerator,
  type CharacterReferenceOptions,
  type ReferenceImageSize,
} from '@studio/contracts';
import type { ValidReferenceImageMimeType } from './image-validation.js';

export const REFERENCE_IMAGE_LAYOUT_VERSION = 1;
export const REFERENCE_IMAGE_DIRECTORY_MODE = 0o700;
export const REFERENCE_IMAGE_FILE_MODE = 0o600;
export const STALE_REFERENCE_IMAGE_TEMP_AGE_MS = 24 * 60 * 60 * 1_000;

const promptAuditSchema = z
  .object({
    optimizationEnabled: z.boolean(),
    result: characterPromptOptimizationResultSchema,
    options: characterReferenceOptionsSchema,
    requestedGenerator: characterReferenceGeneratorSchema.nullable(),
    optimizer: z
      .object({
        model: z.string().trim().min(1).max(128),
        version: z.string().trim().min(1).max(128),
      })
      .strict()
      .nullable(),
    inputHash: characterPromptOptimizationInputHashSchema.nullable(),
    manuallyEdited: z.boolean(),
  })
  .strict();

const internalDerivationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generate') }).strict(),
  z
    .object({
      kind: z.literal('edit'),
      sourceAssetId: z.uuid(),
      changeInstructionsHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
]);

const storedReferenceImageMetadataSchema = z
  .object({
    schemaVersion: z.literal(REFERENCE_IMAGE_LAYOUT_VERSION),
    assetId: z.uuid(),
    localOwnerId: z.string().regex(/^[a-f0-9]{64}$/u),
    storageKey: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    size: referenceImageSizeSchema.optional(),
    width: z.union([z.literal(1024), z.literal(1536)]),
    height: z.union([z.literal(1024), z.literal(1536)]),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(REFERENCE_IMAGE_MAX_BYTES - 1),
    source: z.literal('generated'),
    provider: z.literal('openai'),
    model: z.string().trim().min(1).max(128),
    quality: z.enum(['high', 'medium']).optional(),
    originalPrompt: z.string().min(1).max(REFERENCE_IMAGE_PROMPT_MAX_LENGTH),
    derivedPrompt: z.string().min(1).max(REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH),
    promptAudit: promptAuditSchema.optional(),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/u),
    requestId: z.uuid(),
    requestFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    derivation: internalDerivationSchema.optional(),
    providerRequestId: z.string().min(1).max(500).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const size = value.size ?? '1024x1024';
    const dimensions =
      size === '1024x1536'
        ? { width: 1024, height: 1536 }
        : size === '1536x1024'
          ? { width: 1536, height: 1024 }
          : { width: 1024, height: 1024 };
    if (value.width !== dimensions.width || value.height !== dimensions.height) {
      context.addIssue({ code: 'custom', message: 'Stored image dimensions do not match size.' });
    }
  });

const idempotencyMappingSchema = z
  .object({
    schemaVersion: z.literal(REFERENCE_IMAGE_LAYOUT_VERSION),
    localOwnerId: z.string().regex(/^[a-f0-9]{64}$/u),
    requestId: z.uuid(),
    assetId: z.uuid(),
  })
  .strict();

export type StoredReferenceImageMetadata = z.infer<typeof storedReferenceImageMetadataSchema>;
export type ReferenceImageIdempotencyMapping = z.infer<typeof idempotencyMappingSchema>;

export interface StoreReferenceImageInput {
  readonly localOwnerId: string;
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly size: ReferenceImageSize;
  readonly width: 1024 | 1536;
  readonly height: 1024 | 1536;
  readonly model: string;
  readonly quality: 'high' | 'medium';
  readonly originalPrompt: string;
  readonly derivedPrompt: string;
  readonly promptAudit: {
    readonly optimizationEnabled: boolean;
    readonly result: CharacterPromptOptimizationResult;
    readonly options: CharacterReferenceOptions;
    readonly requestedGenerator: CharacterReferenceGenerator | null;
    readonly optimizer: { readonly model: string; readonly version: string } | null;
    readonly inputHash: string | null;
    readonly manuallyEdited: boolean;
  };
  readonly promptHash: string;
  readonly requestId: string;
  readonly requestFingerprint?: string;
  readonly derivation?:
    | { readonly kind: 'generate' }
    | {
        readonly kind: 'edit';
        readonly sourceAssetId: string;
        readonly changeInstructionsHash: string;
      };
  readonly providerRequestId?: string;
}

export interface ReferenceImageLayout {
  readonly root: string;
  readonly assetsRoot: string;
  readonly idempotencyRoot: string;
}

export const createReferenceImageLayout = (dataDirectory: string): ReferenceImageLayout => {
  const root = path.resolve(
    dataDirectory,
    'reference-images',
    `v${REFERENCE_IMAGE_LAYOUT_VERSION}`,
  );
  return {
    root,
    assetsRoot: path.join(root, 'assets'),
    idempotencyRoot: path.join(root, 'idempotency'),
  };
};

const digestPathSegment = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const referenceImageMappingPath = (
  layout: ReferenceImageLayout,
  localOwnerId: string,
  requestId: string,
): string =>
  path.join(
    layout.idempotencyRoot,
    digestPathSegment(localOwnerId),
    `${digestPathSegment(requestId)}.json`,
  );

export const parseReferenceImageAssetId = (assetId: string): string | null => {
  const parsed = z.uuid().safeParse(assetId);
  return parsed.success ? parsed.data : null;
};

export const referenceImageContentExtension = (mimeType: ValidReferenceImageMimeType): string => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
};

export const referenceImageContentFilename = (mimeType: ValidReferenceImageMimeType): string =>
  `content.${referenceImageContentExtension(mimeType)}`;

export const referenceImageStorageKey = (
  assetId: string,
  mimeType: ValidReferenceImageMimeType,
): string =>
  path.posix.join(
    'reference-images',
    `v${REFERENCE_IMAGE_LAYOUT_VERSION}`,
    'assets',
    assetId,
    referenceImageContentFilename(mimeType),
  );

export const parseStoredReferenceImageMetadata = (value: unknown): StoredReferenceImageMetadata =>
  storedReferenceImageMetadataSchema.parse(value);

export const parseReferenceImageIdempotencyMapping = (
  value: unknown,
): ReferenceImageIdempotencyMapping => idempotencyMappingSchema.parse(value);

export const isReferenceImageCodecError = (error: unknown): boolean =>
  error instanceof SyntaxError || error instanceof z.ZodError;

export const createStoredReferenceImageMetadata = (
  input: StoreReferenceImageInput,
  assetId: string,
  timestamp: string,
): StoredReferenceImageMetadata =>
  storedReferenceImageMetadataSchema.parse({
    schemaVersion: REFERENCE_IMAGE_LAYOUT_VERSION,
    assetId,
    localOwnerId: input.localOwnerId,
    storageKey: referenceImageStorageKey(assetId, input.mimeType),
    mimeType: input.mimeType,
    size: input.size,
    width: input.width,
    height: input.height,
    byteSize: input.bytes.byteLength,
    source: 'generated',
    provider: 'openai',
    model: input.model || REFERENCE_IMAGE_MODEL_ID,
    quality: input.quality || REFERENCE_IMAGE_QUALITY,
    originalPrompt: input.originalPrompt,
    derivedPrompt: input.derivedPrompt,
    promptAudit: input.promptAudit,
    promptHash: input.promptHash,
    requestId: input.requestId,
    ...(input.requestFingerprint === undefined
      ? {}
      : { requestFingerprint: input.requestFingerprint }),
    ...(input.derivation === undefined ? {} : { derivation: input.derivation }),
    ...(input.providerRequestId === undefined
      ? {}
      : { providerRequestId: input.providerRequestId }),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

export const serializeStoredReferenceImageMetadata = (
  metadata: StoredReferenceImageMetadata,
): string => `${JSON.stringify(metadata)}\n`;

export const serializeReferenceImageIdempotencyMapping = (
  metadata: StoredReferenceImageMetadata,
): string =>
  `${JSON.stringify({
    schemaVersion: REFERENCE_IMAGE_LAYOUT_VERSION,
    localOwnerId: metadata.localOwnerId,
    requestId: metadata.requestId,
    assetId: metadata.assetId,
  })}\n`;
