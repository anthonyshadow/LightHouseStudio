import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedVideoDetail, SavedVideoOrigin } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  forgetUploadKey,
  rememberedUploadKey,
  rememberUploadKey,
  uploadFingerprint,
} from './uploadResumeStorage';
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
      // The tool that ran states itself; the fallback only covers an artifact restored from before
      // the operation was recorded, where Character Swap is the one that existed.
      return artifact.visualOperation ?? 'character-swap';
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
  /**
   * Bytes to retain in place of the artifact's own, and the filename that names them. A placement
   * export supplies these; the artifact it came from is never modified.
   */
  media?: { readonly blob: Blob; readonly filename: string } | undefined;
  /**
   * Distinguishes two different results produced from one artifact, so a re-framed save cannot
   * inherit the receipt of the save that came before it.
   */
  keyScope?: string | undefined;
}>;

/** The same, for a replacement — whose target names the source, so it carries none. */
export type ReplaceVideoOptions = Omit<SaveVideoOptions, 'source'>;

export const useSaveVideo = (
  directMultipartUpload = false,
  /**
   * Whose uploads these are. Passed in rather than read from context so this hook stays a plain
   * piece of the save flow; without it an upload still works, it just cannot be resumed after a
   * reload, because a key remembered for nobody could be replayed by the next person to sign in.
   */
  ownerUserId: string | null = null,
) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveVideoState>({ status: 'idle' });
  const keys = useRef(new Map<string, string>());

  /**
   * The idempotency key these bytes are already uploading under, minted once and remembered.
   *
   * A key is what lets the server replay a staged upload instead of starting a second one, and it
   * used to live only in the ref below — so a reload lost it and a large upload began again from
   * zero, even though the parts it had already sent were still on the server. It is remembered
   * against what the browser can say about the file without reading it, so the same file picked
   * again after a reload continues rather than repeats.
   */
  const keyFor = useCallback(
    (
      keyId: string,
      /**
       * What this upload is, in terms that survive a reload: the operation and the file, never the
       * artifact — a reload mints a new artifact id for the same picked file, and a fingerprint
       * that included it could never match the upload it is meant to resume.
       */
      scope: string,
      media: Blob,
      filename: string,
    ): { key: string; fingerprint: string } => {
      const fingerprint = uploadFingerprint(media, filename, scope);
      const remembered =
        keys.current.get(keyId) ??
        (ownerUserId === null ? null : rememberedUploadKey(ownerUserId, fingerprint, Date.now()));
      const key = remembered ?? crypto.randomUUID();
      keys.current.set(keyId, key);
      if (ownerUserId !== null) {
        rememberUploadKey(ownerUserId, {
          fingerprint,
          idempotencyKey: key,
          mintedAt: new Date().toISOString(),
        });
      }
      return { key, fingerprint };
    },
    [ownerUserId],
  );

  /**
   * Drops the remembered key once the bytes are durably stored.
   *
   * Only the remembered copy: within this session the same artifact keeps reusing its key, which
   * is what stops a second Save of one take from making a second Video. What is dropped is the
   * hint that survives a reload, because there is nothing left to resume — and a file picked again
   * in a later session is a new upload, not a replay of one that finished.
   */
  const forgetKey = useCallback(
    (fingerprint: string) => {
      if (ownerUserId !== null) forgetUploadKey(ownerUserId, fingerprint);
    },
    [ownerUserId],
  );
  const controller = useRef<AbortController | null>(null);

  const completeSave = useCallback(
    (artifactId: string, video: SavedVideoDetail) => {
      void queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.lists });
      // The Videos tab count is derived from the same membership the lists show; a save that
      // created a video moved it, and a replace costs one no-op refetch of a single integer.
      void queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.total });
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
        media,
        keyScope,
      }: SaveVideoOptions = {},
    ) => {
      if (controller.current !== null) return null;
      const keyId = keyScope === undefined ? artifact.id : `${artifact.id}:${keyScope}`;
      const retained = media?.blob ?? artifact.media;
      const { key: idempotencyKey, fingerprint } = keyFor(
        keyId,
        keyScope === undefined ? 'save' : `save:${keyScope}`,
        retained,
        artifact.filename,
      );
      const active = new AbortController();
      controller.current = active;
      setState({ status: 'saving', artifactId: artifact.id });
      try {
        const video = await (directMultipartUpload ? saveVideoDirect : saveVideo)({
          blob: retained,
          title: savedVideoName(artifact, title),
          filename: media?.filename ?? artifact.filename,
          origin: originForArtifact(artifact),
          characterName: character?.characterName ?? null,
          characterVariantName: character?.characterVariantName ?? null,
          idempotencyKey,
          sourceVideoId: source?.videoId ?? null,
          sourceVersionId: source?.versionId ?? null,
          signal: active.signal,
        });
        // The poster comes from the bytes that were actually retained, so a re-framed save is not
        // previewed by the shape it replaced.
        const saved = await saveThumbnailWhenAvailable(video, retained, active.signal, thumbnail);
        if (active.signal.aborted) return null;
        forgetKey(fingerprint);
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
    [completeSave, directMultipartUpload, forgetKey, keyFor],
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
      const { key: idempotencyKey, fingerprint } = keyFor(
        keyId,
        `replace:${target.videoId}:${target.currentVersionId}`,
        artifact.media,
        artifact.filename,
      );
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
        forgetKey(fingerprint);
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
    [completeSave, directMultipartUpload, forgetKey, keyFor],
  );

  const reset = useCallback(() => {
    controller.current?.abort('reset');
    controller.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, save, replace, reset } as const;
};
