import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../application/auth/AuthProvider';
import { APP_PATHS } from './paths';

export const ProtectedRoute = ({ children }: { readonly children: ReactNode }) => {
  const { status, session, restore } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') void restore();
  }, [restore, status]);

  if (status === 'authenticated' && session) return children;
  if (status === 'unauthenticated') {
    return (
      <Navigate
        replace
        to={APP_PATHS.entry}
        state={{
          loginRequired: true,
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }
  return (
    <main role="status" aria-live="polite" css={{ display: 'grid', placeItems: 'center' }}>
      Restoring your Studio session…
    </main>
  );
};
