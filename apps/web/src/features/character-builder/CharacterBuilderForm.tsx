import { useTheme } from '@emotion/react';
import type {
  CharacterTransformDraft,
  GuidedChoiceValue,
  GuidedDesignV1,
  VisualProfile,
} from '@studio/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, VisuallyHidden } from '../../ui';
import {
  CHARACTER_STARTERS,
  CUSTOM_OPTION_ID,
  createCustomGuidedChoice,
  getVisualOptionImageSrc,
  getVisualProfile,
  resolveGuidedChoice,
  type VisualCatalogCategory,
} from './catalog';
import { CharacterDirectionPreview } from './CharacterDirectionPreview';
import { CharacterVisualChoiceSection } from './CharacterVisualChoiceSection';
import {
  buildCanonicalCharacterDraft,
  categoryChoiceKey,
  EDITABLE_CHARACTER_CATEGORIES,
  genderFromDesign,
  GENDER_OPTIONS,
} from './characterModel';
import {
  builderLayoutStyles,
  choiceActionsStyles,
  customFieldStyles,
  fieldSectionStyles,
  generationCardStyles,
  optionCardStyles,
  optionGridStyles,
  optionLabelStyles,
  optionVisualStyles,
  stepButtonStyles,
  stepContentStyles,
  stepEyebrowStyles,
  stepNavigationStyles,
  workflowCanvasStyles,
  workflowMainStyles,
} from './formStyles';

export type CharacterBuilderStep = 1 | 2 | 3;

type CharacterBuilderFormProps = {
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
  activeStep: CharacterBuilderStep;
  referenceImageUrl?: string | null;
  referenceImageGenerated?: boolean;
  referenceImageUploadedFallback?: boolean;
  referenceImageStale?: boolean;
  referenceUpload?: ReactNode;
  previewBusy?: boolean;
  previewStatus?: string | null;
  previewActions?: ReactNode;
  previewSettings?: ReactNode;
  previewError?: ReactNode;
  disabled?: boolean;
  onStepChange: (step: CharacterBuilderStep) => void;
  onChange: (draft: CharacterTransformDraft, design: GuidedDesignV1) => void;
};

const STEPS: readonly {
  number: CharacterBuilderStep;
  label: string;
  description: string;
}[] = [
  { number: 1, label: 'Start with a look', description: 'Identity & Reference' },
  { number: 2, label: 'Refine details', description: 'Hair, Outfit & Constraints' },
  { number: 3, label: 'Preview & Save', description: 'Generate & Finalize' },
];

const STEP_HEADINGS: Readonly<
  Record<CharacterBuilderStep, Readonly<{ eyebrow: string; title: string }>>
> = {
  1: { eyebrow: 'Active Step', title: 'Set your foundation' },
  2: { eyebrow: 'Active Step', title: 'Refine your style' },
  3: { eyebrow: 'Final Review', title: 'Ready to Generate?' },
};

const STARTER_MONTAGE_PROFILES = [
  'woman',
  'man',
  'non-binary',
  'unspecified',
] as const satisfies readonly VisualProfile[];

const profileLabels: Readonly<Record<VisualProfile, string>> = {
  woman: 'Woman',
  man: 'Man',
  'non-binary': 'Non-binary',
  unspecified: 'Not specified',
};

