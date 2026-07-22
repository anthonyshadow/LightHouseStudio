import type { LocalVoiceEffectId as DomainLocalVoiceEffectId } from '@studio/domain';

export type {
  PublicVoiceItem,
  VoiceLibraryItem,
  VoiceLibraryKind,
  WorkspaceVoiceItem,
} from '../../application/types';

export type LocalVoiceEffectId = DomainLocalVoiceEffectId;

export type VoiceEffectSelection =
  | { kind: 'none' }
  | { kind: 'local'; effect: LocalVoiceEffectId }
  | { kind: 'elevenlabs'; voiceId: string; voiceName: string };

export type VoiceProcessingController = {
  selection: VoiceEffectSelection;
  applyLocal: (effect: LocalVoiceEffectId) => Promise<void>;
  applyElevenLabs: (voiceId: string, voiceName: string) => Promise<void>;
  restoreOriginal: () => void;
  cancel: () => void;
};

export const LOCAL_EFFECTS: ReadonlyArray<{
  id: LocalVoiceEffectId;
  name: string;
  description: string;
}> = [
  { id: 'warm-studio', name: 'Warm studio', description: 'Gentle warmth and even dynamics.' },
  {
    id: 'clear-presenter',
    name: 'Clear presenter',
    description: 'Speech-focused presence and clarity.',
  },
  { id: 'robot', name: 'Signal robot', description: 'A stylized electronic modulation.' },
];
