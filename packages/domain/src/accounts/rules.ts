import { PHASE_ONE_CAPABILITY_IDS, type EntitlementSnapshot, type UserPlanId } from './types';

export const createPhaseOneEntitlements = (
  planId: UserPlanId,
  evaluatedAt: string,
): EntitlementSnapshot => ({
  planId,
  capabilities: Object.fromEntries(
    PHASE_ONE_CAPABILITY_IDS.map((capability) => [capability, true]),
  ) as EntitlementSnapshot['capabilities'],
  limits: {
    maximumSavedVideos: null,
    maximumSavedCharacters: null,
    maximumSavedOutfits: null,
    monthlyCredits: null,
  },
  evaluatedAt,
});
