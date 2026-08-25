import { environmentScopedPersistenceName } from '../../persistence/environmentScope';

const STORAGE_BASE = 'lightframe.dashboard-onboarding.v1';

type OnboardingEnvelope = Readonly<{
  version: 1;
  dismissed: true;
}>;

export const dashboardOnboardingStorageKey = (ownerUserId: string): string =>
  environmentScopedPersistenceName(STORAGE_BASE, ownerUserId);

export const loadDashboardOnboardingDismissed = (ownerUserId: string): boolean => {
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
 * Two surfaces read this now — the Dashboard, which shows the guidance, and Settings, which brings
 * it back — and Settings can be open over the Dashboard while it does. Subscribers exist so the
 * preference has one owner and every reader sees the same answer at the same moment, rather than
 * the Dashboard holding a copy that only refreshes when it happens to remount.
 */
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

export const subscribeDashboardOnboarding = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const write = (ownerUserId: string, envelope: OnboardingEnvelope | null): boolean => {
  try {
    if (envelope === null)
      window.localStorage.removeItem(dashboardOnboardingStorageKey(ownerUserId));
    else
      window.localStorage.setItem(
        dashboardOnboardingStorageKey(ownerUserId),
        JSON.stringify(envelope),
      );
    return true;
  } catch {
    return false;
  } finally {
    notify();
  }
};

export const persistDashboardOnboardingDismissed = (ownerUserId: string): boolean =>
  write(ownerUserId, { version: 1, dismissed: true });

/** Brings the guidance back. Whether it then *shows* is still the Dashboard's own first-run test. */
export const clearDashboardOnboardingDismissed = (ownerUserId: string): boolean =>
  write(ownerUserId, null);
