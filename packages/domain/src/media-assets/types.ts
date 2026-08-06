export type MediaAssetKind = 'image' | 'video' | 'audio' | 'thumbnail';
export type MediaAssetPurpose =
  'uploaded-input' | 'recorded-input' | 'generated-output' | 'edited-output' | 'thumbnail';

export interface MediaAssetRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly kind: MediaAssetKind;
  readonly purpose: MediaAssetPurpose;
  readonly storageProvider: 'local';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sourceAssetId: string | null;
  readonly status: 'pending' | 'ready' | 'missing' | 'deleted';
  readonly createdAt: string;
  readonly deletedAt: string | null;
}
