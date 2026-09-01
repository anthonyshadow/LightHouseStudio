import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { hasActiveSession, useAuth } from '../application/auth/AuthProvider';
import { APP_PATHS } from './paths';

/**
 * What a route renders once the session status is known.
 *
 * `unauthenticated` exists because one destination needs a different answer: an address the app
 * does not have. Telling a signed-in operator it is missing is useful; telling anyone else would
 * confirm which URLs exist, so that route substitutes the plain entry redirect while keeping
 * everything above it — the restore, the wait, the `expiring` allowance — identical.
 */
export const ProtectedRoute = ({
  children,
  unauthenticated,
}: {
  readonly children: ReactNode;
  readonly unauthenticated?: ReactNode;
}) => {
  const auth = useAuth();
  const { status, restore } = auth;
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') void restore();
  }, [restore, status]);

  // 'expiring' keeps rendering children on purpose: the shell below holds the teardown hold and
  // knows what in-memory work the Studio has reported, and unmounting it here is what used to
  // discard that work without a prompt. It parks here only while a holder is registered, and
  // finalizing flips the status to 'unauthenticated'.
  if (hasActiveSession(auth)) return children;
  if (status === 'unauthenticated') {
    return (
      unauthenticated ?? (
        <Navigate
          replace
          to={APP_PATHS.entry}
          state={{
            loginRequired: true,
            from: `${location.pathname}${location.search}${location.hash}`,
          }}
        />
      )
    );
  }
  return (
    <main role="status" aria-live="polite" css={{ display: 'grid', placeItems: 'center' }}>
      Restoring your Studio session…
    </main>
  );
};
