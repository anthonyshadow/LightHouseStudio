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
  onChange(options: CharacterReferenceOptions): void;
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
          onChange={(event) =>
            update('framing', event.currentTarget.value as CharacterReferenceFraming)
          }
        >
          <option value="head_and_shoulders">Head and shoulders</option>
          <option value="waist_up">Waist up</option>
          <option value="full_body">Full body</option>
        </SelectField>
        <SelectField
          label="Orientation"
          value={options.orientation}
          disabled={disabled}
          onChange={(event) =>
            update('orientation', event.currentTarget.value as CharacterReferenceOrientation)
          }
        >
          <option value="auto">Auto</option>
          <option value="portrait_9_16">Portrait 9:16</option>
          <option value="landscape_16_9">Landscape 16:9</option>
          <option value="square">Square</option>
        </SelectField>
        <SelectField
          label="Rendering"
          value={options.renderingMode}
          disabled={disabled}
          onChange={(event) =>
            update('renderingMode', event.currentTarget.value as CharacterReferenceRenderingMode)
          }
        >
          <option value="photorealistic">Photorealistic</option>
          <option value="faithful_source_style">Faithful source style</option>
        </SelectField>
        <SelectField
          label="Expression"
          value={options.expression}
          disabled={disabled}
          onChange={(event) =>
            update('expression', event.currentTarget.value as CharacterReferenceExpression)
          }
        >
          <option value="neutral">Neutral</option>
          <option value="subtle_friendly">Subtle friendly</option>
        </SelectField>
        <SelectField
          label="Background"
          value={options.background}
          disabled={disabled}
          onChange={(event) => {
            const background = event.currentTarget.value as CharacterReferenceBackground;
            onChange({
              ...options,
              background,
              ...(background === 'plain_custom'
                ? { customBackground: options.customBackground ?? '' }
                : { customBackground: undefined }),
            });
          }}
        >
          <option value="neutral_gray">Neutral gray</option>
          <option value="off_white">Off-white</option>
          <option value="plain_custom">Custom plain background</option>
        </SelectField>
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
