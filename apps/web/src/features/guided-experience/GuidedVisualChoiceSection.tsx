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
} from '../guided-flow/catalog';
import type { GuidedChoiceValue, VisualProfile } from '../guided-flow/types';
import { GuidedChoiceDrawer } from './GuidedChoiceDrawer';
import {
  choiceActionsStyles,
  currentChoiceStyles,
  customFieldStyles,
  optionCardStyles,
  optionGridStyles,
  optionLabelStyles,
  optionVisualStyles,
  sectionStackStyles,
} from './GuidedExperience.styles';

const optionImageStyles = (option: VisualCatalogOption, profile: VisualProfile): CSSObject =>
  option.swatch
    ? {
        background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.28), transparent 18%), ${option.swatch}`,
      }
    : { backgroundImage: `url("${getVisualOptionImageSrc(option, profile)}")` };

export const GuidedOptionButton = ({
  option,
  profile,
  selected,
  onSelect,
}: {
  option: VisualCatalogOption;
  profile: VisualProfile;
  selected: boolean;
  onSelect(): void;
}) => {
  const theme = useTheme();
  const fullLength = option.category === 'bodyShape' || option.category === 'outfit';
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${option.label}${selected ? ', selected' : ''}`}
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

export type GuidedVisualChoiceSectionProps = {
  category: Exclude<VisualCatalogCategory, 'gender'>;
  title: string;
  description: string;
  customLabel: string;
  fixed?: boolean;
  profile: VisualProfile;
  choice: GuidedChoiceValue | null;
  onChange(choice: GuidedChoiceValue | null): void;
};

export const GuidedVisualChoiceSection = ({
  category,
  title,
  description,
  customLabel,
  fixed,
  profile,
  choice,
  onChange,
}: GuidedVisualChoiceSectionProps) => {
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
    <GuidedChoiceDrawer
      id={`guided-${category}`}
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
                    <GuidedOptionButton
                      key={option.id}
                      option={option}
                      profile={profile}
                      selected={choice?.optionId === option.id}
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
            <GuidedOptionButton
              key={option.id}
              option={option}
              profile={profile}
              selected={choice?.optionId === option.id}
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
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? 'Show Suggestions' : 'Show All'}
          </Button>
          <Button
            size="small"
            variant="quiet"
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((value) => !value)}
          >
            Describe My Own
          </Button>
        </div>
      ) : null}
      {customOpen && !fixed ? (
        <div css={customFieldStyles(theme)}>
          <label htmlFor={`guided-${category}-custom`}>{customLabel}</label>
          <input
            id={`guided-${category}-custom`}
            value={customValue}
            maxLength={500}
            placeholder="Enter exactly what you want"
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange(value.trim() ? createCustomGuidedChoice(value) : null);
            }}
          />
        </div>
      ) : null}
    </GuidedChoiceDrawer>
  );
};
