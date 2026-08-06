import type { AuthenticatedSessionResponse } from '@studio/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

export type AuthStatus =
  'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'logging-out';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: AuthenticatedSessionResponse | null;
  readonly restore: () => Promise<boolean>;
  readonly login: (login: string, password: string) => Promise<boolean>;
  readonly logout: () => Promise<void>;
  readonly expire: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({
  children,
  initialSession = null,
}: PropsWithChildren<{ readonly initialSession?: AuthenticatedSessionResponse | null }>) => {
  const [status, setStatus] = useState<AuthStatus>(
    initialSession === null ? 'unknown' : 'authenticated',
  );
  const [session, setSession] = useState<AuthenticatedSessionResponse | null>(initialSession);
  const restoreRef = useRef<Promise<boolean> | null>(null);
  const loginControllerRef = useRef<AbortController | null>(null);
  const logoutRef = useRef<Promise<void> | null>(null);

  const expire = useCallback(() => {
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const restore = useCallback((): Promise<boolean> => {
    if (session) return Promise.resolve(true);
    if (restoreRef.current) return restoreRef.current;
    const controller = new AbortController();
    const request = import('../../adapters/api-client/authApi')
      .then(({ fetchCurrentSession }) => fetchCurrentSession(controller.signal))
      .then((restored) => {
        setSession(restored);
        setStatus('authenticated');
        return true;
      })
      .catch(() => {
        setSession(null);
        setStatus('unauthenticated');
        return false;
      })
      .finally(() => {
        if (restoreRef.current === request) restoreRef.current = null;
      });
    restoreRef.current = request;
    return request;
  }, [session]);

  const login = useCallback(async (login: string, password: string): Promise<boolean> => {
    loginControllerRef.current?.abort();
    const controller = new AbortController();
    loginControllerRef.current = controller;
    setStatus('authenticating');
    try {
      const authenticated = await import('../../adapters/api-client/authApi').then(
        ({ login: loginRequest }) => loginRequest({ login, password }, controller.signal),
      );
      if (controller.signal.aborted) return false;
      setSession(authenticated);
      setStatus('authenticated');
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        setSession(null);
        setStatus('unauthenticated');
      }
      throw error;
    } finally {
      if (loginControllerRef.current === controller) loginControllerRef.current = null;
    }
  }, []);

  const logout = useCallback((): Promise<void> => {
    if (logoutRef.current) return logoutRef.current;
    setStatus('logging-out');
    const controller = new AbortController();
    const request = import('../../adapters/api-client/authApi')
      .then(({ logout: logoutRequest }) => logoutRequest(controller.signal))
      .catch(() => undefined)
      .then(() => {
        setSession(null);
        setStatus('unauthenticated');
      })
      .finally(() => {
        if (logoutRef.current === request) logoutRef.current = null;
      });
    logoutRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    const handleAuthenticationRequired = () => expire();
    window.addEventListener('lightframe:authentication-required', handleAuthenticationRequired);
    return () => {
      window.removeEventListener(
        'lightframe:authentication-required',
        handleAuthenticationRequired,
      );
      loginControllerRef.current?.abort();
    };
  }, [expire]);

  useEffect(() => {
    if (!session) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = window.setTimeout(expire, Math.max(0, Math.min(remaining, 2_147_000_000)));
    return () => window.clearTimeout(timer);
  }, [expire, session]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, restore, login, logout, expire }),
    [expire, login, logout, restore, session, status],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
};
