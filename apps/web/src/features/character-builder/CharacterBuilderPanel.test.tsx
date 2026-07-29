// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      /OpenAI \(gpt-5.6\).*Black Forest Labs \(flux-2-pro\).*may use provider credits.*immutable local asset.*Upload and Save without generation do not contact/i,
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
});
