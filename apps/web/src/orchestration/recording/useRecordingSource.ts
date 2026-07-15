import { useEffect, useMemo, useState } from 'react';
import { composeRecordingSource, type RecordingSource } from '../../features/recording';
import type { StudioMode } from '../../features/media-session';

const streamEvents = ['addtrack', 'removetrack'] as const;

export const useRecordingSource = (
  mode: StudioMode,
  local: MediaStream | null,
  remote: MediaStream | null,
): RecordingSource | null => {
  const [trackRevision, setTrackRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setTrackRevision((value) => value + 1);
    const streams = [local, remote].filter((stream): stream is MediaStream => Boolean(stream));
    const tracks = streams.flatMap((stream) => stream.getTracks());

    streams.forEach((stream) => {
      streamEvents.forEach((event) => stream.addEventListener(event, refresh));
    });
    tracks.forEach((track) => track.addEventListener('ended', refresh));

    return () => {
      streams.forEach((stream) => {
        streamEvents.forEach((event) => stream.removeEventListener(event, refresh));
      });
      tracks.forEach((track) => track.removeEventListener('ended', refresh));
    };
  }, [local, remote, trackRevision]);

  return useMemo(() => {
    void trackRevision;
    return composeRecordingSource(mode, local, remote);
  }, [local, mode, remote, trackRevision]);
};
