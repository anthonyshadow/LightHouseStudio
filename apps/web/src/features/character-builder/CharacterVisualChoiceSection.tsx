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
import { CharacterChoiceDrawer } from './CharacterChoiceDrawer';
import {
  choiceActionsStyles,
  currentChoiceStyles,
  customFieldStyles,
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
  onSelect(): void;
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
  onChange(choice: GuidedChoiceValue | null): void;
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
  const [customOpen, setCustomOpen] = useState(choice?.optionId === CUSTOM_OPTION_ID);
  const visible = getVisibleOptions(category, profile, choice, showAll);
  const grouped = getAllOptionsGroupedByProfile(category);
  const customValue = choice?.optionId === CUSTOM_OPTION_ID ? (choice.customValue ?? '') : '';
  const resolved = resolveGuidedChoice(category, profile, choice);
  const currentLabel = resolved.customValue ?? resolved.option?.label ?? null;

  const select = (option: VisualCatalogOption) => {
    onChange({ optionId: option.id });
    setCustomOpen(false);
  };

  return (
    <CharacterChoiceDrawer
      id={`character-${category}`}
      title={title}
      description={description}
      currentLabel={currentLabel}
      defaultOpen={category === 'adultAge'}
    >
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
                <div css={optionGridStyles(theme)}>
                  {grouped[group].map((option) => (
                    <CharacterOptionButton
                      key={option.id}
                      option={option}
                      profile={profile}
                      selected={choice?.optionId === option.id}
                      disabled={disabled}
                      onSelect={() => select(option)}
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <div css={optionGridStyles(theme)}>
          {visible.suggested.map((option) => (
            <CharacterOptionButton
              key={option.id}
              option={option}
              profile={profile}
              selected={choice?.optionId === option.id}
              disabled={disabled}
              onSelect={() => select(option)}
            />
          ))}
        </div>
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
            disabled={disabled}
            onClick={() => setCustomOpen((value) => !value)}
          >
            Describe My Own
          </Button>
        </div>
      ) : null}
      {customOpen && !fixed ? (
        <div css={customFieldStyles(theme)}>
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
    </CharacterChoiceDrawer>
  );
};
