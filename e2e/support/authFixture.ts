import type { AuthenticatedSessionResponse } from '@studio/contracts';

const capabilities = {
  'local-camera': true,
  'upload-video': true,
  'character-swap': true,
  'virtual-try-on': true,
  'voice-effects': true,
  'video-editor': true,
  'saved-characters': true,
  'saved-outfits': true,
  'saved-videos': true,
} as const;

export const TEST_AUTH_SESSION = {
  user: {
    id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
    login: 'demo@lightframe.local',
    username: 'demo',
    email: 'demo@lightframe.local',
    displayName: 'Lightframe Demo',
    avatarUrl: null,
    planId: 'free',
    role: 'user',
    status: 'active',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    lastLoginAt: '2026-08-05T00:00:00.000Z',
  },
  entitlements: {
    planId: 'free',
    capabilities,
    limits: {
      maximumSavedVideos: null,
      maximumSavedCharacters: null,
      maximumSavedOutfits: null,
      monthlyCredits: null,
    },
    evaluatedAt: '2026-08-05T00:00:00.000Z',
  },
  expiresAt: '2099-08-05T00:00:00.000Z',
} satisfies AuthenticatedSessionResponse;

export const TEST_DEMO_CONFIG = {
  enabled: true,
  prefill: {
    login: 'demo@lightframe.local',
    password: 'lightframe-demo',
  },
} as const;
