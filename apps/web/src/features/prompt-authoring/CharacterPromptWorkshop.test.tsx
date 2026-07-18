// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  it('authors all four focused intents and only changes the working draft on explicit Use', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onUse } = renderWorkshop();

    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Gender choice'), 'woman');
    await user.type(screen.getByLabelText('Character concept'), 'documentary photographer');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({
      draft: {
        intent: 'character-transform',
        gender: 'woman',
        characterBase: 'documentary photographer',
      },
    });
    expect(onUse.mock.lastCall?.[0].prompt).toContain('adult woman documentary photographer');

    await user.click(screen.getByRole('button', { name: 'Add one object' }));
    await user.type(screen.getByLabelText(/^Object to add/), 'translucent amber umbrella');
    await user.type(
      screen.getByLabelText(/^Specific placement/),
      "held in the subject's left hand",
    );
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({ draft: { intent: 'add-object' } });
    expect(onUse.mock.lastCall?.[0].prompt).toContain('translucent amber umbrella');

    await user.click(screen.getByRole('button', { name: 'Replace one object' }));
    await user.type(screen.getByLabelText(/^Visible object to replace/), 'ceramic mug');
    await user.type(screen.getByLabelText(/^Replacement/), 'clear glass tumbler');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({ draft: { intent: 'replace-object' } });

    await user.click(screen.getByRole('button', { name: 'Restyle one object' }));
    await user.type(screen.getByLabelText(/^Object to restyle/), 'jacket');
    await user.type(screen.getByLabelText(/^Attribute/), 'material');
    await user.type(screen.getByLabelText(/^New look or value/), 'brushed copper');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));
    expect(onUse.mock.lastCall?.[0]).toMatchObject({ draft: { intent: 'change-attribute' } });

    await user.click(screen.getByRole('button', { name: 'Transform character' }));
    expect(screen.getByLabelText('Character concept')).toHaveValue('documentary photographer');

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks minor descriptions and advises when a requested reference portrait is absent', async () => {
    const user = userEvent.setup();
    renderWorkshop();

    await user.click(screen.getByRole('button', { name: /Keep unchanged/ }));
    await user.click(screen.getByLabelText(/^Match the current portrait/));
    expect(screen.getByText(/no portrait is selected/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Character concept/ }));
    await user.type(screen.getByLabelText('Character concept'), '17-year-old time traveler');
    expect(
      screen.getByText('Structured character prompts support adult subjects only.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
  });

  it('saves normalized text with a restorable structured draft and no image data', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWorkshop({
      hasReferenceImage: true,
      referenceImage: { width: 800, height: 1_000 },
      onSave,
    });

    await user.type(screen.getByLabelText('Character concept'), '  botanical   explorer  ');
    await user.click(screen.getByRole('button', { name: /Keep unchanged/ }));
    await user.click(screen.getByLabelText(/^Match the current portrait/));
    await user.click(screen.getByRole('button', { name: 'Save to Recipe Shelf' }));
    await user.type(screen.getByLabelText(/^Recipe name/), 'Field host');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Recipe Shelf' })).toHaveFocus(),
    );

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: 'Field host',
      draft: {
        intent: 'character-transform',
        characterBase: 'botanical explorer',
        matchReference: true,
      },
    });
    expect(JSON.stringify(onSave.mock.calls[0]?.[0])).not.toMatch(/imageData|objectUrl|blob:/i);
  });

  it('uses one accessible progressive section at a time and keeps the action footer available', async () => {
    const user = userEvent.setup();
    const { container } = renderWorkshop();

    const conceptStep = screen.getByRole('button', { name: /Character concept/ });
    const appearanceStep = screen.getByRole('button', { name: /Appearance & hair/ });
    expect(conceptStep).toHaveAttribute('aria-expanded', 'true');
    expect(appearanceStep).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Character concept')).toBeInTheDocument();
    expect(screen.queryByLabelText('Appearance')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-scroll-region="character-workshop"]'),
    ).toBeInTheDocument();

    await user.click(appearanceStep);
    expect(conceptStep).toHaveAttribute('aria-expanded', 'false');
    expect(appearanceStep).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByLabelText('Character concept')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Appearance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeInTheDocument();
  });

  it('confirms before resetting a nonempty intent and leaves other intent drafts intact', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderWorkshop();

    await user.type(screen.getByLabelText('Character concept'), 'night market host');
    await user.click(screen.getByRole('button', { name: 'Add one object' }));
    await user.type(screen.getByLabelText(/^Object to add/), 'paper lantern');
    await user.click(screen.getByRole('button', { name: 'Transform character' }));

    await user.click(screen.getByRole('button', { name: 'Reset this intent' }));
    expect(screen.getByLabelText('Character concept')).toHaveValue('night market host');
    await user.click(screen.getByRole('button', { name: 'Reset this intent' }));
    expect(screen.getByLabelText('Character concept')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Add one object' }));
    expect(screen.getByLabelText(/^Object to add/)).toHaveValue('paper lantern');
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('restores inactive intent drafts supplied by the session owner after remounting', async () => {
    const user = userEvent.setup();
    const characterDraft = {
      ...createPromptBuilderDraft('character-transform'),
      characterBase: 'remembered field host',
    };

    renderWorkshop({
      initialDraft: createPromptBuilderDraft('add-object'),
      initialDrafts: { 'character-transform': characterDraft },
    });

    await user.click(screen.getByRole('button', { name: 'Transform character' }));
    expect(screen.getByLabelText('Character concept')).toHaveValue('remembered field host');
  });
});
