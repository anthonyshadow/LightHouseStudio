import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../application/auth/AuthProvider';
import { AppIcon, type AppIconName } from '../ui/primitives/AppIcon';
import { Button } from '../ui/primitives/Button';
import { APP_PATHS, canonicalizeProtectedDestination } from './paths';

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
  /*
   * A drawing of the stage, not a screenshot of one: it borrows the stage's own `stageIdle`
   * gradient and echoes its framing marks, so the first thing a newcomer sees resembles what they
   * are about to open. It is the first thing to go on a short viewport, where the words matter
   * more than the picture — `36rem` being the height the rest of the product treats as short.
   */
  '& [data-entry-stage]': {
    position: 'relative',
    aspectRatio: '16 / 9',
    marginBlock: theme.space.xs,
    display: 'grid',
    placeItems: 'center',
    borderRadius: theme.radii.large,
    background: theme.gradients.stageIdle,
    boxShadow: theme.shadows.soft,
    color: theme.colors.accentStrong,
    '&::before, &::after': {
      position: 'absolute',
      width: '1.5rem',
      height: '1.5rem',
      content: '""',
    },
    '&::before': {
      insetBlockStart: theme.space.sm,
      insetInlineStart: theme.space.sm,
      borderBlockStart: `2px solid ${theme.colors.accent}`,
      borderInlineStart: `2px solid ${theme.colors.accent}`,
    },
    '&::after': {
      insetBlockEnd: theme.space.sm,
      insetInlineEnd: theme.space.sm,
      borderBlockEnd: `2px solid ${theme.colors.accent}`,
      borderInlineEnd: `2px solid ${theme.colors.accent}`,
    },
    '@media (max-height: 36rem)': { display: 'none' },
  },
  '& [data-entry-capabilities]': {
    display: 'grid',
    gap: theme.space.sm,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    textAlign: 'start',
  },
  '& [data-entry-capabilities] li': {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'start',
    gap: theme.space.sm,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
  },
  '& [data-entry-capabilities] svg': {
    width: '1.15rem',
    height: '1.15rem',
    marginBlockStart: '0.1rem',
    color: theme.colors.accent,
  },
  '& button': { minHeight: '3rem' },
});

/** What the product does, said as outcomes and without a noun the visitor has not met yet. */
const ENTRY_CAPABILITIES: ReadonlyArray<{ icon: AppIconName; text: string }> = [
  { icon: 'video', text: 'Record with your camera, or upload a video you already have.' },
  { icon: 'character', text: 'Change who is on screen, what they wear, or how they sound.' },
  { icon: 'editVideo', text: 'Trim, crop, rotate, relight and filter on this device.' },
];

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
  const requestedPath =
    typeof routeState?.from === 'string' ? canonicalizeProtectedDestination(routeState.from) : null;

  useEffect(() => {
    if (auth.status === 'unknown') {
      void auth.restore();
      return;
    }
    if (auth.status !== 'authenticated') return;
    void navigate(requestedPath ?? APP_PATHS.dashboard, { replace: true });
  }, [auth, navigate, requestedPath]);

  useLayoutEffect(() => {
    if (!focusEnterOnMount) return;
    enterRef.current?.focus();
  }, [focusEnterOnMount]);

  return (
    <main css={entryStyles(theme)}>
      <div>
        <span data-entry-eyebrow>Local-first video creation</span>
        <h1>Lightframe</h1>
        <p>Record or upload a video, restyle it, and download the result.</p>
        <div data-entry-stage aria-hidden="true">
          <AppIcon name="video" width="2.5rem" height="2.5rem" />
        </div>
        <ul data-entry-capabilities>
          {ENTRY_CAPABILITIES.map((capability) => (
            <li key={capability.icon}>
              <AppIcon name={capability.icon} />
              <span>{capability.text}</span>
            </li>
          ))}
        </ul>
        <Button
          ref={enterRef}
          variant="primary"
          onClick={() => {
            if (auth.status === 'authenticated') void navigate(APP_PATHS.dashboard);
            else setLoginOpen(true);
          }}
          disabled={auth.status === 'unknown'}
        >
          {auth.status === 'unknown'
            ? 'Restoring…'
            : auth.status === 'authenticated'
              ? 'Open Dashboard'
              : 'Log in'}
        </Button>
      </div>
      {loginOpen ? (
        <Suspense fallback={<p role="status">Loading Login…</p>}>
          <LoginDialog
            open
            message={
              // Read the reason from auth, not route state: ProtectedRoute sends `loginRequired`
              // for a voluntary logout too, so route state cannot tell the two apart.
              auth.sessionEndReason === 'expired'
                ? 'Your session ended. Log in again to pick up where you left off.'
                : routeState?.loginRequired === true
                  ? 'Your session is required to continue.'
                  : null
            }
            returnFocusRef={enterRef}
            onClose={() => {
              setLoginOpen(false);
              if (routeState?.loginRequired === true)
                void navigate(APP_PATHS.entry, { replace: true });
            }}
            onSuccess={() => {
              setLoginOpen(false);
              void navigate(requestedPath ?? APP_PATHS.dashboard, { replace: true });
            }}
          />
        </Suspense>
      ) : null}
    </main>
  );
};