export const CharacterBuilderForm = ({
  draft,
  design,
  activeStep,
  referenceImageUrl,
  referenceImageGenerated = Boolean(referenceImageUrl),
  referenceImageUploadedFallback = false,
  referenceImageStale = false,
  referenceUpload,
  previewBusy = false,
  previewStatus = null,
  previewActions,
  previewSettings,
  previewError,
  disabled = false,
  onStepChange,
  onChange,
}: CharacterBuilderFormProps) => {
  const theme = useTheme();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(activeStep);
  const [presentationAnnouncement, setPresentationAnnouncement] = useState('');
  const [presentationCustomOpen, setPresentationCustomOpen] = useState(false);
  const gender = genderFromDesign(design);
  const profile = getVisualProfile(gender);
  const presentationChoice = resolveGuidedChoice('gender', profile, design.choices.gender);
  const presentationLabel =
    presentationChoice.customValue ?? presentationChoice.option?.label ?? null;
  const presentationCustomValue =
    design.choices.gender?.optionId === CUSTOM_OPTION_ID
      ? (design.choices.gender.customValue ?? '')
      : '';
  const hasExplicitPresentation = design.choices.gender != null;
  const selectedStarter = CHARACTER_STARTERS.find((candidate) => candidate.id === design.starterId);

  useEffect(() => {
    if (previousStepRef.current !== activeStep) {
      stepHeadingRef.current?.focus({ preventScroll: false });
      previousStepRef.current = activeStep;
    }
  }, [activeStep]);

  const updateDesign = (next: GuidedDesignV1) => {
    if (disabled) return;
    onChange(buildCanonicalCharacterDraft(next, draft), next);
  };

  const updatePresentation = (choice: GuidedChoiceValue | null, announcement: string) => {
    updateDesign({
      ...design,
      choices: {
        ...design.choices,
        gender: choice,
      },
    });
    setPresentationAnnouncement(announcement);
  };

  const selectGender = (nextProfile: VisualProfile) => {
    const optionId =
      nextProfile === 'unspecified'
        ? 'shared.gender.not-specified'
        : `shared.gender.${nextProfile}`;
    const selected = design.choices.gender?.optionId === optionId;
    setPresentationCustomOpen(false);
    updatePresentation(
      selected ? null : { optionId },
      selected
        ? 'Presentation selection cleared. Visual suggestions returned to the default profile. Existing choices were kept.'
        : `${profileLabels[nextProfile]} presentation selected. Visual suggestions refreshed. Existing choices were kept.`,
    );
  };

  const updateChoice = (
    category: Exclude<VisualCatalogCategory, 'gender'>,
    choice: GuidedChoiceValue | null,
  ) =>
    updateDesign({
      ...design,
      choices: { ...design.choices, [categoryChoiceKey(category)]: choice },
    });

  const summary = (['adultAge', 'role', 'style', 'mood', 'background'] as const)
    .map((key) => {
      const resolved = resolveGuidedChoice(key, profile, design.choices[key]);
      return resolved.customValue ?? resolved.option?.label ?? null;
    })
    .filter((value): value is string => Boolean(value));
  const previewStarter =
    selectedStarter ??
    CHARACTER_STARTERS.find((starter) => starter.id === 'documentary-presenter') ??
    CHARACTER_STARTERS[0];
  const previewSource = referenceImageUrl ?? previewStarter?.imageSrcByProfile[profile];
  const previewSelections = (['hair', 'bodyShape', 'outfit', 'background'] as const).map(
    (category) => {
      const resolved = resolveGuidedChoice(category, profile, design.choices[category]);
      return {
        category,
        label: resolved.customValue ?? resolved.option?.label ?? 'Not chosen',
        imageSrc: resolved.option ? getVisualOptionImageSrc(resolved.option, profile) : null,
        swatch: resolved.option?.swatch,
      };
    },
  );
  const heading = STEP_HEADINGS[activeStep];
  const statusStyles = {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 800,
  } as const;

  return (
    <div css={builderLayoutStyles(theme)}>
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">
          {presentationAnnouncement}
        </span>
      </VisuallyHidden>

      <nav aria-label="Character builder steps" css={stepNavigationStyles(theme)}>
        {STEPS.map((step) => {
          const active = activeStep === step.number;
          return (
            <button
              key={step.number}
              type="button"
              aria-current={active ? 'step' : undefined}
              css={stepButtonStyles(theme, active)}
              onClick={() => onStepChange(step.number)}
            >
              <span data-step-number aria-hidden="true">
                {step.number}
              </span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <main css={workflowMainStyles(theme)}>
        <div css={workflowCanvasStyles(theme)}>
          <section
            aria-labelledby={`character-builder-step-${activeStep}-heading`}
            css={stepContentStyles(theme)}
          >
            <header>
              <span css={stepEyebrowStyles(theme)}>{heading.eyebrow}</span>
              <h2
                id={`character-builder-step-${activeStep}-heading`}
                ref={stepHeadingRef}
                tabIndex={-1}
              >
                {heading.title}
              </h2>
            </header>

            {activeStep === 1 ? (
              <>
                <section
                  aria-labelledby="character-reference-image-heading"
                  css={fieldSectionStyles(theme)}
                >
                  <header>
                    <div>
                      <h3 id="character-reference-image-heading">Optional Reference Image</h3>
                      <p>Upload a portrait to use directly or combine with this direction.</p>
                    </div>
                    <button
                      type="button"
                      css={{
                        minHeight: '2.75rem',
                        border: 0,
                        color: theme.colors.textMuted,
                        background: 'transparent',
                        fontSize: theme.fontSizes.caption,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                      }}
                      onClick={() => onStepChange(2)}
                    >
                      Skip for now
                    </button>
                  </header>
                  {referenceUpload}
                </section>

                <section aria-labelledby="character-gender-heading" css={fieldSectionStyles(theme)}>
                  <header>
                    <div>
                      <h3 id="character-gender-heading">Presentation</h3>
                      <p>
                        Suggestions update immediately without erasing choices you already made.
                      </p>
                    </div>
                    {presentationLabel ? <span css={statusStyles}>{presentationLabel}</span> : null}
                  </header>
                  <div
                    role="group"
                    aria-label="Gender presentation"
                    css={[
                      optionGridStyles(theme),
                      {
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        '@media (max-width: 32rem)': {
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        },
                      },
                    ]}
                  >
                    {GENDER_OPTIONS.map((option) => {
                      const selected =
                        hasExplicitPresentation &&
                        design.choices.gender?.optionId !== CUSTOM_OPTION_ID &&
                        gender === option.value;
                      return (
                        <button
                          key={option.profile}
                          type="button"
                          aria-pressed={selected}
                          disabled={disabled}
                          css={optionCardStyles(theme, selected)}
                          onClick={() => selectGender(option.profile)}
                        >
                          <span
                            role="img"
                            aria-label={`${option.label} representative adult`}
                            css={[
                              optionVisualStyles(theme),
                              {
                                backgroundImage: `url("/guided-character/starters/${option.profile}/documentary-presenter.webp")`,
                                backgroundPosition: 'center',
                                aspectRatio: '1',
                              },
                            ]}
                          />
                          <span css={optionLabelStyles(theme)} title={option.description}>
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div css={choiceActionsStyles(theme)}>
                    <Button
                      size="small"
                      variant="quiet"
                      aria-expanded={presentationCustomOpen}
                      aria-controls="character-gender-custom-field"
                      disabled={disabled}
                      onClick={() => setPresentationCustomOpen((value) => !value)}
                    >
                      <span aria-hidden="true">⊕</span> Describe My Own
                    </Button>
                  </div>
                  {presentationCustomOpen ? (
                    <div id="character-gender-custom-field" css={customFieldStyles(theme)}>
                      <label htmlFor="character-gender-custom">
                        Describe presentation in your own words
                      </label>
                      <input
                        id="character-gender-custom"
                        value={presentationCustomValue}
                        disabled={disabled}
                        maxLength={500}
                        placeholder="e.g. androgynous or a specific cultural presentation"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updatePresentation(
                            value.trim() ? createCustomGuidedChoice(value) : null,
                            value.trim()
                              ? 'Custom presentation saved. Presentation-neutral visual suggestions are shown.'
                              : 'Custom presentation cleared.',
                          );
                        }}
                      />
                    </div>
                  ) : null}
                </section>

                {EDITABLE_CHARACTER_CATEGORIES.filter((item) => item.category === 'adultAge').map(
                  (item) => (
                    <CharacterVisualChoiceSection
                      key={item.category}
                      {...item}
                      title="Visual Age"
                      profile={profile}
                      choice={design.choices[categoryChoiceKey(item.category)]}
                      disabled={disabled}
                      onChange={(choice) => updateChoice(item.category, choice)}
                    />
                  ),
                )}
              </>
            ) : null}

            {activeStep === 2 ? (
              <>
                {EDITABLE_CHARACTER_CATEGORIES.filter((item) => item.category !== 'adultAge').map(
                  (item) => (
                    <CharacterVisualChoiceSection
                      key={item.category}
                      {...item}
                      profile={profile}
                      choice={design.choices[categoryChoiceKey(item.category)]}
                      disabled={disabled}
                      onChange={(choice) => updateChoice(item.category, choice)}
                    />
                  ),
                )}

                <section
                  aria-labelledby="character-preserve-heading"
                  css={fieldSectionStyles(theme)}
                >
                  <header>
                    <div>
                      <h3 id="character-preserve-heading">Custom Constraints</h3>
                      <p>Add details that the visual choices do not cover.</p>
                    </div>
                    {draft.customDetails || draft.preserve || draft.matchReference ? (
                      <span css={statusStyles}>Constraints added</span>
                    ) : null}
                  </header>
                  <div css={customFieldStyles(theme)}>
                    <label htmlFor="character-constraints">Optional Custom Constraints</label>
                    <textarea
                      id="character-constraints"
                      value={draft.customDetails}
                      disabled={disabled}
                      maxLength={500}
                      placeholder="Add any specific details the choices above do not cover"
                      onChange={(event) =>
                        onChange({ ...draft, customDetails: event.currentTarget.value }, design)
                      }
                    />
                    <label htmlFor="character-preserve">Keep Unchanged</label>
                    <input
                      id="character-preserve"
                      value={draft.preserve}
                      disabled={disabled}
                      maxLength={500}
                      placeholder="e.g. natural gestures, direct eye contact, and camera framing"
                      onChange={(event) =>
                        onChange({ ...draft, preserve: event.currentTarget.value }, design)
                      }
                    />
                  </div>
                  <div
                    css={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.space.sm,
                      minHeight: '2.75rem',
                      padding: theme.space.sm,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.radii.small,
                      background: theme.colors.surface,
                    }}
                  >
                    <input
                      id="character-match-reference"
                      type="checkbox"
                      disabled={disabled}
                      aria-describedby="character-match-reference-help"
                      checked={draft.matchReference}
                      onChange={(event) =>
                        onChange({ ...draft, matchReference: event.currentTarget.checked }, design)
                      }
                    />
                    <span>
                      <label htmlFor="character-match-reference">
                        Match identity in current camera portrait
                      </label>
                      <span
                        id="character-match-reference-help"
                        css={{
                          display: 'block',
                          color: theme.colors.textFaint,
                          fontSize: theme.fontSizes.caption,
                        }}
                      >
                        Uses the current portrait when one is available.
                      </span>
                    </span>
                  </div>
                </section>
              </>
            ) : null}

            {activeStep === 3 ? (
              <section
                aria-labelledby="character-generation-heading"
                css={generationCardStyles(theme)}
              >
                <header>
                  <span data-generation-icon aria-hidden="true">
                    ✦
                  </span>
                  <div>
                    <h3 id="character-generation-heading">AI Preview Generation</h3>
                    <p>Review settings, then explicitly generate an optional reference.</p>
                  </div>
                </header>
                {previewError}
                {previewSettings}
                {previewActions}
              </section>
            ) : null}
          </section>

          <CharacterDirectionPreview
            characterLabel={selectedStarter?.label ?? 'Character'}
            profile={profile}
            starterLabel={selectedStarter?.label ?? 'Not selected'}
            {...(previewSource ? { previewSource } : {})}
            montageSources={
              previewStarter
                ? STARTER_MONTAGE_PROFILES.map(
                    (artworkProfile) => previewStarter.imageSrcByProfile[artworkProfile],
                  )
                : []
            }
            showMontage={!referenceImageUrl && !hasExplicitPresentation && Boolean(previewStarter)}
            generated={referenceImageGenerated}
            uploadedFallback={referenceImageUploadedFallback}
            stale={referenceImageStale}
            busy={previewBusy}
            status={previewStatus}
            selections={previewSelections}
            summary={summary}
            showOnNarrow={activeStep === 3}
          />
        </div>
      </main>
    </div>
  );
};
