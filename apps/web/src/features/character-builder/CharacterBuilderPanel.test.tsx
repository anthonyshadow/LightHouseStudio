// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReferenceImageAsset } from '@studio/contracts';
import { createPromptBuilderDraft } from '@studio/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { createEmptyGuidedDesign } from './characterModel';
import { CharacterBuilderPanel, type CharacterBuilderPanelProps } from './CharacterBuilderPanel';
import { createCharacterBuilderState } from './machine';
import { DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS } from './ReferenceOptionsFields';

const renderPanel = (overrides: Partial<CharacterBuilderPanelProps> = {}) => {
  const onGenerate = vi.fn();
  const state = {
    ...createCharacterBuilderState(
      createPromptBuilderDraft('character-transform'),
      createEmptyGuidedDesign(),
      DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
    ),
    phase: 'editing' as const,
  };

  render(
    <StudioDesignProvider>
      <CharacterBuilderPanel
        open
        state={state}
        generationAvailable
        editAvailable
        canSave
        onChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onGenerate={onGenerate}
        onRequestRegeneration={vi.fn()}
        onRegenerate={vi.fn()}
        onCancelRegeneration={vi.fn()}
        onRequestReset={vi.fn()}
        onConfirmReset={vi.fn()}
        onCancelReset={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        {...overrides}
      />
    </StudioDesignProvider>,
  );

  return { onGenerate };
};

const rawPreviewAsset: ReferenceImageAsset = {
  assetId: '550e8400-e29b-41d4-a716-446655440010',
  mimeType: 'image/jpeg',
  size: '1024x1024',
  width: 1024,
  height: 1024,
  byteSize: 2_048,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  promptHash: 'a'.repeat(64),
  optimizationEnabled: false,
  originalPrompt: 'An adult lunar cartographer.',
  optimizedImagePrompt: 'An adult lunar cartographer.',
  lucy25CharacterPrompt: 'An adult lunar cartographer.',
  normalizedCharacterDescription: 'An adult lunar cartographer.',
  preservedCharacterFacts: [],
  technicalDefaultsAdded: [],
  warnings: [],
  options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  requestedGenerator: null,
  optimizer: null,
  optimizationInputHash: null,
  manuallyEdited: false,
  createdAt: '2026-07-29T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
  contentUrl: '/api/reference-images/550e8400-e29b-41d4-a716-446655440010/content',
};

afterEach(cleanup);

describe('CharacterBuilderPanel Wave 5 trust boundary', () => {
  it('describes optimizer, selected image provider, possible usage, retention, and local paths', async () => {
    const user = userEvent.setup();
    const { onGenerate } = renderPanel({
      referenceImageProvider: 'bfl',
      referenceImageModel: 'flux-2-pro',
      referenceImageOptimizerModel: 'gpt-5.6',
    });

    const generate = screen.getByRole('button', { name: 'Generate Preview' });
    expect(generate).toHaveAccessibleDescription(
      /OpenAI \(gpt-5.6\).*attempts to optimize.*Black Forest Labs \(flux-2-pro\).*may use provider credits.*immutable local asset.*Upload and Save without generation do not contact/i,
    );
    await user.click(generate);
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('keeps participant Wiro generation unavailable while preserving local save', async () => {
    const user = userEvent.setup();
    const { onGenerate } = renderPanel({
      generationAvailable: false,
      editAvailable: false,
      referenceImageProvider: 'wiro',
      referenceImageModel: 'seedream-v5-lite-uncensored',
    });

    expect(screen.getByText(/restricted to explicit operator-qualification runs/i)).toBeVisible();
    expect(screen.getByText(/unavailable for participant generation/i)).toBeVisible();
    expect(screen.getByText(/configured generation path is currently unavailable/i)).toBeVisible();
    const generate = screen.getByRole('button', { name: 'Generate Preview' });
    expect(generate).toHaveAttribute('aria-disabled', 'true');
    await user.click(generate);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Character' })).toBeEnabled();
  });

  it('shows a warning and retries optimization for a raw-generated preview', async () => {
    const user = userEvent.setup();
    const onRetryOptimization = vi.fn();
    const value = createCharacterBuilderState(
      createPromptBuilderDraft('character-transform'),
      createEmptyGuidedDesign(),
      DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
    );
    renderPanel({
      state: {
        ...value,
        phase: 'preview-ready',
        preview: { asset: rawPreviewAsset, sourceKey: 'raw-source', stale: false },
      },
      optimizationAvailable: true,
      onRetryOptimization,
    });

    expect(screen.getByText('Prompt optimization failed')).toBeVisible();
    expect(screen.getByText(/generated from your raw character prompt/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry optimization and regenerate' }));
    expect(onRetryOptimization).toHaveBeenCalledOnce();
  });
});
