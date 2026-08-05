import { useTheme } from '@emotion/react';
import type { VideoOutputResolution } from '@studio/contracts';
import { Button, SelectField, Surface } from '../../ui';
import {
  advancedStyles,
  configCardStyles,
  configHeaderStyles,
  inputModeStyles,
  rowStyles,
} from './ExistingVideoPanel.styles';
import {
  ExistingVideoRecipeChooser,
  type ExistingVideoSavedRecipe,
} from './ExistingVideoRecipeChooser';
import { ReferenceImageInputField } from '../reference-images/ReferenceImageInputField';
import type { ExistingVideoStep } from './useExistingVideoWorkflow';

export type RecentOutfit = Readonly<{ id: string; file: File }>;

export interface ExistingVideoVisualEditorProps {
  readonly step: ExistingVideoStep;
  readonly savedRecipes: readonly ExistingVideoSavedRecipe[];
  readonly recentOutfits: readonly RecentOutfit[];
  readonly structureLocked: boolean;
  readonly recipeLocked: boolean;
  readonly recipeLoading: boolean;
  readonly referenceRequired?: boolean;
  readonly promptEnhancementSupported?: boolean;
  readonly outputResolutions?: readonly VideoOutputResolution[];
  readonly onApplySavedRecipe: (step: ExistingVideoStep, recipeId: string) => void;
  readonly onChooseReference: (step: ExistingVideoStep, file: File) => void;
  readonly onCreateCharacter?: (stepId: string) => void;
  readonly onCreateWardrobeVariant?: (stepId: string, characterId: string) => void;
  readonly onUpdate: (
    id: string,
    patch: Partial<Omit<ExistingVideoStep, 'id' | 'modelId'>>,
  ) => void;
  readonly onSetVtonInputKind: (
    id: string,
    inputKind: Extract<
      ExistingVideoStep['inputKind'],
      'saved-outfit' | 'reference-image' | 'prompt'
    >,
  ) => void;
  readonly onClear: (id: string) => void;
  readonly onClearReferenceError: () => void;
}

const heading = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-latest' ? 'Configure Character Swap' : 'Configure Virtual Try On';

const shortLabel = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try On';

