import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../application/auth/AuthProvider';
import { Button } from '../ui/primitives/Button';
import { APP_PATHS, isRestorableStudioPath } from './paths';

const LoginDialog = lazy(() =>
  import('../features/auth/LoginDialog').then((module) => ({ default: module.LoginDialog })),
);

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
  '& h1': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(2rem, 8vw, 3.4rem)',
    letterSpacing: '-0.045em',
  },
  '& [data-entry-eyebrow]': {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 850,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  '& button': { minHeight: '3rem' },
});

interface EntryPageProps {
  readonly focusEnterOnMount: boolean;
}

export const EntryPage = ({ focusEnterOnMount }: EntryPageProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const enterRef = useRef<HTMLButtonElement>(null);
  const routeState = location.state as { loginRequired?: unknown; from?: unknown } | null;
  const [loginOpen, setLoginOpen] = useState(routeState?.loginRequired === true);

  useLayoutEffect(() => {
    if (!focusEnterOnMount) return;
    enterRef.current?.focus();
  }, [focusEnterOnMount]);

  return (
    <main css={entryStyles(theme)}>
      <div>
        <span data-entry-eyebrow>Local-first video creation</span>
        <h1>Lightframe</h1>
        <p>
          Create a video quickly, resume focused Project work, or organize Projects in Campaigns.
        </p>
        <Button
          ref={enterRef}
          variant="primary"
          onClick={() => {
            if (auth.status === 'authenticated') void navigate(APP_PATHS.studio);
            else setLoginOpen(true);
          }}
        >
          {auth.status === 'authenticated' ? 'Open Dashboard' : 'Log in'}
        </Button>
      </div>
      {loginOpen ? (
        <Suspense fallback={<p role="status">Loading Login…</p>}>
          <LoginDialog
            open
            message={
              routeState?.loginRequired === true ? 'Your session is required to continue.' : null
            }
            returnFocusRef={enterRef}
            onClose={() => {
              setLoginOpen(false);
              if (routeState?.loginRequired === true)
                void navigate(APP_PATHS.entry, { replace: true });
            }}
            onSuccess={() => {
              setLoginOpen(false);
              const requestedPath = typeof routeState?.from === 'string' ? routeState.from : null;
              void navigate(
                requestedPath && isRestorableStudioPath(requestedPath)
                  ? requestedPath
                  : APP_PATHS.studio,
              );
            }}
          />
        </Suspense>
      ) : null}
    </main>
  );
};
