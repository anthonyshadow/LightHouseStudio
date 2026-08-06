import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../application/auth/AuthProvider';
import { Button } from '../ui/primitives/Button';
import { visuallyHiddenStyles } from '../ui/primitives/VisuallyHidden';
import { APP_PATHS, isStudioPath } from './paths';

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
        <h1 css={visuallyHiddenStyles()}>Enter Lightframe Studio</h1>
        <p>Record or upload a video, then review it and apply optional AI edits.</p>
        <Button
          ref={enterRef}
          variant="primary"
          onClick={() => {
            if (auth.status === 'authenticated') void navigate(APP_PATHS.studio);
            else setLoginOpen(true);
          }}
        >
          {auth.status === 'authenticated' ? 'Enter Studio' : 'Log in'}
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
                requestedPath && isStudioPath(requestedPath) ? requestedPath : APP_PATHS.studio,
              );
            }}
          />
        </Suspense>
      ) : null}
    </main>
  );
};
