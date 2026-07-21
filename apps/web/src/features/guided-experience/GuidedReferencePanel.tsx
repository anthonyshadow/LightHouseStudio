import { useTheme } from '@emotion/react';
import type {
  CharacterPromptOptimizationResult,
  CharacterReferenceBackground,
  CharacterReferenceExpression,
  CharacterReferenceFraming,
  CharacterReferenceOptions,
  CharacterReferenceOrientation,
  CharacterReferenceRenderingMode,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createReferenceImage,
  optimizeCharacterReferencePrompt,
} from '../../adapters/api-client/apiClient';
import { Button, SelectField, StatusNotice, TextAreaField, TextField } from '../../ui';
import {
  customFieldStyles,
  primaryActionRowStyles,
  referenceChoiceGridStyles,
  referenceChoiceStyles,
  sectionStackStyles,
} from './GuidedExperience.styles';

const DEFAULT_OPTIONS: CharacterReferenceOptions = {
  framing: 'full_body',
  orientation: 'auto',
  renderingMode: 'photorealistic',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

const requestKey = (prompt: string, options: CharacterReferenceOptions) =>
  JSON.stringify({ prompt: prompt.trim(), options });

export type GeneratedGuidedReference = {
  asset: ReferenceImageAsset;
  livePrompt: string;
};

export type GuidedReferenceChoiceProps = {
  existingReferenceAvailable: boolean;
  error: string | null;
  disabled?: boolean;
  onCancel(): void;
  onPromptOnly(): void;
  onGenerateSelected(): void;
  onKeepExisting(): void;
};

export const GuidedReferenceChoice = ({
  existingReferenceAvailable,
  error,
  disabled = false,
  onCancel,
  onPromptOnly,
  onGenerateSelected,
  onKeepExisting,
}: GuidedReferenceChoiceProps) => {
  const theme = useTheme();
  return (
    <section aria-labelledby="reference-choice-heading" css={referenceChoiceStyles(theme)}>
      <div>
        <h3 id="reference-choice-heading">Would you like a reference image?</h3>
        <p>
          No choice is preselected. Your complete character prompt is saved either way, and you can
          generate a reference later.
        </p>
      </div>
      {error ? (
        <StatusNotice role="alert" tone="danger">
          {error}
        </StatusNotice>
      ) : null}
      <div css={referenceChoiceGridStyles(theme)}>
        <Button disabled={disabled} variant="primary" onClick={onPromptOnly}>
          Continue with Prompt Only
        </Button>
        <Button disabled={disabled} variant="secondary" onClick={onGenerateSelected}>
          Generate Reference &amp; Continue
        </Button>
        {existingReferenceAvailable ? (
          <Button disabled={disabled} variant="secondary" onClick={onKeepExisting}>
            Keep Existing Reference
          </Button>
        ) : null}
      </div>
      <StatusNotice tone="warning" title="Provider and cost boundary">
        Prompt-only save makes no image-generation request. Prompt optimization contacts the
        configured OpenAI provider and may incur provider cost only when you leave optimization on.
        Image generation starts only after the final confirmation.
      </StatusNotice>
      <div css={primaryActionRowStyles(theme)}>
        <Button disabled={disabled} variant="quiet" onClick={onCancel}>
          Back to character
        </Button>
      </div>
    </section>
  );
};

export type GuidedReferenceSettingsProps = {
  prompt: string;
  available: boolean;
  optimizerAvailable: boolean;
  externalError?: string | null;
  onCancel(): void;
  onContinuePromptOnly(): void;
  onGenerated(result: GeneratedGuidedReference): Promise<void>;
};

export const GuidedReferenceSettings = ({
  prompt,
  available,
  optimizerAvailable,
  externalError = null,
  onCancel,
  onContinuePromptOnly,
  onGenerated,
}: GuidedReferenceSettingsProps) => {
  const theme = useTheme();
  const [options, setOptions] = useState<CharacterReferenceOptions>(DEFAULT_OPTIONS);
  const [optimize, setOptimize] = useState(true);
  const [optimization, setOptimization] = useState<OptimizeCharacterReferencePromptResponse | null>(
    null,
  );
  const [editedPrompt, setEditedPrompt] = useState('');
  const [optimizedKey, setOptimizedKey] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef<{ key: string; requestId: string } | null>(null);
  const currentKey = useMemo(() => requestKey(prompt, options), [options, prompt]);
  const stale = optimization !== null && optimizedKey !== currentKey;
  const busy = optimizing || generating;

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const updateOption = <K extends keyof CharacterReferenceOptions>(
    key: K,
    value: CharacterReferenceOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  const runOptimization = async (): Promise<OptimizeCharacterReferencePromptResponse | null> => {
    if (!optimizerAvailable) {
      setError(
        'Prompt optimization is not configured. Turn it off to generate from your character direction.',
      );
      return null;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOptimizing(true);
    setError(null);
    try {
      const response = await optimizeCharacterReferencePrompt(
        { rawPrompt: prompt, options },
        controller.signal,
      );
      if (controller.signal.aborted) return null;
      setOptimization(response);
      setEditedPrompt(response.result.optimizedImagePrompt);
      setOptimizedKey(currentKey);
      return response;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      setError(
        caught instanceof Error
          ? caught.message
          : 'The character prompt could not be optimized. Your selections are unchanged.',
      );
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setOptimizing(false);
    }
  };

  const generate = async () => {
    if (busy || !available) return;
    if (options.background === 'plain_custom' && !options.customBackground?.trim()) {
      setError('Describe the custom plain background before generating.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      let response = optimization;
      if (optimize && (!response || stale)) response = await runOptimization();
      if (optimize && !response) return;
      const result: CharacterPromptOptimizationResult | null = response
        ? {
            ...response.result,
            optimizedImagePrompt: editedPrompt.trim() || response.result.optimizedImagePrompt,
          }
        : null;
      const operationKey = JSON.stringify({ currentKey, optimize, result });
      const requestId =
        generationRef.current?.key === operationKey
          ? generationRef.current.requestId
          : crypto.randomUUID();
      generationRef.current = { key: operationKey, requestId };
      const asset = await createReferenceImage({
        requestId,
        rawPrompt: prompt,
        options,
        optimization:
          optimize && response && result
            ? {
                enabled: true,
                result,
                model: response.model,
                version: response.version,
                inputHash: response.inputHash,
                manuallyEdited:
                  result.optimizedImagePrompt !== response.result.optimizedImagePrompt,
              }
            : { enabled: false },
      });
      await onGenerated({ asset, livePrompt: asset.lucy25CharacterPrompt });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Reference generation failed. Every character selection is still here.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section aria-labelledby="reference-settings-heading" css={referenceChoiceStyles(theme)}>
      <div>
        <h3 id="reference-settings-heading">Generate a character reference</h3>
        <p>Review the existing advanced controls, then make the final generation request.</p>
      </div>
      <div
        css={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.space.sm,
          alignItems: 'flex-start',
          minHeight: '2.75rem',
          '& > span': { minWidth: 0, flex: '1 1 14rem' },
        }}
      >
        <input
          id="guided-optimize-reference"
          type="checkbox"
          aria-describedby="guided-optimize-reference-help"
          checked={optimize}
          disabled={busy}
          onChange={(event) => setOptimize(event.currentTarget.checked)}
        />
        <span>
          <label htmlFor="guided-optimize-reference">Optimize prompt with GPT</label>
          <br />
          <span
            id="guided-optimize-reference-help"
            css={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.caption }}
          >
            Contacts OpenAI and may incur provider cost. You can edit the result before generation.
          </span>
        </span>
      </div>
      <div
        css={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
          gap: theme.space.sm,
        }}
      >
        <SelectField
          label="Target Lucy framing"
          value={options.framing}
          disabled={busy}
          onChange={(event) =>
            updateOption('framing', event.currentTarget.value as CharacterReferenceFraming)
          }
        >
          <option value="head_and_shoulders">Head and shoulders</option>
          <option value="waist_up">Waist up</option>
          <option value="full_body">Full body</option>
        </SelectField>
        <SelectField
          label="Orientation"
          value={options.orientation}
          disabled={busy}
          onChange={(event) =>
            updateOption('orientation', event.currentTarget.value as CharacterReferenceOrientation)
          }
        >
          <option value="auto">Auto</option>
          <option value="portrait_9_16">Portrait 9:16</option>
          <option value="landscape_16_9">Landscape 16:9</option>
          <option value="square">Square</option>
        </SelectField>
        <SelectField
          label="Rendering"
          value={options.renderingMode}
          disabled={busy}
          onChange={(event) =>
            updateOption(
              'renderingMode',
              event.currentTarget.value as CharacterReferenceRenderingMode,
            )
          }
        >
          <option value="photorealistic">Photorealistic</option>
          <option value="faithful_source_style">Faithful source style</option>
        </SelectField>
        <SelectField
          label="Expression"
          value={options.expression}
          disabled={busy}
          onChange={(event) =>
            updateOption('expression', event.currentTarget.value as CharacterReferenceExpression)
          }
        >
          <option value="neutral">Neutral</option>
          <option value="subtle_friendly">Subtle friendly</option>
        </SelectField>
        <SelectField
          label="Background"
          value={options.background}
          disabled={busy}
          onChange={(event) => {
            const background = event.currentTarget.value as CharacterReferenceBackground;
            setOptions((current) => ({
              ...current,
              background,
              ...(background === 'plain_custom'
                ? { customBackground: current.customBackground ?? '' }
                : { customBackground: undefined }),
            }));
          }}
        >
          <option value="neutral_gray">Neutral gray</option>
          <option value="off_white">Off-white</option>
          <option value="plain_custom">Custom plain background</option>
        </SelectField>
        {options.background === 'plain_custom' ? (
          <TextField
            label="Custom plain background"
            value={options.customBackground ?? ''}
            maxLength={200}
            disabled={busy}
            onChange={(event) => updateOption('customBackground', event.currentTarget.value)}
          />
        ) : null}
      </div>
      {optimize ? (
        <div css={sectionStackStyles(theme)}>
          <Button
            size="small"
            variant="secondary"
            busy={optimizing}
            disabled={busy || !optimizerAvailable}
            onClick={() => void runOptimization()}
          >
            {optimization ? 'Re-optimize Prompt' : 'Optimize Prompt'}
          </Button>
          {optimization ? (
            <>
              {stale ? (
                <StatusNotice role="status" tone="warning">
                  Settings changed. The prompt will be optimized again before generation.
                </StatusNotice>
              ) : null}
              <TextAreaField
                label="Editable optimized reference prompt"
                value={editedPrompt}
                maxLength={32_000}
                disabled={busy}
                onChange={(event) => setEditedPrompt(event.currentTarget.value)}
              />
              <TextAreaField
                label="Lucy 2.5 live character prompt"
                value={optimization.result.lucy25CharacterPrompt}
                readOnly
              />
            </>
          ) : null}
        </div>
      ) : (
        <StatusNotice tone="warning">
          Optimization is off. Generation will use the complete structured character prompt exactly.
        </StatusNotice>
      )}
      {!available ? (
        <StatusNotice role="alert" tone="danger">
          Reference generation is not configured. Go back and continue with prompt only.
        </StatusNotice>
      ) : null}
      {error || externalError ? (
        <StatusNotice role="alert" tone="danger">
          {error ?? externalError}
          <div css={customFieldStyles(theme)}>
            <span>
              Your character selections are preserved. Try again or return to choose prompt only.
            </span>
          </div>
        </StatusNotice>
      ) : null}
      <div css={primaryActionRowStyles(theme)}>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Back to choices
        </Button>
        {error || externalError ? (
          <Button variant="secondary" disabled={busy} onClick={onContinuePromptOnly}>
            Continue with Prompt Only
          </Button>
        ) : null}
        <Button
          variant="primary"
          busy={generating}
          disabled={busy || !available || (optimize && !optimizerAvailable)}
          onClick={() => void generate()}
        >
          Generate Reference &amp; Continue
        </Button>
      </div>
    </section>
  );
};
