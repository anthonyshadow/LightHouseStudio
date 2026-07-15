import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { SelectField, TextField } from '../../ui';
import { CharacterPresetPicker, type CharacterPreset } from './CharacterPresetPicker';
import type {
  AdultAge,
  CharacterGender,
  CharacterTransformDraft,
  PromptBuilderDraft,
  PromptIssue,
} from './model';
import {
  promptFieldGridStyles,
  promptFullWidthStyles,
  promptIssueFor,
  promptValueFrom,
} from './promptFieldLayout';

interface CharacterTransformFieldsProps {
  draft: CharacterTransformDraft;
  issues: readonly PromptIssue[];
  onChange: (draft: PromptBuilderDraft) => void;
}

const checkboxLabelStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  minHeight: '3rem',
  padding: theme.space.sm,
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: theme.colors.canvasRaised,
  cursor: 'pointer',
  lineHeight: 1.45,
  '&:focus-within': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

const checkboxStyles = (theme: Theme): CSSObject => ({
  width: '1.2rem',
  height: '1.2rem',
  margin: '0.1rem 0 0',
  flex: '0 0 auto',
  accentColor: theme.colors.accent,
});

export const CharacterTransformFields = ({
  draft,
  issues,
  onChange,
}: CharacterTransformFieldsProps) => {
  const theme = useTheme();
  const changeCharacter = (values: Partial<CharacterTransformDraft>) => {
    onChange({ ...draft, ...values, presetId: null });
  };
  const applyPreset = (preset: CharacterPreset) => {
    onChange({ ...draft, ...preset.values, presetId: preset.id });
  };

  return (
    <div css={promptFieldGridStyles(theme)}>
      <CharacterPresetPicker selectedId={draft.presetId} onSelect={applyPreset} />

      <TextField
        label="Character concept"
        placeholder="e.g. documentary photographer"
        value={draft.characterBase}
        maxLength={220}
        error={promptIssueFor(issues, 'characterBase')}
        onChange={(event) => changeCharacter({ characterBase: promptValueFrom(event) })}
      />
      <SelectField
        label="Gender choice"
        value={draft.gender ?? ''}
        onChange={(event) =>
          changeCharacter({ gender: (promptValueFrom(event) || null) as CharacterGender | null })
        }
      >
        <option value="">Not specified</option>
        <option value="woman">Woman</option>
        <option value="man">Man</option>
        <option value="non-binary">Non-binary</option>
      </SelectField>
      <SelectField
        label="Adult age direction"
        value={draft.adultAge ?? ''}
        onChange={(event) =>
          changeCharacter({ adultAge: (promptValueFrom(event) || null) as AdultAge | null })
        }
      >
        <option value="">Not specified</option>
        <option value="young-adult">Young adult (18+)</option>
        <option value="adult">Adult</option>
        <option value="middle-aged-adult">Middle-aged adult</option>
        <option value="older-adult">Older adult</option>
      </SelectField>
      <TextField
        label="Appearance"
        placeholder="Complexion, face, visual style…"
        value={draft.appearance}
        maxLength={220}
        onChange={(event) => changeCharacter({ appearance: promptValueFrom(event) })}
      />

      <label css={checkboxLabelStyles(theme)}>
        <input
          type="checkbox"
          checked={draft.matchReference}
          css={checkboxStyles(theme)}
          onChange={(event) => onChange({ ...draft, matchReference: event.currentTarget.checked })}
        />
        <span>
          <strong>Match the current portrait</strong>
          <br />
          Use the selected session image for identity and facial guidance. The image itself is never
          saved.
        </span>
      </label>

      <TextField
        label="Hair"
        placeholder="Cut, texture, color…"
        value={draft.hair}
        maxLength={220}
        onChange={(event) => changeCharacter({ hair: promptValueFrom(event) })}
      />
      <TextField
        label="Outfit"
        placeholder="Silhouette, fabric, palette…"
        value={draft.outfit}
        maxLength={220}
        onChange={(event) => changeCharacter({ outfit: promptValueFrom(event) })}
      />
      <TextField
        label="Accessories"
        placeholder="One or two visible details…"
        value={draft.accessories}
        maxLength={220}
        onChange={(event) => changeCharacter({ accessories: promptValueFrom(event) })}
      />
      <TextField
        label="Expression"
        placeholder="Warm half-smile, focused gaze…"
        value={draft.expression}
        maxLength={220}
        onChange={(event) => changeCharacter({ expression: promptValueFrom(event) })}
      />
      <TextField
        label="Mood"
        placeholder="Editorial, playful, grounded…"
        value={draft.mood}
        maxLength={220}
        onChange={(event) => changeCharacter({ mood: promptValueFrom(event) })}
      />
      <div css={promptFullWidthStyles()}>
        <TextField
          label="Keep unchanged"
          hint="Name important visible details that should survive the transformation."
          placeholder="e.g. glasses, face shape, framing"
          value={draft.preserve}
          maxLength={220}
          onChange={(event) => changeCharacter({ preserve: promptValueFrom(event) })}
        />
      </div>
    </div>
  );
};
