import { useTheme } from '@emotion/react';
import type {
  CharacterReferenceBackground,
  CharacterReferenceExpression,
  CharacterReferenceFraming,
  CharacterReferenceOptions,
  CharacterReferenceOrientation,
  CharacterReferenceRenderingMode,
} from '@studio/contracts';
import { SelectField, TextField } from '../../ui';

export const DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS: CharacterReferenceOptions = {
  framing: 'full_body',
  orientation: 'auto',
  renderingMode: 'photorealistic',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

export interface ReferenceOptionsFieldsProps {
  options: CharacterReferenceOptions;
  disabled?: boolean;
  onChange: (options: CharacterReferenceOptions) => void;
}

export const ReferenceOptionsFields = ({
  options,
  disabled = false,
  onChange,
}: ReferenceOptionsFieldsProps) => {
  const theme = useTheme();
  const update = <K extends keyof CharacterReferenceOptions>(
    key: K,
    value: CharacterReferenceOptions[K],
  ) => onChange({ ...options, [key]: value });

  return (
    <details css={{ minWidth: 0 }}>
      <summary
        css={{
          minHeight: '2.75rem',
          display: 'flex',
          alignItems: 'center',
          paddingInline: theme.space.xs,
          cursor: 'pointer',
          fontWeight: 720,
          '&:focus-visible': {
            outline: `2px solid ${theme.colors.focus}`,
            outlineOffset: '2px',
          },
        }}
      >
        Preview settings
      </summary>
      <div
        css={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: theme.space.sm,
          marginBlockStart: theme.space.sm,
        }}
      >
        <SelectField
          label="Target Lucy framing"
          value={options.framing}
          disabled={disabled}
          options={[
            { value: 'head_and_shoulders', label: 'Head and shoulders' },
            { value: 'waist_up', label: 'Waist up' },
            { value: 'full_body', label: 'Full body' },
          ]}
          onValueChange={(value) => update('framing', value as CharacterReferenceFraming)}
        />
        <SelectField
          label="Orientation"
          value={options.orientation}
          disabled={disabled}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'portrait_9_16', label: 'Portrait 9:16' },
            { value: 'landscape_16_9', label: 'Landscape 16:9' },
            { value: 'square', label: 'Square' },
          ]}
          onValueChange={(value) => update('orientation', value as CharacterReferenceOrientation)}
        />
        <SelectField
          label="Rendering"
          value={options.renderingMode}
          disabled={disabled}
          options={[
            { value: 'photorealistic', label: 'Photorealistic' },
            { value: 'faithful_source_style', label: 'Faithful source style' },
          ]}
          onValueChange={(value) =>
            update('renderingMode', value as CharacterReferenceRenderingMode)
          }
        />
        <SelectField
          label="Expression"
          value={options.expression}
          disabled={disabled}
          options={[
            { value: 'neutral', label: 'Neutral' },
            { value: 'subtle_friendly', label: 'Subtle friendly' },
          ]}
          onValueChange={(value) => update('expression', value as CharacterReferenceExpression)}
        />
        <SelectField
          label="Background"
          value={options.background}
          disabled={disabled}
          options={[
            { value: 'neutral_gray', label: 'Neutral gray' },
            { value: 'off_white', label: 'Off-white' },
            { value: 'plain_custom', label: 'Custom plain background' },
          ]}
          onValueChange={(value) => {
            const background = value as CharacterReferenceBackground;
            onChange({
              ...options,
              background,
              ...(background === 'plain_custom'
                ? { customBackground: options.customBackground ?? '' }
                : { customBackground: undefined }),
            });
          }}
        />
        {options.background === 'plain_custom' ? (
          <TextField
            label="Custom plain background"
            value={options.customBackground ?? ''}
            maxLength={200}
            disabled={disabled}
            onChange={(event) => update('customBackground', event.currentTarget.value)}
          />
        ) : null}
      </div>
    </details>
  );
};
