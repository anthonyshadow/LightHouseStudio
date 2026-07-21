import { type CSSObject, useTheme } from '@emotion/react';
import type { CharacterTransformDraft } from '@studio/domain';
import { useState } from 'react';
import { VisuallyHidden } from '../../ui';
import {
  CHARACTER_STARTERS,
  getVisualOptionImageSrc,
  getVisualProfile,
  resolveGuidedChoice,
  type CharacterStarter,
  type VisualCatalogCategory,
} from '../guided-flow/catalog';
import type { GuidedChoiceValue, GuidedDesignV1, VisualProfile } from '../guided-flow/types';
import {
  builderLayoutStyles,
  customFieldStyles,
  heroPreviewStyles,
  optionCardStyles,
  optionGridStyles,
  optionLabelStyles,
  optionVisualStyles,
  previewLabelStyles,
  previewPanelStyles,
  starterCardStyles,
  starterCopyStyles,
  starterGridStyles,
  starterImageStyles,
  summaryChipStyles,
  thumbnailStripStyles,
} from './GuidedExperience.styles';
import { GuidedChoiceDrawer } from './GuidedChoiceDrawer';
import { GuidedVisualChoiceSection } from './GuidedVisualChoiceSection';
import {
  buildCanonicalCharacterDraft,
  categoryChoiceKey,
  EDITABLE_CHARACTER_CATEGORIES,
  genderFromDesign,
  GENDER_OPTIONS,
  starterDefaults,
} from './guidedCharacterModel';

export { buildCanonicalCharacterDraft, createEmptyGuidedDesign } from './guidedCharacterModel';

export type GuidedCharacterBuilderProps = {
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
  referenceImageUrl?: string | null;
  referenceImageStale?: boolean;
  onChange(draft: CharacterTransformDraft, design: GuidedDesignV1): void;
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

const previewMontageStyles: CSSObject = {
  width: '100%',
  height: '100%',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
  gap: '2px',
  '& > img': {
    display: 'block',
    width: '100%',
    height: '100%',
    minWidth: 0,
    objectFit: 'contain',
  },
};

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

export const GuidedCharacterBuilder = ({
  draft,
  design,
  referenceImageUrl,
  referenceImageStale = false,
  onChange,
}: GuidedCharacterBuilderProps) => {
  const theme = useTheme();
  const [presentationAnnouncement, setPresentationAnnouncement] = useState('');
  const gender = genderFromDesign(design);
  const profile = getVisualProfile(gender);
  const hasExplicitPresentation = design.choices.gender != null;
  const selectedStarter = CHARACTER_STARTERS.find((candidate) => candidate.id === design.starterId);

  const updateDesign = (next: GuidedDesignV1) =>
    onChange(buildCanonicalCharacterDraft(next, draft), next);
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
      <GuidedChoiceDrawer
        id="guided-starters"
        title="Start with a character"
        description="Choose any of the nine starters. One card gives you a complete, editable direction."
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
      </GuidedChoiceDrawer>

      <GuidedChoiceDrawer
        id="guided-gender"
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
      </GuidedChoiceDrawer>

      {EDITABLE_CHARACTER_CATEGORIES.map((item) => (
        <GuidedVisualChoiceSection
          key={item.category}
          {...item}
          profile={profile}
          choice={design.choices[categoryChoiceKey(item.category)]}
          onChange={(choice) => updateChoice(item.category, choice)}
        />
      ))}

      <GuidedChoiceDrawer
        id="guided-preserve"
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
            id="guided-match-reference"
            type="checkbox"
            aria-describedby="guided-match-reference-help"
            checked={draft.matchReference}
            onChange={(event) =>
              onChange({ ...draft, matchReference: event.currentTarget.checked }, design)
            }
          />
          <span>
            <label htmlFor="guided-match-reference">Match Current Portrait</label>
            <br />
            <span
              id="guided-match-reference-help"
              css={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.caption }}
            >
              Match the identity in the current camera portrait when a portrait is available.
            </span>
          </span>
        </div>
        <div css={customFieldStyles(theme)}>
          <label htmlFor="guided-preserve">Keep Unchanged</label>
          <input
            id="guided-preserve"
            value={draft.preserve}
            maxLength={500}
            placeholder="e.g. natural gestures, direct eye contact, and camera framing"
            onChange={(event) =>
              onChange({ ...draft, preserve: event.currentTarget.value }, design)
            }
          />
          <label htmlFor="guided-constraints">Optional Custom Constraints</label>
          <textarea
            id="guided-constraints"
            value={draft.customDetails}
            maxLength={500}
            placeholder="Add any important constraint the visual choices do not cover"
            onChange={(event) =>
              onChange({ ...draft, customDetails: event.currentTarget.value }, design)
            }
          />
        </div>
      </GuidedChoiceDrawer>

      <aside
        aria-labelledby="direction-preview-heading"
        css={[
          previewPanelStyles(theme),
          {
            gridColumn: '2',
            gridRow: '1 / span 30',
            '@media (max-width: 64rem)': { gridColumn: '1', gridRow: 'auto' },
          },
        ]}
      >
        <h3 id="direction-preview-heading">Character direction preview</h3>
        <div css={heroPreviewStyles(theme)}>
          {!referenceImageUrl && !hasExplicitPresentation && previewStarter ? (
            <div
              role="img"
              aria-label={`${selectedStarter?.label ?? 'Character'} direction preview, diverse adult presentation montage`}
              css={previewMontageStyles}
            >
              {STARTER_MONTAGE_PROFILES.map((artworkProfile) => (
                <img
                  key={artworkProfile}
                  src={previewStarter.imageSrcByProfile[artworkProfile]}
                  alt=""
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : previewSource ? (
            <img
              src={previewSource}
              alt={`${selectedStarter?.label ?? 'Character'} direction preview`}
            />
          ) : null}
          <span css={previewLabelStyles(theme)}>
            {referenceImageUrl
              ? referenceImageStale
                ? 'Previous reference — changes need a new image'
                : 'Generated reference image'
              : 'Direction artwork — not an exact composite'}
          </span>
        </div>
        <div aria-label="Selected direction details" css={thumbnailStripStyles(theme)}>
          {previewSelections.map((item) => (
            <div
              key={item.category}
              style={
                item.swatch
                  ? { background: item.swatch }
                  : item.imageSrc
                    ? {
                        backgroundImage: `linear-gradient(180deg, transparent, rgba(0,0,0,.78)), url("${item.imageSrc}")`,
                      }
                    : undefined
              }
            >
              {item.label}
            </div>
          ))}
        </div>
        {summary.length ? (
          <ul aria-label="Character summary" css={summaryChipStyles(theme)}>
            {summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Choose a starter to build a complete direction.</p>
        )}
        <details>
          <summary>See how this character was built</summary>
          <dl>
            <dt>Profile</dt>
            <dd>{profile}</dd>
            <dt>Starter</dt>
            <dd>{selectedStarter?.label ?? 'Not selected'}</dd>
            <dt>Canonical fields</dt>
            <dd>
              Role, appearance, skin tone, body shape, hair, color, outfit, expression, mood, and
              constraints
            </dd>
          </dl>
        </details>
      </aside>
    </div>
  );
};
