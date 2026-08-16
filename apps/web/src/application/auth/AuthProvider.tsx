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
  'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'expiring' | 'logging-out';

/**
 * Why the session ended, for the entry surface to explain. `null` covers "never signed in", which
 * reads differently to the user than a session that ended underneath them.
 */
export type SessionEndReason = 'expired';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: AuthenticatedSessionResponse | null;
  readonly sessionEndReason: SessionEndReason | null;
  readonly restore: () => Promise<boolean>;
  readonly login: (login: string, password: string) => Promise<boolean>;
  readonly logout: () => Promise<void>;
  readonly expire: () => void;
  /**
   * Registers a hold on session teardown and returns its release. While at least one hold is
   * registered, `expire()` parks in `'expiring'` — keeping the session readable so the surface
   * holding in-memory work can explain what is about to be lost — instead of dropping straight to
   * `'unauthenticated'`. Releasing the last hold during `'expiring'` finalizes, so a holder that
   * unmounts for any reason (error boundary, crash, HMR) cannot strand the app.
   */
  readonly holdSessionEnd: () => () => void;
  readonly completeSessionEnd: () => void;
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
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);
  const restoreRef = useRef<Promise<boolean> | null>(null);
  const restoreControllerRef = useRef<AbortController | null>(null);
  const loginControllerRef = useRef<AbortController | null>(null);
  const logoutRef = useRef<Promise<void> | null>(null);
  const logoutControllerRef = useRef<AbortController | null>(null);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const statusRef = useRef(status);
  const sessionRef = useRef(session);
  const holdsRef = useRef(new Set<symbol>());
  useEffect(() => {
    statusRef.current = status;
    sessionRef.current = session;
  });

  const completeSessionEnd = useCallback(() => {
    if (statusRef.current !== 'expiring') return;
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const holdSessionEnd = useCallback((): (() => void) => {
    const token = Symbol('session-end-hold');
    holdsRef.current.add(token);
    return () => {
      if (!holdsRef.current.delete(token)) return;
      if (holdsRef.current.size === 0) completeSessionEnd();
    };
  }, [completeSessionEnd]);

  // Identity must stay stable: the expiry timer effect below depends on it, and a changing
  // identity would restart that timer on every status change.
  const expire = useCallback(() => {
    // Every same-origin 401 dispatches the expiry event, and background pollers keep firing while
    // the notice is open. Re-entering would abort a second time and reset the decision.
    if (statusRef.current === 'expiring' || statusRef.current === 'unauthenticated') return;
    operationGenerationRef.current += 1;
    restoreControllerRef.current?.abort('session-expired');
    loginControllerRef.current?.abort('session-expired');
    logoutControllerRef.current?.abort('session-expired');
    setSessionEndReason('expired');
    // A voluntary logout owns its own prompt; a 401 from POST /api/auth/logout must not open a
    // second one on top of it. With no session or no registered holder there is nothing to hold
    // for, so teardown stays immediate — the behaviour every non-Studio surface already had.
    if (
      sessionRef.current === null ||
      statusRef.current === 'logging-out' ||
      holdsRef.current.size === 0
    ) {
      setSession(null);
      setStatus('unauthenticated');
      return;
    }
    // The session stays readable through 'expiring' so the holder can render; `completeSessionEnd`
    // clears it.
    setStatus('expiring');
  }, []);

  const restore = useCallback((): Promise<boolean> => {
    // During 'expiring' the session is deliberately still readable, so this would resolve `true`
    // for a session the server has already rejected. No caller can reach it — ProtectedRoute and
    // EntryPage both gate on status === 'unknown'.
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
        setSessionEndReason(null);
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
      setSessionEndReason(null);
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
    setSessionEndReason(null);
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
    () => ({
      status,
      session,
      sessionEndReason,
      restore,
      login,
      logout,
      expire,
      holdSessionEnd,
      completeSessionEnd,
    }),
    [
      completeSessionEnd,
      expire,
      holdSessionEnd,
      login,
      logout,
      restore,
      session,
      sessionEndReason,
      status,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
};
