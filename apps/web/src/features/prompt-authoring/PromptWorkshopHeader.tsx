import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, SegmentedControl } from '../../ui';
import type { PromptIntent } from './model';

interface PromptWorkshopHeaderProps {
  intent: PromptIntent;
  disabled: boolean;
  onIntentChange: (intent: PromptIntent) => void;
  onReset: () => void;
}

const intentOptions = [
  { value: 'character-transform', label: 'Transform character', shortLabel: 'Character' },
  { value: 'add-object', label: 'Add one object', shortLabel: 'Add' },
  { value: 'replace-object', label: 'Replace one object', shortLabel: 'Replace' },
  { value: 'change-attribute', label: 'Restyle one object', shortLabel: 'Restyle' },
] as const;

const headerStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.md,
  '@media (max-width: 35rem)': {
    display: 'grid',
  },
});

const eyebrowStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.xs,
  color: theme.colors.accent,
  fontSize: '0.72rem',
  fontWeight: 820,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
});

const titleStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.xs,
  fontFamily: theme.type.display,
  fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
  letterSpacing: '-0.025em',
});

const introStyles = (theme: Theme): CSSObject => ({
  maxWidth: '58ch',
  margin: 0,
  color: theme.colors.textMuted,
  lineHeight: 1.55,
});

const intentHintStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textFaint,
  fontSize: '0.8rem',
  lineHeight: 1.5,
});

export const PromptWorkshopHeader = ({
  intent,
  disabled,
  onIntentChange,
  onReset,
}: PromptWorkshopHeaderProps) => {
  const theme = useTheme();

  return (
    <>
      <header css={headerStyles(theme)}>
        <div>
          <p css={eyebrowStyles(theme)}>Prompt workshop</p>
          <h2 id="character-workshop-title" tabIndex={-1} css={titleStyles(theme)}>
            Direct one clear visual change
          </h2>
          <p css={introStyles(theme)}>
            Shape a concise recipe from visible choices. Nothing here opens the camera or updates a
            live model.
          </p>
        </div>
        <Button variant="quiet" size="small" onClick={onReset} disabled={disabled}>
          Reset this intent
        </Button>
      </header>

      <SegmentedControl
        label="Prompt intent"
        value={intent}
        options={intentOptions}
        onChange={onIntentChange}
      />
      <p css={intentHintStyles(theme)}>
        Your work is kept when you explore another intent, but only the visible intent is used or
        saved.
      </p>
    </>
  );
};
