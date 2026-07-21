import type { GuidedFlowOperationKind, GuidedFlowState, GuidedStage } from '../guided-flow';

export const RECORDING_LIMIT_SECONDS = 5 * 60;
export const RECORDING_WARNING_SECONDS = 30;
export const GUIDED_SESSION_SECONDS = 7 * 60;
export const GUIDED_AI_READY_TIMEOUT_MS = 45_000;
export const RECONNECT_BEFORE_RECORD_SECONDS =
  GUIDED_SESSION_SECONDS - RECORDING_LIMIT_SECONDS - 15;

export const GUIDED_STAGES: readonly {
  id: GuidedStage;
  title: string;
  subtitle: string;
}[] = [
  { id: 'create', title: 'Create', subtitle: 'Your Character' },
  { id: 'live', title: 'Go Live', subtitle: 'with AI' },
  { id: 'record', title: 'Record', subtitle: 'Your Take' },
  { id: 'voice', title: 'Add', subtitle: 'Voice' },
  { id: 'download', title: 'Download', subtitle: '& Done' },
];

export const stageForStatus = (status: GuidedFlowState['status']): GuidedStage => {
  if (status.startsWith('create.')) return 'create';
  if (status.startsWith('live.')) return 'live';
  if (status.startsWith('record.')) return 'record';
  if (status.startsWith('voice.')) return 'voice';
  return 'download';
};

export const createOperationId = (kind: GuidedFlowOperationKind) =>
  `${kind}:${crypto.randomUUID()}`;

export const friendlyError = (caught: unknown, fallback: string): string =>
  caught instanceof Error && caught.message ? caught.message : fallback;

const safeExtension = (mimeType: string): string => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  return 'webm';
};

const slug = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '') || 'character-video';

export const readableFilename = (
  characterName: string,
  voiceName: string | null,
  mimeType: string,
): string => {
  const day = new Date().toISOString().slice(0, 10);
  return `${slug(characterName)}-${slug(voiceName ?? 'original')}-${day}.${safeExtension(mimeType)}`;
};

export const projectTitle = (name: string): string => name.trim() || 'Untitled Character Project';
