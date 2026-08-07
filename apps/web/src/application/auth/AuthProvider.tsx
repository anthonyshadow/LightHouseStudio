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
  const restoreControllerRef = useRef<AbortController | null>(null);
  const loginControllerRef = useRef<AbortController | null>(null);
  const logoutRef = useRef<Promise<void> | null>(null);
  const logoutControllerRef = useRef<AbortController | null>(null);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  const expire = useCallback(() => {
    operationGenerationRef.current += 1;
    restoreControllerRef.current?.abort('session-expired');
    loginControllerRef.current?.abort('session-expired');
    logoutControllerRef.current?.abort('session-expired');
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const restore = useCallback((): Promise<boolean> => {
    if (session) return Promise.resolve(true);
    if (restoreRef.current) return restoreRef.current;
    const controller = new AbortController();
    const generation = operationGenerationRef.current;
    restoreControllerRef.current = controller;
    const request = import('../../adapters/api-client/authApi')
      .then(({ fetchCurrentSession }) => fetchCurrentSession(controller.signal))
      .then((restored) => {
        if (controller.signal.aborted || generation !== operationGenerationRef.current)
          return false;
        setSession(restored);
        setStatus('authenticated');
        return true;
      })
      .catch(() => {
        if (controller.signal.aborted || generation !== operationGenerationRef.current)
          return false;
        setSession(null);
        setStatus('unauthenticated');
        return false;
      })
      .finally(() => {
        if (restoreRef.current === request) restoreRef.current = null;
        if (restoreControllerRef.current === controller) restoreControllerRef.current = null;
      });
    restoreRef.current = request;
    return request;
  }, [session]);

  const login = useCallback(async (login: string, password: string): Promise<boolean> => {
    operationGenerationRef.current += 1;
    restoreControllerRef.current?.abort('login-started');
    loginControllerRef.current?.abort();
    const controller = new AbortController();
    const generation = operationGenerationRef.current;
    loginControllerRef.current = controller;
    setStatus('authenticating');
    try {
      const authenticated = await import('../../adapters/api-client/authApi').then(
        ({ login: loginRequest }) => loginRequest({ login, password }, controller.signal),
      );
      if (controller.signal.aborted || generation !== operationGenerationRef.current) return false;
      setSession(authenticated);
      setStatus('authenticated');
      return true;
    } catch (error) {
      if (!controller.signal.aborted && generation === operationGenerationRef.current) {
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
    operationGenerationRef.current += 1;
    const generation = operationGenerationRef.current;
    restoreControllerRef.current?.abort('logout-started');
    loginControllerRef.current?.abort('logout-started');
    setStatus('logging-out');
    const controller = new AbortController();
    logoutControllerRef.current = controller;
    const request = import('../../adapters/api-client/authApi')
      .then(({ logout: logoutRequest }) => logoutRequest(controller.signal))
      .catch(() => undefined)
      .then(() => {
        if (controller.signal.aborted || generation !== operationGenerationRef.current) return;
        setSession(null);
        setStatus('unauthenticated');
      })
      .finally(() => {
        if (logoutRef.current === request) logoutRef.current = null;
        if (logoutControllerRef.current === controller) logoutControllerRef.current = null;
      });
    logoutRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const handleAuthenticationRequired = () => expire();
    window.addEventListener('lightframe:authentication-required', handleAuthenticationRequired);
    return () => {
      window.removeEventListener(
        'lightframe:authentication-required',
        handleAuthenticationRequired,
      );
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        operationGenerationRef.current += 1;
        restoreControllerRef.current?.abort('unmount');
        loginControllerRef.current?.abort();
        logoutControllerRef.current?.abort('unmount');
      });
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
