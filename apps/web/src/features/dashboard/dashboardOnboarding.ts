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
 * Two surfaces read this — the Dashboard, which shows the guidance, and Settings, which brings it
 * back — and Settings can be open over the Dashboard while it does. One owner keeps them in step:
 * subscribers so every reader hears a change at the same moment, and a cached snapshot so
 * `useSyncExternalStore` can compare identities without parsing storage on every render of a shell
 * that lives for the whole session.
 */
const readDismissed = (ownerUserId: string): boolean => {
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

const listeners = new Set<() => void>();
const snapshots = new Map<string, boolean>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const snapshot = (ownerUserId: string): boolean => {
  const cached = snapshots.get(ownerUserId);
  if (cached !== undefined) return cached;
  const value = readDismissed(ownerUserId);
  snapshots.set(ownerUserId, value);
  return value;
};

const write = (ownerUserId: string, dismissed: boolean): boolean => {
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
  } finally {
    snapshots.delete(ownerUserId);
    for (const listener of listeners) listener();
  }
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
    () => snapshot(ownerUserId),
    () => snapshot(ownerUserId),
  );

/** The one message for a browser that refuses to keep the preference, wherever it is changed. */
export const ONBOARDING_PREFERENCE_NOT_RETAINED =
  'Lightframe could not save this account-scoped onboarding preference in this browser.';
