export const USER_PLAN_IDS = ['free', 'plus', 'pro'] as const;
export type UserPlanId = (typeof USER_PLAN_IDS)[number];

export interface UserAccount {
  readonly id: string;
  readonly login: string;
  readonly username: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly planId: UserPlanId;
  readonly role: 'user' | 'admin';
  readonly status: 'active' | 'disabled';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastLoginAt: string | null;
}

export interface AccountCommercialSummary {
  readonly billing: null;
  readonly paymentHistory: null;
  readonly usage: null;
  readonly tokenBalance: null;
  readonly subscription: null;
}

export const PHASE_ONE_CAPABILITY_IDS = [
  'local-camera',
  'upload-video',
  'character-swap',
  'virtual-try-on',
  'voice-effects',
  'video-editor',
  'saved-characters',
  'saved-outfits',
  'saved-videos',
] as const;

export type PhaseOneCapabilityId = (typeof PHASE_ONE_CAPABILITY_IDS)[number];

export interface EntitlementSnapshot {
  readonly planId: UserPlanId;
  readonly capabilities: Readonly<Record<PhaseOneCapabilityId, boolean>>;
  readonly limits: {
    readonly maximumSavedVideos: number | null;
    readonly maximumSavedCharacters: number | null;
    readonly maximumSavedOutfits: number | null;
    readonly monthlyCredits: number | null;
  };
  readonly evaluatedAt: string;
}
