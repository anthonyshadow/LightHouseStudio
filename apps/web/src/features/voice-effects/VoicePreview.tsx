import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceLibraryItem } from './types';
import { fetchVoicePreview } from '../../adapters/api-client/voicesApi';

export const useVoicePreviewController = (onError: (item: VoiceLibraryItem) => void) => {
  const [item, setItem] = useState<VoiceLibraryItem | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clear = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    audioRef.current?.pause();
    releaseObjectUrl();
    setItem(null);
    setObjectUrl(null);
    setLoadingVoiceId(null);
    setPlaying(false);
  }, [releaseObjectUrl]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
      audioRef.current?.pause();
      releaseObjectUrl();
    },
    [releaseObjectUrl],
  );

  const load = useCallback(
    async (nextItem: VoiceLibraryItem) => {
      if (!nextItem.voice.previewAvailable) return;
      requestRef.current?.abort();
      audioRef.current?.pause();
      releaseObjectUrl();
      setItem(nextItem);
      setObjectUrl(null);
      setPlaying(false);
      setLoadingVoiceId(nextItem.voice.voiceId);
      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const preview = await fetchVoicePreview(nextItem, controller.signal);
        controller.signal.throwIfAborted();
        if (requestRef.current !== controller) return;
        const nextUrl = URL.createObjectURL(preview);
        objectUrlRef.current = nextUrl;
        setObjectUrl(nextUrl);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) onError(nextItem);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingVoiceId(null);
        }
      }
    },
    [onError, releaseObjectUrl],
  );

  const toggle = useCallback(
    async (nextItem: VoiceLibraryItem) => {
      const sameVoice = item?.voice.voiceId === nextItem.voice.voiceId;
      if (!sameVoice || !objectUrl) {
        await load(nextItem);
        return;
      }
      if (playing) {
        audioRef.current?.pause();
        return;
      }
      try {
        await audioRef.current?.play();
      } catch {
        onError(nextItem);
      }
    },
    [item?.voice.voiceId, load, objectUrl, onError, playing],
  );

  const reportPlaybackError = useCallback(() => {
    if (!item) return;
    setPlaying(false);
    onError(item);
  }, [item, onError]);

  const attachAudio = useCallback((node: HTMLAudioElement | null) => {
    audioRef.current = node;
  }, []);

  return {
    item,
    objectUrl,
    loadingVoiceId,
    playing,
    load,
    toggle,
    clear,
    setPlaying,
    reportPlaybackError,
    attachAudio,
  } as const;
};

export type VoicePreviewProps = {
  item: VoiceLibraryItem | null;
  objectUrl: string | null;
  attachAudio: (node: HTMLAudioElement | null) => void;
  setPlaying: (playing: boolean) => void;
  reportPlaybackError: () => void;
};

export const VoicePreview = ({
  item,
  objectUrl,
  attachAudio,
  setPlaying,
  reportPlaybackError,
}: VoicePreviewProps) => {
  if (!item || !objectUrl) return null;

  return (
    <audio
      ref={attachAudio}
      autoPlay
      preload="metadata"
      src={objectUrl}
      aria-label={`Listen to ${item.voice.name} preview`}
      css={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={reportPlaybackError}
    />
  );
};
