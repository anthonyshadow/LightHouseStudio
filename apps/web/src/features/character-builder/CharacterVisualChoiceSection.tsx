import { useTheme, type CSSObject } from '@emotion/react';
import { useState } from 'react';
import { Button } from '../../ui';
import {
  CUSTOM_OPTION_ID,
  createCustomGuidedChoice,
  getAllOptionsGroupedByProfile,
  getVisualOptionAlt,
  getVisualOptionImageSrc,
  getVisibleOptions,
  resolveGuidedChoice,
  type VisualCatalogCategory,
  type VisualCatalogOption,
} from './catalog';
import type { GuidedChoiceValue, VisualProfile } from '@studio/domain';
import {
  choiceActionsStyles,
  currentChoiceStyles,
  customFieldStyles,
  directChoiceSectionStyles,
  optionCardStyles,
  optionGridStyles,
  optionLabelStyles,
  optionVisualStyles,
  sectionStackStyles,
} from './formStyles';

const optionImageStyles = (option: VisualCatalogOption, profile: VisualProfile): CSSObject =>
  option.swatch
    ? {
        background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.28), transparent 18%), ${option.swatch}`,
      }
    : { backgroundImage: `url("${getVisualOptionImageSrc(option, profile)}")` };

export const CharacterOptionButton = ({
  option,
  profile,
  selected,
  disabled = false,
  onSelect,
}: {
  option: VisualCatalogOption;
  profile: VisualProfile;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) => {
  const theme = useTheme();
  const fullLength = option.category === 'bodyShape' || option.category === 'outfit';
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${option.label}${selected ? ', selected' : ''}`}
      disabled={disabled}
      css={optionCardStyles(theme, selected)}
      onClick={onSelect}
    >
      <span
        role="img"
        aria-label={getVisualOptionAlt(option, profile)}
        css={[optionVisualStyles(theme, fullLength), optionImageStyles(option, profile)]}
      />
      <span css={optionLabelStyles(theme)}>{option.label}</span>
    </button>
  );
};

export type CharacterVisualChoiceSectionProps = {
  category: Exclude<VisualCatalogCategory, 'gender'>;
  title: string;
  description: string;
  customLabel: string;
  fixed?: boolean;
  profile: VisualProfile;
  choice: GuidedChoiceValue | null;
  disabled?: boolean;
  onChange: (choice: GuidedChoiceValue | null) => void;
};

export const CharacterVisualChoiceSection = ({
  category,
  title,
  description,
  customLabel,
  fixed,
  profile,
  choice,
  disabled = false,
  onChange,
}: CharacterVisualChoiceSectionProps) => {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const visible = getVisibleOptions(category, profile, choice, showAll);
  const grouped = getAllOptionsGroupedByProfile(category);
  const customValue = choice?.optionId === CUSTOM_OPTION_ID ? (choice.customValue ?? '') : '';
  const resolved = resolveGuidedChoice(category, profile, choice);
  const currentLabel = resolved.customValue ?? resolved.option?.label ?? null;

  const select = (option: VisualCatalogOption) => {
    onChange(choice?.optionId === option.id ? null : { optionId: option.id });
    setCustomOpen(false);
  };
  const choicesGridStyles = [
    optionGridStyles(theme),
    category === 'adultAge'
      ? {
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          '@media (max-width: 32rem)': {
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          },
        }
      : {},
  ];
  const renderOption = (option: VisualCatalogOption) => (
    <CharacterOptionButton
      key={option.id}
      option={option}
      profile={profile}
      selected={choice?.optionId === option.id}
      disabled={disabled}
      onSelect={() => select(option)}
    />
  );

  return (
    <section
      aria-labelledby={`character-${category}-heading`}
      css={directChoiceSectionStyles(theme)}
    >
      <header>
        <div>
          <h3 id={`character-${category}-heading`}>{title}</h3>
          <p>{description}</p>
        </div>
        {currentLabel ? <span data-current-choice>{currentLabel}</span> : null}
      </header>
      {visible.currentOutsideSuggestions && !showAll ? (
        <div role="status" css={currentChoiceStyles(theme)}>
          <span>
            <strong>Current choice: {visible.currentOutsideSuggestions.label}</strong>
            Outside current suggestions. Keep it, show every option, or replace it.
          </span>
          <span aria-hidden="true">✓</span>
        </div>
      ) : null}
      {showAll ? (
        <div css={sectionStackStyles(theme)}>
          {(['woman', 'man', 'non-binary', 'unspecified', 'shared'] as const).map((group) =>
            grouped[group].length ? (
              <section key={group} aria-label={`${group} ${title} options`}>
                <p>{group === 'shared' ? 'Shared for every presentation' : group}</p>
                <div css={choicesGridStyles}>{grouped[group].map(renderOption)}</div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <div css={choicesGridStyles}>{visible.suggested.map(renderOption)}</div>
      )}
      {!fixed ? (
        <div css={choiceActionsStyles(theme)}>
          <Button
            size="small"
            variant="quiet"
            aria-expanded={showAll}
            disabled={disabled}
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? 'Show Suggestions' : 'Show All'}
          </Button>
          <Button
            size="small"
            variant="quiet"
            aria-expanded={customOpen}
            aria-controls={`character-${category}-custom-field`}
            disabled={disabled}
            onClick={() => setCustomOpen((value) => !value)}
          >
            Describe My Own
          </Button>
        </div>
      ) : null}
      {customOpen && !fixed ? (
        <div id={`character-${category}-custom-field`} css={customFieldStyles(theme)}>
          <label htmlFor={`character-${category}-custom`}>{customLabel}</label>
          <input
            id={`character-${category}-custom`}
            value={customValue}
            disabled={disabled}
            maxLength={500}
            placeholder="Enter exactly what you want"
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange(value.trim() ? createCustomGuidedChoice(value) : null);
            }}
          />
        </div>
      ) : null}
    </section>
  );
};
