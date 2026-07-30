import { useTheme } from '@emotion/react';
import type { CharacterTransformDraft } from '@studio/domain';
import { useRef, useState, type ReactNode } from 'react';
import { Button, VisuallyHidden } from '../../ui';
import { CharacterDirectionPreview } from './CharacterDirectionPreview';
import {
  CHARACTER_STARTERS,
  getVisualOptionImageSrc,
  getVisualProfile,
  resolveGuidedChoice,
  type VisualCatalogCategory,
} from './catalog';
import type { GuidedChoiceValue, GuidedDesignV1, VisualProfile } from '@studio/domain';
import {
  builderLayoutStyles,
  customFieldStyles,
  optionCardStyles,
  optionGridStyles,
  optionLabelStyles,
  optionVisualStyles,
  reviewShortcutStyles,
} from './formStyles';
import { CharacterChoiceDrawer } from './CharacterChoiceDrawer';
import { CharacterVisualChoiceSection } from './CharacterVisualChoiceSection';
import {
  buildCanonicalCharacterDraft,
  categoryChoiceKey,
  EDITABLE_CHARACTER_CATEGORIES,
  genderFromDesign,
  GENDER_OPTIONS,
} from './characterModel';

type CharacterBuilderFormProps = {
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
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
  onChange: (draft: CharacterTransformDraft, design: GuidedDesignV1) => void;
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

const previewReadinessLabel = (generated: boolean, stale: boolean): string => {
  if (generated && !stale) return 'Preview ready';
  if (stale) return 'Preview needs an update';
  return 'Generation is optional';
};

export const CharacterBuilderForm = ({
  draft,
  design,
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
  onChange,
}: CharacterBuilderFormProps) => {
  const theme = useTheme();
  const previewRef = useRef<HTMLElement>(null);
  const [presentationAnnouncement, setPresentationAnnouncement] = useState('');
  const gender = genderFromDesign(design);
  const profile = getVisualProfile(gender);
  const hasExplicitPresentation = design.choices.gender != null;
  const selectedStarter = CHARACTER_STARTERS.find((candidate) => candidate.id === design.starterId);

  const updateDesign = (next: GuidedDesignV1) => {
    if (disabled) return;
    onChange(buildCanonicalCharacterDraft(next, draft), next);
  };
  const selectGender = (nextProfile: VisualProfile) => {
    const optionId =
      nextProfile === 'unspecified'
        ? 'shared.gender.not-specified'
        : `shared.gender.${nextProfile}`;
    const selected = design.choices.gender?.optionId === optionId;
    const next = {
      ...design,
      choices: {
        ...design.choices,
        gender: selected ? null : { optionId },
      },
    };
    if (selected) {
      setPresentationAnnouncement(
        'Presentation selection cleared. Visual suggestions returned to the default profile. Existing choices were kept.',
      );
    } else {
      setPresentationAnnouncement(
        `${profileLabels[nextProfile]} presentation selected. Visual suggestions refreshed. Existing choices were kept.`,
      );
    }
    updateDesign(next);
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

  return (
    <div css={builderLayoutStyles(theme)}>
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">
          {presentationAnnouncement}
        </span>
      </VisuallyHidden>
      <div css={reviewShortcutStyles(theme)}>
        <span>
          <strong>Review your character</strong>
          <small>{previewReadinessLabel(referenceImageGenerated, referenceImageStale)}</small>
        </span>
        <Button
          size="small"
          variant="primary"
          onClick={() => {
            previewRef.current?.scrollIntoView?.({ block: 'start' });
            previewRef.current?.focus({ preventScroll: true });
          }}
        >
          Review &amp; Generate
        </Button>
      </div>
      <CharacterChoiceDrawer
        id="character-reference-image"
        title="Reference image"
        description="Optional: upload an image to use directly or combine with this character direction."
        currentLabel={referenceImageUploadedFallback ? 'Uploaded reference ready' : undefined}
        defaultOpen
      >
        {referenceUpload}
      </CharacterChoiceDrawer>
      <CharacterChoiceDrawer
        id="character-gender"
        title="Presentation"
        description="Suggestions update immediately. Choices you already made are never erased."
        currentLabel={
          hasExplicitPresentation
            ? GENDER_OPTIONS.find((option) => option.value === gender)?.label
            : undefined
        }
      >
        <div role="group" aria-label="Gender presentation" css={optionGridStyles(theme)}>
          {GENDER_OPTIONS.map((option) => {
            const selected = hasExplicitPresentation && gender === option.value;
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
      </CharacterChoiceDrawer>

      {EDITABLE_CHARACTER_CATEGORIES.map((item) => (
        <CharacterVisualChoiceSection
          key={item.category}
          {...item}
          profile={profile}
          choice={design.choices[categoryChoiceKey(item.category)]}
          disabled={disabled}
          onChange={(choice) => updateChoice(item.category, choice)}
        />
      ))}

      <CharacterChoiceDrawer
        id="character-preserve"
        title="Preserve and constraints"
        description="Explicit controls for details that should not be forced into a picture tile."
        currentLabel={
          draft.customDetails || draft.preserve || draft.matchReference
            ? 'Constraints added'
            : undefined
        }
      >
        <div
          css={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, minHeight: '2.75rem' }}
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
            <label htmlFor="character-match-reference">Match Current Portrait</label>
            <br />
            <span
              id="character-match-reference-help"
              css={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.caption }}
            >
              Match the identity in the current camera portrait when a portrait is available.
            </span>
          </span>
        </div>
        <div css={customFieldStyles(theme)}>
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
          <label htmlFor="character-constraints">Optional Custom Constraints</label>
          <textarea
            id="character-constraints"
            value={draft.customDetails}
            disabled={disabled}
            maxLength={500}
            placeholder="Add any important constraint the visual choices do not cover"
            onChange={(event) =>
              onChange({ ...draft, customDetails: event.currentTarget.value }, design)
            }
          />
        </div>
      </CharacterChoiceDrawer>

      <CharacterDirectionPreview
        containerRef={previewRef}
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
        actions={previewActions}
        settings={previewSettings}
        error={previewError}
        selections={previewSelections}
        summary={summary}
      />
    </div>
  );
};
