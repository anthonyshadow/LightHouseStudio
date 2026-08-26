import { useSyncExternalStore } from 'react';
import { environmentScopedPersistenceName } from '../../persistence/environmentScope';

const STORAGE_BASE = 'lightframe.dashboard-onboarding.v1';

type OnboardingEnvelope = Readonly<{
  version: 1;
  dismissed: true;
}>;

export const dashboardOnboardingStorageKey = (ownerUserId: string): string =>
  environmentScopedPersistenceName(STORAGE_BASE, ownerUserId);

/*
 * What this browser decided, whether or not it could write it down.
 *
 * A refused write — private browsing, a partitioned embed, an exhausted quota — must still honour
 * the choice for as long as the tab lives. Deriving visibility from storage alone made "Got it"
 * a no-op there: the write threw, the read still said "not dismissed", and the guidance came
 * straight back with the same button under it, forever. Storage is the durable copy; this is the
 * one that always answers.
 */
const sessionDismissals = new Map<string, boolean>();

const readDismissed = (ownerUserId: string): boolean => {
  const decided = sessionDismissals.get(ownerUserId);
  if (decided !== undefined) return decided;
  try {
    const raw = window.localStorage.getItem(dashboardOnboardingStorageKey(ownerUserId));
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      parsed.version === 1 &&
      'dismissed' in parsed &&
      parsed.dismissed === true
    );
  } catch {
    return false;
  }
};

/*
 * Two surfaces read this — the Dashboard, which shows the guidance, and Settings, which brings it
 * back — and Settings can be open over the Dashboard while it does. The subscriber set is what
 * keeps them in step: every reader hears a change at the same moment, from the one writer.
 */
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const persist = (ownerUserId: string, dismissed: boolean): boolean => {
  try {
    if (dismissed)
      window.localStorage.setItem(
        dashboardOnboardingStorageKey(ownerUserId),
        JSON.stringify({ version: 1, dismissed: true } satisfies OnboardingEnvelope),
      );
    else window.localStorage.removeItem(dashboardOnboardingStorageKey(ownerUserId));
    return true;
  } catch {
    return false;
  }
};

/**
 * Applies the choice, then reports whether it will outlive the tab.
 *
 * The result is computed before subscribers run: notifying inside a `finally` let a throw from any
 * listener's render replace the return value, so the caller that asked "was this retained?" got an
 * exception instead of an answer.
 */
const write = (ownerUserId: string, dismissed: boolean): boolean => {
  sessionDismissals.set(ownerUserId, dismissed);
  const persisted = persist(ownerUserId, dismissed);
  for (const listener of listeners) listener();
  return persisted;
};

export const persistDashboardOnboardingDismissed = (ownerUserId: string): boolean =>
  write(ownerUserId, true);

/** Brings the guidance back. Whether it then *shows* is still the Dashboard's own first-run test. */
export const clearDashboardOnboardingDismissed = (ownerUserId: string): boolean =>
  write(ownerUserId, false);

/** What both readers use, so neither restates the store's wiring or its pre-hydration default. */
export const useDashboardOnboardingDismissed = (ownerUserId: string): boolean =>
  useSyncExternalStore(
    subscribe,
    () => readDismissed(ownerUserId),
    () => readDismissed(ownerUserId),
  );

/** The one notice for a browser that refuses to keep the preference, wherever it is changed. */
export const ONBOARDING_PREFERENCE_NOT_RETAINED = {
  title: 'Preference not retained',
  body: 'Lightframe could not save this account-scoped onboarding preference in this browser.',
} as const;
