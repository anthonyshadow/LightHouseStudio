// @vitest-environment jsdom

import type { OptimizeCharacterReferencePromptRequest } from '@studio/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import {
  CharacterPromptWorkshop,
  type PromptWorkshopAction,
  type WorkshopReferenceGenerationInput,
} from './CharacterPromptWorkshop';
import { createPromptBuilderDraft, generateStructuredPrompt } from './model';

type GenerateReferenceHandler = NonNullable<
  React.ComponentProps<typeof CharacterPromptWorkshop>['onGenerateReference']
>;

const generatedReference = {
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  mimeType: 'image/jpeg' as const,
  size: '1024x1024' as const,
  width: 1024 as const,
  height: 1024 as const,
  byteSize: 1_024,
  source: 'generated' as const,
  provider: 'openai' as const,
  model: 'gpt-image-2',
  quality: 'high' as const,
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: 'Substitute the character in the video with a midnight botanist.',
  optimizedImagePrompt: 'Canonical photorealistic reference of a midnight botanist.',
  lucy25CharacterPrompt: 'Replace the character in the video with a midnight botanist.',
  normalizedCharacterDescription: 'A midnight botanist.',
  preservedCharacterFacts: ['midnight botanist'],
  technicalDefaultsAdded: ['neutral background'],
  warnings: [],
  options: {
    framing: 'full_body' as const,
    orientation: 'auto' as const,
    renderingMode: 'photorealistic' as const,
    expression: 'neutral' as const,
    background: 'neutral_gray' as const,
    targetUse: 'lucy_2_5_character_reference' as const,
  },
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contentUrl: '/api/reference-images/550e8400-e29b-41d4-a716-446655440000/content' as const,
};

const populatedCharacterDraft = (characterBase: string) => {
  const draft = createPromptBuilderDraft('character-transform');
  if (draft.intent !== 'character-transform') throw new Error('Expected character draft.');
  return { ...draft, characterBase };
};

