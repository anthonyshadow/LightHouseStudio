import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { focusRingStyles } from '../theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

const groupStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5.5rem), 1fr))',
  gap: theme.space.xxs,
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
});

const segmentStyles = (theme: Theme, selected: boolean): CSSObject => ({
  minHeight: '2.75rem',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: 0,
  borderRadius: `calc(${theme.radii.medium} - 0.2rem)`,
  minWidth: 0,
  overflow: 'hidden',
  color: selected ? theme.colors.onAccent : theme.colors.textMuted,
  background: selected ? theme.colors.accent : 'transparent',
  fontSize: '0.83rem',
  fontWeight: 740,
  lineHeight: 1.2,
  overflowWrap: 'anywhere',
  cursor: 'pointer',
  transition: `color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover': {
    color: selected ? theme.colors.onAccent : theme.colors.text,
    background: selected ? theme.colors.accentStrong : theme.colors.surfaceStrong,
  },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
});

const fullLabelStyles = (): CSSObject => ({
  '@media (max-width: 31rem)': { display: 'none' },
});

const shortLabelStyles = (): CSSObject => ({
  '@media (min-width: 31.001rem)': { display: 'none' },
});

export const SegmentedControl = <T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SegmentedControlProps<T>) => {
  const theme = useTheme();

  return (
    <div role="group" aria-label={label} css={groupStyles(theme)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={option.value === value}
          disabled={disabled}
          css={segmentStyles(theme, option.value === value)}
          onClick={() => onChange(option.value)}
        >
          {option.shortLabel ? (
            <>
              <span aria-hidden="true" css={fullLabelStyles()}>
                {option.label}
              </span>
              <span aria-hidden="true" css={shortLabelStyles()}>
                {option.shortLabel}
              </span>
            </>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
};
