import {
  characterReferenceOptionsSchema,
  referenceImageAssetIdSchema,
  type CharacterReferenceOptions,
} from '@studio/contracts';
import {
  sanitizeGuidedDesignV1,
  sanitizePromptBuilderDraft,
  type CharacterTransformDraft,
  type GuidedDesignV1,
} from '@studio/domain';

export type CharacterSaveStage = 'intent' | 'character-persisted' | 'studio-preloaded';

export interface PersistedCharacterSaveSnapshot {
  readonly name: string;
  readonly prompt: string;
  readonly draft: CharacterTransformDraft;
  readonly design: GuidedDesignV1;
  readonly referenceImageAssetId: string | null;
}

export interface PendingCharacterSave {
  readonly characterId: string;
  readonly snapshotHash: string;
  readonly stage: CharacterSaveStage;
  readonly snapshot: PersistedCharacterSaveSnapshot;
}

export interface PersistedCharacterBuilderPreview {
  readonly assetId: string;
  readonly sourceKey: string;
  readonly stale: boolean;
}

export interface CharacterBuilderDraftValueV1 {
  readonly draft: CharacterTransformDraft;
  readonly design: GuidedDesignV1;
  readonly options: CharacterReferenceOptions;
  readonly preview: PersistedCharacterBuilderPreview | null;
  readonly pendingSave: PendingCharacterSave | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeSnapshot = (value: unknown): PersistedCharacterSaveSnapshot | null => {
  if (!isRecord(value)) return null;
  const draft = sanitizePromptBuilderDraft(value.draft);
  const design = sanitizeGuidedDesignV1(value.design);
  const reference =
    value.referenceImageAssetId === null
      ? null
      : referenceImageAssetIdSchema.safeParse(value.referenceImageAssetId);
  if (
    draft?.intent !== 'character-transform' ||
    !design ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.prompt !== 'string' ||
    !value.prompt.trim() ||
    (reference !== null && !reference.success)
  ) {
    return null;
  }
  return {
    name: value.name.slice(0, 80),
    prompt: value.prompt.slice(0, 10_000),
    draft,
    design,
    referenceImageAssetId: reference === null ? null : reference.data,
  };
};

const sanitizePendingSave = (value: unknown): PendingCharacterSave | null => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.characterId !== 'string' ||
    !value.characterId.trim() ||
    typeof value.snapshotHash !== 'string' ||
    !value.snapshotHash.trim() ||
    !['intent', 'character-persisted', 'studio-preloaded'].includes(String(value.stage))
  ) {
    return null;
  }
  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!snapshot) return null;
  return {
    characterId: value.characterId,
    snapshotHash: value.snapshotHash,
    stage: value.stage as CharacterSaveStage,
    snapshot,
  };
};

export const sanitizeCharacterBuilderDraftValue = (
  value: unknown,
): CharacterBuilderDraftValueV1 | null => {
  if (!isRecord(value)) return null;
  const draft = sanitizePromptBuilderDraft(value.draft);
  const design = sanitizeGuidedDesignV1(value.design);
  const options = characterReferenceOptionsSchema.safeParse(value.options);
  const rawPendingSave = value.pendingSave ?? null;
  const pendingSave = sanitizePendingSave(rawPendingSave);
  if (
    draft?.intent !== 'character-transform' ||
    !design ||
    !options.success ||
    (rawPendingSave !== null && pendingSave === null)
  ) {
    return null;
  }

  let preview: PersistedCharacterBuilderPreview | null = null;
  if (value.preview !== null && value.preview !== undefined) {
    if (!isRecord(value.preview)) return null;
    const assetId = referenceImageAssetIdSchema.safeParse(value.preview.assetId);
    if (
      !assetId.success ||
      typeof value.preview.sourceKey !== 'string' ||
      !value.preview.sourceKey.trim() ||
      typeof value.preview.stale !== 'boolean'
    ) {
      return null;
    }
    preview = {
      assetId: assetId.data,
      sourceKey: value.preview.sourceKey,
      stale: value.preview.stale,
    };
  }
  return { draft, design, options: options.data, preview, pendingSave };
};

export const characterSaveSnapshotFingerprint = async (
  snapshot: PersistedCharacterSaveSnapshot,
): Promise<string> => {
  const serialized = JSON.stringify(snapshot);
  try {
    const bytes = new TextEncoder().encode(serialized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    let hash = 2_166_136_261;
    for (const character of serialized) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16_777_619);
    }
    return `fallback-${(hash >>> 0).toString(16)}`;
  }
};