const optimizerResponse = (warnings: string[] = []) => ({
  result: {
    optimizedImagePrompt:
      'Create a canonical photorealistic full-body reference of a midnight botanist.',
    lucy25CharacterPrompt:
      'Replace the character in the video with a midnight botanist in a dark field coat.',
    normalizedCharacterDescription: 'A midnight botanist in a dark field coat.',
    preservedCharacterFacts: ['midnight botanist'],
    technicalDefaultsAdded: ['full-body framing', 'neutral gray background'],
    warnings,
    recommendedSettings: {
      framing: 'full_body' as const,
      orientation: 'landscape' as const,
      size: '1536x1024' as const,
      quality: 'high' as const,
      format: 'png' as const,
    },
  },
  model: 'gpt-5.6',
  version: 'lucy-character-reference-v1',
  inputHash: 'b'.repeat(64),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

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
  localStorage.clear();
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
    expect(screen.getByLabelText('Body shape')).toBeInTheDocument();
    expect(screen.getByLabelText('Hair')).toBeInTheDocument();
    expect(screen.getByLabelText('Hair color')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeInTheDocument();
  });

  it('round-trips skin tone, body shape, and hair color independently through Advanced', async () => {
    const user = userEvent.setup();
    const { onUse } = renderWorkshop({
      initialDraft: populatedCharacterDraft('documentary presenter'),
    });

    await user.click(screen.getByRole('button', { name: /Appearance & hair/ }));
    await user.type(screen.getByLabelText('Skin tone'), 'medium brown');
    await user.type(screen.getByLabelText('Body shape'), 'athletic build');
    await user.type(screen.getByLabelText('Hair'), 'long waves');
    await user.type(screen.getByLabelText('Hair color'), 'deep auburn');
    await user.click(screen.getByRole('button', { name: 'Use in working draft' }));

    const action = onUse.mock.calls[0]?.[0];
    expect(action?.prompt).toContain('Body shape: athletic build.');
    expect(action?.prompt).toContain('Skin tone: medium brown. Hair: long waves, deep auburn.');
    expect(action?.draft).toMatchObject({
      skinTone: 'medium brown',
      bodyShape: 'athletic build',
      hair: 'long waves',
      hairColor: 'deep auburn',
    });
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

  it('defaults to safe Lucy reference settings and persists only explicit preference changes', async () => {
    const user = userEvent.setup();
    const props = {
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference: vi.fn(() => Promise.resolve(optimizerResponse())),
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    };
    const first = renderWorkshop(props);

    expect(screen.getByLabelText(/Optimize prompt with GPT/)).toBeChecked();
    expect(screen.getByLabelText('Target Lucy framing')).toHaveValue('full_body');
    expect(screen.getByLabelText('Orientation')).toHaveValue('auto');
    expect(screen.getByLabelText('Rendering')).toHaveValue('photorealistic');
    expect(screen.getByLabelText('Reference expression')).toHaveValue('neutral');
    expect(screen.getByLabelText('Background')).toHaveValue('neutral_gray');

    await user.click(screen.getByLabelText(/Optimize prompt with GPT/));
    await user.selectOptions(screen.getByLabelText('Target Lucy framing'), 'waist_up');
    first.unmount();
    renderWorkshop(props);

    expect(screen.getByLabelText(/Optimize prompt with GPT/)).not.toBeChecked();
    expect(screen.getByLabelText('Target Lucy framing')).toHaveValue('waist_up');
    expect(
      localStorage.getItem('realtime-creator-studio.character-reference-preferences.v1'),
    ).not.toMatch(/midnight botanist|optimizedImagePrompt|lucy25CharacterPrompt/u);
  });

  it('optimizes before generation and routes the optimized result with its server fingerprint', async () => {
    const user = userEvent.setup();
    const events: string[] = [];
    const response = optimizerResponse(['A mask may reduce facial adherence.']);
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) => {
        events.push('optimize');
        return Promise.resolve(response);
      },
    );
    const onGenerateReference = vi.fn((_input: WorkshopReferenceGenerationInput) => {
      events.push('generate');
      return Promise.resolve();
    });
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      referenceImageModel: 'gpt-image-2',
      optimizerModel: response.model,
      optimizerVersion: response.version,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
    });

    expect(screen.getByText('Original character recipe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));

    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());
    expect(events).toEqual(['optimize', 'generate']);
    const optimizationInput = onOptimizeReference.mock.calls[0]?.[0];
    expect(optimizationInput?.rawPrompt).toContain('midnight botanist');
    expect(optimizationInput).toMatchObject({
      options: {
        framing: 'full_body',
        orientation: 'auto',
        renderingMode: 'photorealistic',
        expression: 'neutral',
        background: 'neutral_gray',
        targetUse: 'lucy_2_5_character_reference',
      },
      generator: { provider: 'openai', model: 'gpt-image-2' },
    });
    const generationInput = onGenerateReference.mock.calls[0]?.[0];
    expect(generationInput?.rawPrompt).toContain('midnight botanist');
    expect(generationInput?.options.targetUse).toBe('lucy_2_5_character_reference');
    expect(generationInput).toMatchObject({
      generator: { provider: 'openai', model: 'gpt-image-2' },
      optimization: {
        enabled: true,
        result: response.result,
        model: response.model,
        version: response.version,
        inputHash: response.inputHash,
        manuallyEdited: false,
      },
    });
    expect(screen.getByLabelText('Optimized reference-image prompt')).toHaveValue(
      response.result.optimizedImagePrompt,
    );
    expect(screen.getByLabelText('Lucy 2.5 character prompt')).toHaveValue(
      response.result.lucy25CharacterPrompt,
    );
    expect(screen.getByText('A mask may reduce facial adherence.')).toBeInTheDocument();
    expect(screen.getByLabelText('Optimizer details')).toHaveTextContent(
      'gpt-5.6lucy-character-reference-v1',
    );
  });

  it('preserves a manual optimized-prompt edit and reuses it for generation retries', async () => {
    const user = userEvent.setup();
    const response = optimizerResponse();
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(response),
    );
    const onGenerateReference = vi.fn((_input: WorkshopReferenceGenerationInput) =>
      Promise.resolve(),
    );
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));
    const optimized = await screen.findByLabelText('Optimized reference-image prompt');
    await user.clear(optimized);
    await user.type(optimized, 'A manually refined canonical character reference.');
    expect(screen.getByLabelText('Optimizer details')).toHaveTextContent('Manually edited');

    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledTimes(2));

    expect(onOptimizeReference).toHaveBeenCalledOnce();
    expect(onGenerateReference.mock.calls[1]?.[0]).toMatchObject({
      optimization: {
        enabled: true,
        result: {
          optimizedImagePrompt: 'A manually refined canonical character reference.',
          lucy25CharacterPrompt: response.result.lucy25CharacterPrompt,
        },
        inputHash: response.inputHash,
        manuallyEdited: true,
      },
    });
  });

  it('retains a successful optimization when image generation fails and reuses it on retry', async () => {
    const user = userEvent.setup();
    const response = optimizerResponse();
    const draft = populatedCharacterDraft('midnight botanist');
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(response),
    );
    const onGenerateReference = vi.fn<GenerateReferenceHandler>();
    const sharedProps = {
      initialDraft: draft,
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
      onUse: vi.fn(),
    };
    const view = renderWorkshop(sharedProps);

    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());

    view.rerender(
      <StudioDesignProvider>
        <CharacterPromptWorkshop
          {...sharedProps}
          referenceGeneration={{
            status: 'error',
            error: 'The image provider failed after optimization.',
            errorKind: 'generation',
          }}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByLabelText('Optimized reference-image prompt')).toHaveValue(
      response.result.optimizedImagePrompt,
    );

    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledTimes(2));
    expect(onOptimizeReference).toHaveBeenCalledOnce();
  });

  it('marks an option change stale and re-optimizes before generation', async () => {
    const user = userEvent.setup();
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(optimizerResponse()),
    );
    const onGenerateReference = vi.fn<GenerateReferenceHandler>();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));
    await screen.findByLabelText('Optimized reference-image prompt');
    await user.selectOptions(screen.getByLabelText('Orientation'), 'portrait_9_16');
    expect(screen.getByText(/Optimization is out of date/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());
    expect(onOptimizeReference).toHaveBeenCalledTimes(2);
    expect(onOptimizeReference.mock.calls[1]?.[0].options.orientation).toBe('portrait_9_16');

    await user.type(screen.getByLabelText('Character concept'), ' revised');
    expect(screen.getByText(/Optimization is out of date/)).toBeInTheDocument();
  });

  it('marks an attached asset stale when re-optimization changes only the Lucy prompt', async () => {
    const user = userEvent.setup();
    const draft = populatedCharacterDraft('midnight botanist');
    const response = optimizerResponse();
    const rawPrompt = generateStructuredPrompt(draft, {
      hasReferenceImage: true,
      width: generatedReference.width,
      height: generatedReference.height,
    });
    renderWorkshop({
      initialDraft: draft,
      generatedReferenceImage: {
        ...generatedReference,
        originalPrompt: rawPrompt,
        generatedFromPrompt: rawPrompt,
        optimizedImagePrompt: response.result.optimizedImagePrompt,
        lucy25CharacterPrompt: 'Replace the character with the prior midnight botanist.',
      },
      referenceImagesAvailable: true,
      onOptimizeReference: vi.fn(() => Promise.resolve(response)),
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    });

    expect(screen.queryByText(/Prompt changed — regenerate/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));
    expect(await screen.findByText(/Prompt changed — regenerate/)).toBeInTheDocument();
  });

  it('canonicalizes custom-background whitespace in the optimizer request and stale key', async () => {
    const user = userEvent.setup();
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(optimizerResponse()),
    );
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    });

    await user.selectOptions(screen.getByLabelText('Background'), 'plain_custom');
    await user.type(screen.getByLabelText('Custom plain background'), 'muted  blue');
    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));

    await waitFor(() => expect(onOptimizeReference).toHaveBeenCalledOnce());
    expect(onOptimizeReference.mock.calls[0]?.[0].options.customBackground).toBe('muted blue');
  });

  it('cancels and ignores an optimizer response made stale by a raw prompt edit', async () => {
    const user = userEvent.setup();
    const first = deferred<ReturnType<typeof optimizerResponse>>();
    let firstSignal: AbortSignal | null = null;
    const onOptimizeReference = vi
      .fn((_input: OptimizeCharacterReferencePromptRequest, signal: AbortSignal) => {
        firstSignal = signal;
        return first.promise;
      })
      .mockImplementationOnce(
        (_input: OptimizeCharacterReferencePromptRequest, signal: AbortSignal) => {
          firstSignal = signal;
          return first.promise;
        },
      )
      .mockImplementationOnce(() => Promise.resolve(optimizerResponse()));
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));
    await user.clear(screen.getByLabelText('Character concept'));
    await user.type(screen.getByLabelText('Character concept'), 'revised midnight botanist');
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    first.resolve(optimizerResponse());
    await waitFor(() =>
      expect(screen.queryByLabelText('Optimized reference-image prompt')).toBeNull(),
    );

    await user.click(screen.getByRole('button', { name: 'Optimize prompt' }));
    expect(await screen.findByLabelText('Optimized reference-image prompt')).toHaveValue(
      optimizerResponse().result.optimizedImagePrompt,
    );
  });

  it('blocks generation after optimizer failure, then retries without silently using raw text', async () => {
    const user = userEvent.setup();
    const onOptimizeReference = vi
      .fn((_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(optimizerResponse()),
      )
      .mockRejectedValueOnce(new Error('Optimizer timed out.'))
      .mockResolvedValueOnce(optimizerResponse());
    const onGenerateReference = vi.fn<GenerateReferenceHandler>();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Optimizer timed out.');
    expect(onGenerateReference).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate reference image' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByLabelText('Optimized reference-image prompt');
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());
    expect(onGenerateReference.mock.calls[0]?.[0].optimization.enabled).toBe(true);
  });

  it('only routes the raw recipe directly after optimization is explicitly disabled', async () => {
    const user = userEvent.setup();
    const onOptimizeReference = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, _signal: AbortSignal) =>
        Promise.resolve(optimizerResponse()),
    );
    const onGenerateReference = vi.fn<GenerateReferenceHandler>();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onOptimizeReference,
      onGenerateReference,
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByLabelText(/Optimize prompt with GPT/));
    expect(screen.getByText(/GPT optimization is off/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));

    await waitFor(() => expect(onGenerateReference).toHaveBeenCalledOnce());
    expect(onOptimizeReference).not.toHaveBeenCalled();
    const generationInput = onGenerateReference.mock.calls[0]?.[0];
    expect(generationInput?.rawPrompt).toContain('midnight botanist');
    expect(generationInput?.optimization.enabled).toBe(false);
  });

  it('aborts an in-flight generation when the workshop unmounts', async () => {
    const user = userEvent.setup();
    let generationSignal: AbortSignal | null = null;
    const pending = deferred<void>();
    const view = renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onGenerateReference: vi.fn(
        (_input: WorkshopReferenceGenerationInput, signal: AbortSignal) => {
          generationSignal = signal;
          return pending.promise;
        },
      ),
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByLabelText(/Optimize prompt with GPT/));
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(generationSignal).not.toBeNull());

    view.unmount();

    const generationWasAborted = () => generationSignal?.aborted ?? false;
    expect(generationWasAborted()).toBe(true);
    pending.resolve();
  });

  it('aborts generation when a changed recipe replaces its source input', async () => {
    const user = userEvent.setup();
    let generationSignal: AbortSignal | null = null;
    const pending = deferred<void>();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      onGenerateReference: vi.fn(
        (_input: WorkshopReferenceGenerationInput, signal: AbortSignal) => {
          generationSignal = signal;
          return pending.promise;
        },
      ),
      onDetachReference: vi.fn(),
    });

    await user.click(screen.getByLabelText(/Optimize prompt with GPT/));
    await user.click(screen.getByRole('button', { name: 'Generate reference image' }));
    await waitFor(() => expect(generationSignal).not.toBeNull());
    await user.clear(screen.getByLabelText('Character concept'));
    await user.type(screen.getByLabelText('Character concept'), 'replacement botanist');

    const generationWasAborted = () => generationSignal?.aborted ?? false;
    await waitFor(() => expect(generationWasAborted()).toBe(true));
    pending.resolve();
  });

  it('disables generation without capability and exposes an accessible loading skeleton', () => {
    const draft = populatedCharacterDraft('field correspondent');
    const view = renderWorkshop({
      initialDraft: draft,
      referenceImagesAvailable: false,
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    });

    expect(screen.getByRole('button', { name: 'Generate reference image' })).toBeDisabled();

    view.rerender(
      <StudioDesignProvider>
        <CharacterPromptWorkshop
          initialDraft={draft}
          referenceImagesAvailable
          referenceGeneration={{ status: 'generating', error: null }}
          onGenerateReference={vi.fn()}
          onDetachReference={vi.fn()}
          onUse={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Creating character reference…');
    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
  });

  it('shows success, stale guidance, and keyboard-accessible detach', async () => {
    const user = userEvent.setup();
    const onDetachReference = vi.fn();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      generatedReferenceImage: {
        ...generatedReference,
        generatedFromPrompt: 'Substitute the character in the video with a different character.',
      },
      onGenerateReference: vi.fn(),
      onDetachReference,
    });

    expect(screen.getByText('Reference image attached')).toBeInTheDocument();
    expect(
      screen.getByText('Prompt changed — regenerate the reference image for a closer match.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();

    const detach = screen.getByRole('button', { name: 'Detach generated reference image' });
    detach.focus();
    await user.keyboard('{Enter}');
    expect(onDetachReference).toHaveBeenCalledOnce();
  });

  it('retains the prior asset and actionable controls after regeneration fails', () => {
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      generatedReferenceImage: generatedReference,
      referenceGeneration: {
        status: 'error',
        error: 'Generation timed out. Retry with a new request.',
      },
      onGenerateReference: vi.fn(),
      onDetachReference: vi.fn(),
    });

    expect(screen.getByText('Reference image attached')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Generation timed out. Retry with a new request.',
    );
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('requires explicit recovery after a persisted selection cannot be restored', async () => {
    const user = userEvent.setup();
    const onDetachReference = vi.fn();
    const onRetryReferenceRestore = vi.fn();
    renderWorkshop({
      initialDraft: populatedCharacterDraft('midnight botanist'),
      referenceImagesAvailable: true,
      referenceGeneration: {
        status: 'error',
        error: 'That local reference is unavailable.',
        errorKind: 'restore',
      },
      onGenerateReference: vi.fn(),
      onDetachReference,
      onRetryReferenceRestore,
    });

    expect(screen.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryReferenceRestore).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Continue without reference' }));
    expect(onDetachReference).toHaveBeenCalledOnce();
  });
});
