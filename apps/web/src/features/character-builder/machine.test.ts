import type { ReferenceImageAsset } from '@studio/contracts';
import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { createEmptyGuidedDesign } from './CharacterBuilderForm';
import { DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS } from './ReferenceOptionsFields';
import { characterBuilderReducer, createCharacterBuilderState } from './machine';

const operation = {
  id: 'operation-1',
  requestId: 'request-1',
  sourceRevision: 0,
  sourceKey: 'source-1',
};

const asset: ReferenceImageAsset = {
  assetId: 'bfc07aa9-8510-4687-bfab-92b05dc31a1d',
  mimeType: 'image/png',
  byteSize: 100,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  size: '1024x1536',
  width: 1024,
  height: 1536,
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: 'A documentary presenter.',
  optimizedImagePrompt: 'A documentary presenter, neutral studio reference.',
  lucy25CharacterPrompt: 'Transform the subject into a documentary presenter.',
  normalizedCharacterDescription: 'Documentary presenter',
  preservedCharacterFacts: [],
  technicalDefaultsAdded: [],
  warnings: [],
  options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contentUrl: '/api/reference-images/bfc07aa9-8510-4687-bfab-92b05dc31a1d/content',
};

const initial = () =>
  createCharacterBuilderState(
    createPromptBuilderDraft('character-transform'),
    createEmptyGuidedDesign(),
    DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  );

describe('characterBuilderReducer', () => {
  it('accepts one operation and ignores mismatched late completions', () => {
    const active = characterBuilderReducer(initial(), {
      type: 'operation-started',
      phase: 'generating',
      operation,
    });
    const duplicate = characterBuilderReducer(active, {
      type: 'operation-started',
      phase: 'generating',
      operation: { ...operation, id: 'operation-2' },
    });
    expect(duplicate.operation?.id).toBe('operation-1');

    const late = characterBuilderReducer(active, {
      type: 'preview-succeeded',
      operationId: 'operation-2',
      asset,
      sourceKey: 'source-1',
    });
    expect(late.preview).toBeNull();
  });

  it('marks an existing preview stale on form edits and advances its autosave revision', () => {
    const active = characterBuilderReducer(initial(), {
      type: 'operation-started',
      phase: 'generating',
      operation,
    });
    const previewReady = characterBuilderReducer(active, {
      type: 'preview-succeeded',
      operationId: operation.id,
      asset,
      sourceKey: operation.sourceKey,
    });
    expect(previewReady.revision).toBe(1);
    expect(previewReady.preview?.stale).toBe(false);

    const edited = characterBuilderReducer(previewReady, {
      type: 'edited',
      draft: { ...previewReady.draft, outfit: 'navy blazer' },
      design: previewReady.design,
      sourceKey: 'source-2',
    });
    expect(edited.preview?.asset.assetId).toBe(asset.assetId);
    expect(edited.preview?.stale).toBe(true);

    const returnedToOriginal = characterBuilderReducer(edited, {
      type: 'edited',
      draft: previewReady.draft,
      design: previewReady.design,
      sourceKey: operation.sourceKey,
    });
    expect(returnedToOriginal.preview?.stale).toBe(true);
  });

  it('retains the prior preview when regeneration fails', () => {
    const ready = {
      ...initial(),
      phase: 'regenerating' as const,
      preview: { asset, sourceKey: 'source-1', stale: false },
      operation,
    };
    const failed = characterBuilderReducer(ready, {
      type: 'operation-failed',
      operationId: operation.id,
      sourceKey: operation.sourceKey,
      kind: 'generation',
      message: 'Provider timed out.',
    });
    expect(failed.phase).toBe('generation-failed');
    expect(failed.preview?.asset.assetId).toBe(asset.assetId);
    expect(failed.error).toBe('Provider timed out.');
  });

  it.each(['saving', 'closing'] as const)(
    'ignores form and option changes while %s is atomic',
    (phase) => {
      const locked = {
        ...initial(),
        phase,
        operation: phase === 'saving' ? operation : null,
      };
      const edited = characterBuilderReducer(locked, {
        type: 'edited',
        draft: { ...locked.draft, outfit: 'changed during an atomic phase' },
        design: locked.design,
        sourceKey: 'source-2',
      });
      const optionsChanged = characterBuilderReducer(locked, {
        type: 'options-changed',
        options: { ...locked.options, framing: 'waist_up' },
        sourceKey: 'source-2',
      });

      expect(edited).toBe(locked);
      expect(optionsChanged).toBe(locked);
    },
  );

  it('clears an in-flight generation lock when closing', () => {
    const generating = characterBuilderReducer(initial(), {
      type: 'operation-started',
      phase: 'generating',
      operation,
    });

    const closing = characterBuilderReducer(generating, { type: 'closing' });
    const reopened = characterBuilderReducer(closing, { type: 'closed' });

    expect(closing.operation).toBeNull();
    expect(reopened.operation).toBeNull();
    expect(reopened.phase).toBe('editing');
  });

  it('rejects a completion whose source key does not match the frozen operation', () => {
    const active = characterBuilderReducer(initial(), {
      type: 'operation-started',
      phase: 'generating',
      operation,
    });
    const mismatched = characterBuilderReducer(active, {
      type: 'preview-succeeded',
      operationId: operation.id,
      sourceKey: 'different-source',
      asset,
    });

    expect(mismatched).toBe(active);
  });

  it('invalidates an in-flight generation when Reset is requested', () => {
    const active = characterBuilderReducer(initial(), {
      type: 'operation-started',
      phase: 'generating',
      operation,
    });
    const confirming = characterBuilderReducer(active, { type: 'request-reset' });
    const late = characterBuilderReducer(confirming, {
      type: 'preview-succeeded',
      operationId: operation.id,
      sourceKey: operation.sourceKey,
      asset,
    });

    expect(confirming.phase).toBe('confirming-reset');
    expect(confirming.operation).toBeNull();
    expect(late).toBe(confirming);
  });
});
