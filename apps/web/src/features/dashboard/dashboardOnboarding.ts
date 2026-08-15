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

export const persistDashboardOnboardingDismissed = (ownerUserId: string): boolean => {
  const envelope: OnboardingEnvelope = { version: 1, dismissed: true };
  try {
    window.localStorage.setItem(
      dashboardOnboardingStorageKey(ownerUserId),
      JSON.stringify(envelope),
    );
    return true;
  } catch {
    return false;
  }
};
