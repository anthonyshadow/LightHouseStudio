import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedVideoDetail, SavedVideoOrigin } from '@studio/contracts';
import {
  appendSavedVideoVersion,
  appendSavedVideoVersionDirect,
  saveSavedVideoThumbnail,
  saveVideo,
  saveVideoDirect,
} from '../../adapters/api-client/savedVideosApi';
import type { RecordingArtifact } from '../recording/types';
import { createSavedVideoThumbnail } from './thumbnailClient';

export type SaveVideoState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving'; readonly artifactId: string }
  | { readonly status: 'saved'; readonly artifactId: string; readonly video: SavedVideoDetail }
  | { readonly status: 'error'; readonly artifactId: string; readonly message: string };

export type SavedVideoCharacterAttribution = Readonly<{
  characterName: string;
  characterVariantName: string | null;
}>;

export const defaultSavedVideoName = (artifact: RecordingArtifact): string =>
  artifact.name?.trim() || artifact.filename.replace(/\.[^.]+$/u, '');

const savedVideoName = (artifact: RecordingArtifact, requestedName?: string): string =>
  requestedName?.trim() || defaultSavedVideoName(artifact);

const originForArtifact = (artifact: RecordingArtifact): SavedVideoOrigin => {
  switch (artifact.kind) {
    case 'uploaded':
      return 'uploaded';
    case 'edited':
      return 'editor';
    case 'visual':
      return 'character-swap';
    case 'voice':
      return 'voice-treatment';
    case 'recorded':
    default:
      return 'recorded';
  }
};

export const useSaveVideo = (directMultipartUpload = false) => {
  const [state, setState] = useState<SaveVideoState>({ status: 'idle' });
  const keys = useRef(new Map<string, string>());
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort('unmount'), []);

  const save = useCallback(
    async (
      artifact: RecordingArtifact,
      title?: string,
      source?: { readonly videoId: string; readonly versionId: string },
      character?: SavedVideoCharacterAttribution | null,
    ) => {
      if (controller.current !== null) return null;
      const idempotencyKey = keys.current.get(artifact.id) ?? crypto.randomUUID();
      keys.current.set(artifact.id, idempotencyKey);
      const active = new AbortController();
      controller.current = active;
      setState({ status: 'saving', artifactId: artifact.id });
      try {
        const video = await (directMultipartUpload ? saveVideoDirect : saveVideo)({
          blob: artifact.media,
          title: savedVideoName(artifact, title),
          filename: artifact.filename,
          origin: originForArtifact(artifact),
          characterName: character?.characterName ?? null,
          characterVariantName: character?.characterVariantName ?? null,
          idempotencyKey,
          sourceVideoId: source?.videoId ?? null,
          sourceVersionId: source?.versionId ?? null,
          signal: active.signal,
        });
        const saved = await createSavedVideoThumbnail(artifact.media, active.signal)
          .then((thumbnail) =>
            saveSavedVideoThumbnail(video.id, video.currentVersion.id, thumbnail, active.signal),
          )
          .catch((error: unknown) => {
            if (active.signal.aborted) throw error;
            return video;
          });
        if (active.signal.aborted) return null;
        setState({ status: 'saved', artifactId: artifact.id, video: saved });
        return saved;
      } catch (error) {
        if (active.signal.aborted) return null;
        setState({
          status: 'error',
          artifactId: artifact.id,
          message: error instanceof Error ? error.message : 'The video could not be saved.',
        });
        return null;
      } finally {
        if (controller.current === active) controller.current = null;
      }
    },
    [directMultipartUpload],
  );

  const replace = useCallback(
    async (
      artifact: RecordingArtifact,
      target: { readonly videoId: string; readonly currentVersionId: string },
      title?: string,
      character?: SavedVideoCharacterAttribution | null,
    ) => {
      if (controller.current !== null) return null;
      const keyId = `${artifact.id}:replace:${target.videoId}:${target.currentVersionId}`;
      const idempotencyKey = keys.current.get(keyId) ?? crypto.randomUUID();
      keys.current.set(keyId, idempotencyKey);
      const active = new AbortController();
      controller.current = active;
      setState({ status: 'saving', artifactId: artifact.id });
      try {
        const saveVersion = directMultipartUpload
          ? appendSavedVideoVersionDirect
          : appendSavedVideoVersion;
        const video = await saveVersion(target.videoId, target.currentVersionId, {
          blob: artifact.media,
          title: savedVideoName(artifact, title),
          filename: artifact.filename,
          origin: originForArtifact(artifact),
          characterName: character?.characterName ?? null,
          characterVariantName: character?.characterVariantName ?? null,
          idempotencyKey,
          sourceVideoId: target.videoId,
          sourceVersionId: target.currentVersionId,
          signal: active.signal,
        });
        const saved = await createSavedVideoThumbnail(artifact.media, active.signal)
          .then((thumbnail) =>
            saveSavedVideoThumbnail(video.id, video.currentVersion.id, thumbnail, active.signal),
          )
          .catch((error: unknown) => {
            if (active.signal.aborted) throw error;
            return video;
          });
        if (active.signal.aborted) return null;
        setState({ status: 'saved', artifactId: artifact.id, video: saved });
        return saved;
      } catch (error) {
        if (active.signal.aborted) return null;
        setState({
          status: 'error',
          artifactId: artifact.id,
          message: error instanceof Error ? error.message : 'The video could not be replaced.',
        });
        return null;
      } finally {
        if (controller.current === active) controller.current = null;
      }
    },
    [directMultipartUpload],
  );

  const reset = useCallback(() => {
    controller.current?.abort('reset');
    controller.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, save, replace, reset } as const;
};
