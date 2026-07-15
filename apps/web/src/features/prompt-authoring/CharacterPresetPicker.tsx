import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { CharacterTransformDraft } from './model';

export interface CharacterPreset {
  id: string;
  label: string;
  description: string;
  values: Partial<Omit<CharacterTransformDraft, 'intent' | 'presetId' | 'customDetails'>>;
}

interface CharacterPresetPickerProps {
  selectedId: string | null;
  onSelect: (preset: CharacterPreset) => void;
}

const characterPresets: readonly CharacterPreset[] = [
  {
    id: 'midnight-host',
    label: 'Midnight host',
    description: 'Polished, cinematic, quietly confident',
    values: {
      adultAge: 'adult',
      characterBase: 'late-night culture host',
      outfit: 'structured midnight-blue jacket with subtle satin detail',
      expression: 'warm, composed eye contact',
      mood: 'cinematic and quietly confident',
    },
  },
  {
    id: 'botanical-explorer',
    label: 'Botanical explorer',
    description: 'Tactile, sunlit, adventurous',
    values: {
      adultAge: 'adult',
      characterBase: 'botanical field explorer',
      outfit: 'textured utility overshirt in moss and sand tones',
      accessories: 'a small brass field compass',
      mood: 'curious, grounded, and adventurous',
    },
  },
  {
    id: 'retro-astronaut',
    label: 'Retro astronaut',
    description: 'Optimistic analog sci-fi',
    values: {
      adultAge: 'adult',
      characterBase: 'retro-futurist astronaut presenter',
      outfit: 'cream flight suit with restrained orange piping',
      hair: 'camera-ready natural hair',
      mood: 'optimistic analog science fiction',
    },
  },
];

const presetRootStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  display: 'grid',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  border: 0,
});

const presetLabelStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: '0.87rem',
  fontWeight: 720,
});

const presetListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.xs,
  '@media (max-width: 48rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

const presetButtonStyles = (theme: Theme, selected: boolean): CSSObject => ({
  minHeight: '3.75rem',
  padding: theme.space.sm,
  display: 'grid',
  gap: theme.space.xxs,
  textAlign: 'left',
  border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: selected ? theme.colors.accentSoft : theme.colors.canvasRaised,
  cursor: 'pointer',
  '&:hover': { borderColor: theme.colors.accent },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

const presetDescriptionStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textFaint,
  fontSize: '0.76rem',
  fontWeight: 520,
});

export const CharacterPresetPicker = ({ selectedId, onSelect }: CharacterPresetPickerProps) => {
  const theme = useTheme();

  return (
    <fieldset css={presetRootStyles(theme)}>
      <legend css={presetLabelStyles(theme)}>Visible starting points</legend>
      <div css={presetListStyles(theme)}>
        {characterPresets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            aria-pressed={selectedId === preset.id}
            css={presetButtonStyles(theme, selectedId === preset.id)}
            onClick={() => onSelect(preset)}
          >
            <strong>{preset.label}</strong>
            <span css={presetDescriptionStyles(theme)}>{preset.description}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
};
