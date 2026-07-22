import type { SafeError } from '../errors/safe-error';

export const LOCAL_VOICE_EFFECT_IDS = ['warm-studio', 'clear-presenter', 'robot'] as const;
export type LocalVoiceEffectId = (typeof LOCAL_VOICE_EFFECT_IDS)[number];

export type VoiceEffectSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'local'; readonly effectId: LocalVoiceEffectId }
  | {
      readonly kind: 'elevenlabs';
      readonly voiceId: string;
      readonly voiceName: string;
    };

export type VoiceProcessingState<TArtifact> =
  | {
      readonly status: 'idle';
      readonly original: TArtifact;
      readonly processed: null;
      readonly selection: { readonly kind: 'none' };
    }
  | {
      readonly status: 'processing';
      readonly original: TArtifact;
      /** Last successful artifact stays recoverable until replacement succeeds. */
      readonly processed: TArtifact | null;
      readonly selection: Exclude<VoiceEffectSelection, { readonly kind: 'none' }>;
      readonly operationId: string;
    }
  | {
      readonly status: 'ready';
      readonly original: TArtifact;
      readonly processed: TArtifact;
      readonly selection: Exclude<VoiceEffectSelection, { readonly kind: 'none' }>;
    }
  | {
      readonly status: 'error';
      readonly original: TArtifact;
      readonly processed: TArtifact | null;
      readonly selection: Exclude<VoiceEffectSelection, { readonly kind: 'none' }>;
      readonly error: SafeError;
    };
