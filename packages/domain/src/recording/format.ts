import type { SessionModeId } from '../session';
import { recordingFileExtension } from './mime';

const filenameMode: Readonly<Record<SessionModeId, string>> = {
  local: 'local',
  'lucy-2.5': 'character',
  'lucy-vton-3': 'virtual-try-on',
};

const timestampForFilename = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isFinite(date.valueOf()) ? date : new Date(0);
  return safeDate
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
};

export const createRecordingFilename = (
  modeId: SessionModeId,
  startedAt: string | number | Date,
  mimeType: string,
): string =>
  `${filenameMode[modeId]}-take-${timestampForFilename(startedAt)}.${recordingFileExtension(mimeType)}`;

export const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const formatFileSize = (sizeBytes: number): string => {
  const bytes = Math.max(0, sizeBytes);
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  const kib = bytes / 1_024;
  if (kib < 1_024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`;
  const mib = kib / 1_024;
  if (mib < 1_024) return `${mib.toFixed(mib >= 10 ? 1 : 2)} MiB`;
  return `${(mib / 1_024).toFixed(2)} GiB`;
};
