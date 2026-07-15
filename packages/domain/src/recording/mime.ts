export const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=av1,opus',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
] as const;

export type MimeSupportTest = (mimeType: string) => boolean;

/** Undefined means let MediaRecorder choose the browser default. */
export const selectRecordingMimeType = (
  isTypeSupported: MimeSupportTest,
  candidates: readonly string[] = RECORDING_MIME_CANDIDATES,
): string | undefined => candidates.find((candidate) => isTypeSupported(candidate));

export const recordingFileExtension = (mimeType: string): 'mp4' | 'webm' =>
  mimeType.toLocaleLowerCase('en-US').includes('mp4') ? 'mp4' : 'webm';

export const isAudioMimeType = (mimeType: string): boolean =>
  /^audio\/(?:aac|mp3|mp4|mpeg|ogg|wav|webm)(?:;|$)/iu.test(mimeType.trim());

export const isSupportedVoiceSidecarMimeType = (mimeType: string): boolean =>
  isAudioMimeType(mimeType);
