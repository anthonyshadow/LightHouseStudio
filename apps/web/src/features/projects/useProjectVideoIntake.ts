import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EXISTING_VIDEO_INTAKE_NOTICES,
  type ExistingVideoIntakePhase,
} from '../existing-video/videoIntakeNotices';
import { validateExistingVideo } from '../existing-video/videoValidation';

/**
 * This browser's own intake: the file is asked about here before the server is.
 *
 * A phone records HEVC by default, which this product cannot publish and the source routes refuse
 * outright — so a Project could not take on the clip the operator actually has, while the Studio
 * surface accepted the same clip by converting it. `validateExistingVideo` is that decision and
 * stays its only owner; this hook holds the wait, says which half of it is running, and hands on
 * the file that came back — the original where nothing was wrong with it, the converted MP4 where
 * the codec was.
 *
 * Shared by both surfaces that put video into a Project. The original video and the rest of its
 * media are different acts with different rules, but what a browser will and will not publish is
 * not one of the differences.
 */
export const useProjectVideoIntake = (onAccepted: (file: File) => void) => {
  const [phase, setPhase] = useState<ExistingVideoIntakePhase | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // A conversion holds the whole video in memory and answers to nothing else here, so a surface
  // that goes away takes it with it rather than leaving it running for a component that is gone.
  useEffect(
    () => () => {
      controllerRef.current?.abort('project-source-intake-unmounted');
      controllerRef.current = null;
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort('project-source-intake-cancelled');
    controllerRef.current = null;
    setPhase(null);
  }, []);

  /** Clears a refusal that another way to a video has just superseded. */
  const dismiss = useCallback(() => setRefusal(null), []);

  const offer = useCallback(
    async (file: File) => {
      controllerRef.current?.abort('project-source-intake-replaced');
      const controller = new AbortController();
      controllerRef.current = controller;
      setRefusal(null);
      setPhase('checking');
      try {
        const validated = await validateExistingVideo(file, false, controller.signal, 'source', {
          onConvert: () => setPhase('converting'),
          // Only `file` is read below: the bytes go to the server, which inspects them itself and
          // answers with the source it accepted. Muxing the audio out again here would read the
          // whole track into memory beside the video it came from, on the path this product's
          // recording memory budget accounts for, to throw it away on the next line.
          audioSidecar: 'skip',
        });
        if (controller.signal.aborted) return;
        setPhase(null);
        onAccepted(validated.file);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase(null);
        // The intake's own words, unedited: they name what this product publishes and, for a file
        // this browser cannot convert either, what to do about it. Restating them here would put a
        // second owner on a refusal the intake already decides.
        setRefusal(
          error instanceof Error ? error.message : 'That video could not be used as a source.',
        );
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [onAccepted],
  );

  return { phase, refusal, offer, cancel, dismiss } as const;
};

/*
 * Two waits, said apart, because they are nothing alike: reading a file's format is a moment, and
 * re-encoding a whole video on this device is minutes. Their names and sentences belong to the
 * intake, beside the decision that picks between them and next to the Studio surface that shows the
 * same two waits; all a Project surface decides is that both are progress rather than a problem.
 */
export const projectVideoIntakeNotice = (
  phase: ExistingVideoIntakePhase,
): { readonly title: string; readonly tone: 'neutral'; readonly body: string } => ({
  ...EXISTING_VIDEO_INTAKE_NOTICES[phase],
  tone: 'neutral',
});

/** The file types a Project accepts, for the pickers that offer one. */
export const PROJECT_VIDEO_FILE_ACCEPT = 'video/mp4,video/quicktime,video/webm';
