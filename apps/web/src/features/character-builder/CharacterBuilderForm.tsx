import { type CSSObject, useTheme } from '@emotion/react';
import type { CharacterTransformDraft } from '@studio/domain';
import { useState, type ReactNode } from 'react';
import { VisuallyHidden } from '../../ui';
import { CharacterDirectionPreview } from './CharacterDirectionPreview';
import {
  CHARACTER_STARTERS,
  getVisualOptionImageSrc,
  getVisualProfile,
  resolveGuidedChoice,
  type CharacterStarter,
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
  starterCardStyles,
  starterCopyStyles,
  starterGridStyles,
  starterImageStyles,
} from './formStyles';
import { CharacterChoiceDrawer } from './CharacterChoiceDrawer';
import { CharacterVisualChoiceSection } from './CharacterVisualChoiceSection';
import {
  buildCanonicalCharacterDraft,
  categoryChoiceKey,
  EDITABLE_CHARACTER_CATEGORIES,
  genderFromDesign,
  GENDER_OPTIONS,
  starterDefaults,
} from './characterModel';

export { buildCanonicalCharacterDraft, createEmptyGuidedDesign } from './characterModel';

export type CharacterBuilderFormProps = {
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
  referenceImageUrl?: string | null;
  referenceImageStale?: boolean;
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

const starterArtworkStyles = (montage: boolean): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: montage ? 'repeat(2, minmax(0, 1fr))' : '1fr',
  gridTemplateRows: montage ? 'repeat(2, minmax(0, 1fr))' : '1fr',
  gap: montage ? '2px' : 0,
  '& > img': {
    display: 'block',
    width: '100%',
    height: '100%',
    minWidth: 0,
    objectFit: 'cover',
    objectPosition: 'center',
  },
});

const StarterArtwork = ({
  starter,
  profile,
  hasExplicitPresentation,
}: {
  starter: CharacterStarter;
  profile: VisualProfile;
  hasExplicitPresentation: boolean;
}) => {
  const artworkProfiles = hasExplicitPresentation ? [profile] : STARTER_MONTAGE_PROFILES;
  const presentationDescription = hasExplicitPresentation
    ? `${profileLabels[profile]} presentation representative adult`
    : 'diverse adult presentation montage';

  return (
    <span
      role="img"
      aria-label={`${starter.label}, ${presentationDescription}. ${starter.description}`}
      css={[starterImageStyles(), starterArtworkStyles(!hasExplicitPresentation)]}
    >
      {artworkProfiles.map((artworkProfile) => (
        <img
          key={artworkProfile}
          src={starter.imageSrcByProfile[artworkProfile]}
          alt=""
          aria-hidden="true"
        />
      ))}
    </span>
  );
};

export const CharacterBuilderForm = ({
  draft,
  design,
  referenceImageUrl,
  referenceImageStale = false,
  previewBusy = false,
  previewStatus = null,
  previewActions,
  previewSettings,
  previewError,
  disabled = false,
  onChange,
}: CharacterBuilderFormProps) => {
  const theme = useTheme();
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
    const next = {
      ...design,
      choices: {
        ...design.choices,
        gender: { optionId },
      },
    };
    if (design.choices.gender?.optionId !== optionId) {
      setPresentationAnnouncement(
        `${profileLabels[nextProfile]} presentation selected. Visual suggestions refreshed. Existing choices were kept.`,
      );
    }
    updateDesign(next);
  };
  const selectStarter = (starter: CharacterStarter) => {
    const next = starterDefaults(starter, gender);
    updateDesign(
      hasExplicitPresentation ? next : { ...next, choices: { ...next.choices, gender: null } },
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

  return (
    <div css={builderLayoutStyles(theme)}>
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">
          {presentationAnnouncement}
        </span>
      </VisuallyHidden>
      <CharacterChoiceDrawer
        id="character-starters"
        title="Try a demo character"
        description="Optional: choose any of the nine demos for a complete, editable direction."
        currentLabel={selectedStarter?.label}
        defaultOpen
      >
        <div css={starterGridStyles(theme)}>
          {CHARACTER_STARTERS.map((starter) => {
            const selected = starter.id === design.starterId;
            return (
              <button
                key={starter.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                css={starterCardStyles(theme, selected)}
                onClick={() => selectStarter(starter)}
              >
                <StarterArtwork
                  starter={starter}
                  profile={profile}
                  hasExplicitPresentation={hasExplicitPresentation}
                />
                <span css={starterCopyStyles(theme)}>
                  <strong>{starter.label}</strong>
                  <span>{starter.description}</span>
                </span>
              </button>
            );
          })}
        </div>
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
        generated={Boolean(referenceImageUrl)}
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