export const ExistingVideoVisualEditor = ({
  step,
  savedRecipes,
  recentOutfits,
  structureLocked,
  recipeLocked,
  recipeLoading,
  referenceRequired = false,
  promptEnhancementSupported = true,
  outputResolutions = ['720p'],
  onApplySavedRecipe,
  onChooseReference,
  onCreateCharacter,
  onCreateWardrobeVariant,
  onUpdate,
  onSetVtonInputKind,
  onClear,
  onClearReferenceError,
}: ExistingVideoVisualEditorProps) => {
  const theme = useTheme();
  const recentSelection = recentOutfits.find((item) => item.file === step.referenceImage);

  return (
    <article css={configCardStyles(theme)} aria-labelledby={`existing-video-step-${step.id}`}>
      <header css={configHeaderStyles(theme)}>
        <h3 id={`existing-video-step-${step.id}`}>{heading(step)}</h3>
        <span>1 visual-processing submission</span>
      </header>

      {step.modelId === 'lucy-vton-latest' ? (
        <>
          <Surface tone="soft" padding="compact">
            <p>
              Use media you have rights and consent to submit. One visible garment on a plain
              background works best. Results do not predict fit, sizing, or purchase accuracy.
            </p>
          </Surface>
          <div css={inputModeStyles(theme)} role="group" aria-label="Outfit input type">
            {(
              [
                ['saved-outfit', 'Saved outfit'],
                ['reference-image', 'Reference image'],
                ['prompt', 'Prompt'],
              ] as const
            ).map(([kind, label]) => (
              <Button
                key={kind}
                variant={step.inputKind === kind ? 'primary' : 'secondary'}
                aria-pressed={step.inputKind === kind}
                disabled={recipeLocked}
                onClick={() => onSetVtonInputKind(step.id, kind)}
              >
                {label}
              </Button>
            ))}
          </div>
          {step.inputKind === 'saved-outfit' ? (
            <SelectField
              label="Saved or recently uploaded outfit"
              value={
                step.savedRecipeId
                  ? `saved:${step.savedRecipeId}`
                  : recentSelection
                    ? `recent:${recentSelection.id}`
                    : ''
              }
              disabled={recipeLocked || recipeLoading}
              options={[
                { value: '', label: 'Choose an outfit' },
                ...savedRecipes
                  .filter((recipe) => recipe.modelId === 'lucy-vton-latest')
                  .map((recipe) => ({ value: `saved:${recipe.id}`, label: recipe.label })),
                ...recentOutfits.map((outfit) => ({
                  value: `recent:${outfit.id}`,
                  label: `Recent · ${outfit.file.name}`,
                })),
              ]}
              onValueChange={(value) => {
                if (value.startsWith('saved:')) {
                  onApplySavedRecipe(step, value.slice(6));
                  return;
                }
                const recent = recentOutfits.find((item) => `recent:${item.id}` === value);
                if (recent) {
                  onUpdate(step.id, {
                    savedRecipeId: null,
                    prompt: '',
                    enhancePrompt: false,
                    referenceImage: recent.file,
                  });
                }
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <p>Confirm you have rights and consent for submitted media before continuing.</p>
          {referenceRequired ? (
            <Surface tone="soft" padding="compact">
              <p>
                This Character Swap configuration requires one identity reference image. Prompt-only
                recipes need a reference before processing can start.
              </p>
            </Surface>
          ) : null}
          {outputResolutions.length > 1 ? (
            <SelectField
              label="Output resolution"
              value={step.outputResolution ?? outputResolutions[0] ?? '720p'}
              disabled={recipeLocked}
              options={outputResolutions.map((resolution) => ({
                value: resolution,
                label: resolution,
              }))}
              hint="Higher resolution may take longer and cost more provider usage."
              onValueChange={(value) =>
                onUpdate(step.id, { outputResolution: value as VideoOutputResolution })
              }
            />
          ) : null}
          <ExistingVideoRecipeChooser
            modelId={step.modelId}
            recipes={savedRecipes.filter((recipe) => recipe.modelId === step.modelId)}
            selectedRecipeId={step.savedRecipeId}
            disabled={recipeLocked}
            loading={recipeLoading}
            onChoose={(recipeId) => onApplySavedRecipe(step, recipeId)}
            {...(onCreateCharacter ? { onCreateCharacter: () => onCreateCharacter(step.id) } : {})}
            {...(onCreateWardrobeVariant
              ? {
                  onCreateWardrobeVariant: (characterId: string) =>
                    onCreateWardrobeVariant(step.id, characterId),
                }
              : {})}
          />
        </>
      )}

      {step.modelId === 'lucy-latest' || step.inputKind === 'prompt' ? (
        <>
          <label>
            Prompt
            <textarea
              value={step.prompt}
              maxLength={1_200}
              disabled={recipeLocked}
              placeholder={
                step.modelId === 'lucy-latest'
                  ? 'Describe the character or visual edit'
                  : 'Describe the garment and desired appearance'
              }
              onChange={(event) =>
                onUpdate(step.id, {
                  savedRecipeId:
                    step.modelId === 'lucy-latest' && step.referenceImage
                      ? step.savedRecipeId
                      : null,
                  prompt: event.currentTarget.value,
                })
              }
            />
            <span>{step.prompt.length}/1,200</span>
            {step.modelId === 'lucy-latest' && step.referenceImage ? (
              <small>
                Leave blank to use the selected identity as the primary direction. Text you add is
                sent as the visual transformation instruction.
              </small>
            ) : null}
          </label>
          {!promptEnhancementSupported ? (
            <p>Prompt enhancement is unavailable for Character Swap in this configuration.</p>
          ) : null}
          <details
            css={advancedStyles(theme)}
            open={(promptEnhancementSupported && step.enhancePrompt) || undefined}
          >
            <summary>Advanced</summary>
            <div>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={promptEnhancementSupported && step.enhancePrompt}
                    disabled={recipeLocked || !promptEnhancementSupported}
                    onChange={(event) =>
                      onUpdate(step.id, { enhancePrompt: event.currentTarget.checked })
                    }
                  />{' '}
                  Enhance prompt
                </span>
              </label>
            </div>
          </details>
        </>
      ) : null}

      {step.modelId === 'lucy-latest' || step.inputKind === 'reference-image' ? (
        <ReferenceImageInputField
          kind={step.modelId === 'lucy-latest' ? 'character' : 'garment'}
          file={step.referenceImage}
          disabled={recipeLocked}
          allowUrlImport
          onSelectFile={(file) => {
            onUpdate(step.id, { savedRecipeId: null });
            onChooseReference(step, file);
          }}
          onRemove={() => {
            onClearReferenceError();
            onUpdate(step.id, { savedRecipeId: null, referenceImage: null });
          }}
        />
      ) : null}

      <div css={rowStyles(theme)}>
        <Button variant="quiet" disabled={structureLocked} onClick={() => onClear(step.id)}>
          Clear {shortLabel(step)} setup
        </Button>
      </div>
    </article>
  );
};
