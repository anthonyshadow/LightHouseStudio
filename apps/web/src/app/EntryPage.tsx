import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../ui/primitives/Button';
import { APP_PATHS } from './paths';

const entryStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minHeight: '100%',
  display: 'grid',
  placeItems: 'center',
  paddingBlock: `max(${theme.space.lg}, env(safe-area-inset-top)) max(${theme.space.lg}, env(safe-area-inset-bottom))`,
  paddingInline: `max(${theme.space.lg}, env(safe-area-inset-left)) max(${theme.space.lg}, env(safe-area-inset-right))`,
  overflow: 'hidden',
  '& > div': {
    display: 'grid',
    gap: theme.space.sm,
    width: 'min(28rem, 100%)',
    textAlign: 'center',
  },
  '& p': { margin: 0, color: theme.colors.textMuted },
  '& button': { minHeight: '3rem' },
});

const visuallyHiddenHeadingStyles = (): CSSObject => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

interface EntryPageProps {
  readonly focusEnterOnMount: boolean;
}

export const EntryPage = ({ focusEnterOnMount }: EntryPageProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const enterRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!focusEnterOnMount) return;
    enterRef.current?.focus();
  }, [focusEnterOnMount]);

  return (
    <main css={entryStyles(theme)}>
      <div>
        <h1 css={visuallyHiddenHeadingStyles()}>Enter Lightframe Studio</h1>
        <p>Create from your camera or a compatible video already on this device.</p>
        <Button
          ref={enterRef}
          variant="primary"
          onClick={() => {
            void navigate(APP_PATHS.studio, { state: { creationIntent: 'camera' } });
          }}
        >
          Start with camera
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void navigate(APP_PATHS.studio, { state: { creationIntent: 'upload' } });
          }}
        >
          Upload existing video
        </Button>
      </div>
    </main>
  );
};
