export interface ProcessingJobRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly kind: 'character-swap' | 'virtual-try-on' | 'voice-treatment' | 'video-edit' | 'export';
  readonly provider: string | null;
  readonly status:
    | 'validating'
    | 'submitting'
    | 'queued'
    | 'processing'
    | 'retrieving'
    | 'ready'
    | 'failed'
    | 'expired';
  readonly inputAssetIds: readonly string[];
  readonly outputAssetIds: readonly string[];
  readonly safeErrorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}
