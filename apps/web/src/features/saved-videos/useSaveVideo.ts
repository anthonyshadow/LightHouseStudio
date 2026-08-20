import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedVideoDetail, SavedVideoOrigin } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  appendSavedVideoVersion,
  appendSavedVideoVersionDirect,
  saveSavedVideoThumbnail,
  saveVideo,
  saveVideoDirect,
} from '../../adapters/api-client/savedVideosApi';
import type { RecordingArtifact } from '../recording/types';
import { savedVideoQueryKeys } from './savedVideoQueryKeys';
import {
  createThumbnailForChoice,
  DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  type SavedVideoThumbnailChoice,
} from './thumbnailSource';

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

/**
 * A poster frame is never a precondition for saving: generation retries once, and a persistent
 * failure leaves the saved record intact and repairable from the Videos library.
 */
const saveThumbnailWhenAvailable = async (
  video: SavedVideoDetail,
  media: Blob,
  signal: AbortSignal,
  thumbnail: SavedVideoThumbnailChoice,
): Promise<SavedVideoDetail> =>
  // The bytes are already in hand from the capture or edit that produced them; re-requesting them
  // over a range would be slower than decoding what is in memory.
  createThumbnailForChoice(thumbnail, { kind: 'blob', blob: media }, signal)
    .then((poster) => saveSavedVideoThumbnail(video.id, video.currentVersion.id, poster, signal))
    .catch((error: unknown) => {
      if (signal.aborted) throw error;
      return video;
    });

/**
 * Everything a save may carry besides the bytes. Named rather than positional: these are all
 * optional and two of them are adjacent nullables, so argument order was the only thing keeping a
 * caller from silently swapping them.
 */
export type SaveVideoOptions = Readonly<{
  title?: string | undefined;
  source?: { readonly videoId: string; readonly versionId: string } | undefined;
  character?: SavedVideoCharacterAttribution | null | undefined;
  thumbnail?: SavedVideoThumbnailChoice | undefined;
}>;

/** The same, for a replacement — whose target names the source, so it carries none. */
export type ReplaceVideoOptions = Omit<SaveVideoOptions, 'source'>;

export const useSaveVideo = (directMultipartUpload = false) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveVideoState>({ status: 'idle' });
  const keys = useRef(new Map<string, string>());
  const controller = useRef<AbortController | null>(null);

  const completeSave = useCallback(
    (artifactId: string, video: SavedVideoDetail) => {
      void queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.lists });
      setState({ status: 'saved', artifactId, video });
    },
    [queryClient],
  );

  useEffect(() => () => controller.current?.abort('unmount'), []);

  const save = useCallback(
    async (
      artifact: RecordingArtifact,
      {
        title,
        source,
        character,
        thumbnail = DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
      }: SaveVideoOptions = {},
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
        const saved = await saveThumbnailWhenAvailable(
          video,
          artifact.media,
          active.signal,
          thumbnail,
        );
        if (active.signal.aborted) return null;
        completeSave(artifact.id, saved);
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
    [completeSave, directMultipartUpload],
  );

  const replace = useCallback(
    async (
      artifact: RecordingArtifact,
      target: { readonly videoId: string; readonly currentVersionId: string },
      {
        title,
        character,
        thumbnail = DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
      }: ReplaceVideoOptions = {},
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
        const saved = await saveThumbnailWhenAvailable(
          video,
          artifact.media,
          active.signal,
          thumbnail,
        );
        if (active.signal.aborted) return null;
        completeSave(artifact.id, saved);
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
    [completeSave, directMultipartUpload],
  );

  const reset = useCallback(() => {
    controller.current?.abort('reset');
    controller.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, save, replace, reset } as const;
};
