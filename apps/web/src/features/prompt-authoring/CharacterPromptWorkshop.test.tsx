// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { CharacterPromptWorkshop, type PromptWorkshopAction } from './CharacterPromptWorkshop';
import { createPromptBuilderDraft } from './model';

const renderWorkshop = (
  props: Partial<React.ComponentProps<typeof CharacterPromptWorkshop>> = {},
) => {
  const onUse = vi.fn<(action: PromptWorkshopAction) => void>();
  const result = render(
    <StudioDesignProvider>
      <CharacterPromptWorkshop onUse={onUse} {...props} />
    </StudioDesignProvider>,
  );
  return { onUse, ...result };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CharacterPromptWorkshop', () => {
  it('owns only Add, Replace, and Restyle settings', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onUse } = renderWorkshop();

    expect(screen.queryByRole('button', { name: 'Transform character' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Character concept')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate reference/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Object to add/), 'translucent amber umbrella');
    await user.type(
      screen.getByLabelText(/^Specific placement/),
      "held in the subject's left hand",
    );
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({
      draft: { intent: 'add-object' },
      referenceImageAssetId: null,
    });

    await user.click(screen.getByRole('button', { name: 'Replace one object' }));
    await user.type(screen.getByLabelText(/^Visible object to replace/), 'ceramic mug');
    await user.type(screen.getByLabelText(/^Replacement/), 'clear glass tumbler');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({
      draft: { intent: 'replace-object' },
      referenceImageAssetId: null,
    });

    await user.click(screen.getByRole('button', { name: 'Restyle one object' }));
    await user.type(screen.getByLabelText(/^Object to restyle/), 'jacket');
    await user.type(screen.getByLabelText(/^Attribute/), 'material');
    await user.type(screen.getByLabelText(/^New look or value/), 'brushed copper');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({
      draft: { intent: 'change-attribute' },
      referenceImageAssetId: null,
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15_000);

  it('does not revive a legacy character draft passed to Workshop', () => {
    const legacyDraft = createPromptBuilderDraft('character-transform');
    if (legacyDraft.intent !== 'character-transform') throw new Error('Expected character draft.');
    renderWorkshop({
      initialDraft: {
        ...legacyDraft,
        characterBase: 'legacy character',
      },
    });

    expect(screen.getByRole('button', { name: 'Add one object' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('legacy character')).not.toBeInTheDocument();
  });

  it('keeps each non-character draft while switching intents', async () => {
    const user = userEvent.setup();
    renderWorkshop();

    await user.type(screen.getByLabelText(/^Object to add/), 'paper lantern');
    await user.click(screen.getByRole('button', { name: 'Replace one object' }));
    await user.type(screen.getByLabelText(/^Visible object to replace/), 'mug');
    await user.click(screen.getByRole('button', { name: 'Add one object' }));
    expect(screen.getByLabelText(/^Object to add/)).toHaveValue('paper lantern');
    await user.click(screen.getByRole('button', { name: 'Replace one object' }));
    expect(screen.getByLabelText(/^Visible object to replace/)).toHaveValue('mug');
  });

  it('confirms before resetting only the current intent', async () => {
    const user = userEvent.setup();
    renderWorkshop();

    await user.type(screen.getByLabelText(/^Object to add/), 'paper lantern');

    // Declining leaves the intent's choices untouched.
    await user.click(screen.getByRole('button', { name: 'Reset this intent' }));
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText(/^Object to add/)).toHaveValue('paper lantern');

    await user.click(await screen.findByRole('button', { name: 'Reset this intent' }));
    await user.click(screen.getByRole('button', { name: 'Reset intent' }));
    expect(screen.getByLabelText(/^Object to add/)).toHaveValue('');
  });

  it('restores saved non-character drafts supplied by the session owner', async () => {
    const user = userEvent.setup();
    const replaceDraft = {
      ...createPromptBuilderDraft('replace-object'),
      target: 'ceramic mug',
      replacementDescription: 'glass tumbler',
    };
    renderWorkshop({
      initialDraft: createPromptBuilderDraft('add-object'),
      initialDrafts: { 'replace-object': replaceDraft },
    });

    await user.click(screen.getByRole('button', { name: 'Replace one object' }));
    expect(screen.getByLabelText(/^Visible object to replace/)).toHaveValue('ceramic mug');
    expect(screen.getByLabelText(/^Replacement/)).toHaveValue('glass tumbler');
  });

  it('does not expose the retired Recipe save UI', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWorkshop({ onSave });

    await user.type(screen.getByLabelText(/^Object to add/), '  paper   lantern  ');
    await user.type(screen.getByLabelText(/^Specific placement/), 'above the doorway');
    expect(screen.queryByText(/Recipe/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save/i })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses one accessible progressive section at a time', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkshop();
    const editStep = screen.getByRole('button', { name: /Object & placement/ });
    const constraintsStep = screen.getByRole('button', { name: /Optional guardrails/ });

    expect(editStep).toHaveAttribute('aria-expanded', 'true');
    expect(constraintsStep).toHaveAttribute('aria-expanded', 'false');
    await user.click(constraintsStep);
    expect(editStep).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Optional guardrails')).toBeInTheDocument();
    expect(container.querySelector('[data-scroll-region="prompt-workshop"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeInTheDocument();
  });
});
