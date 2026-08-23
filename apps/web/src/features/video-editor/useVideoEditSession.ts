import {
  VIDEO_EDIT_HISTORY_LIMIT,
  createDefaultVideoEditSpec,
  getVideoEditOutputGeometry,
  normalizeVideoEditSpec,
  videoEditSpecsEqual,
  type VideoEditSpec,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  validateEditedVideoOutput,
  type ValidatedExistingVideo,
} from '../existing-video/videoValidation';
import { renderVideoEdit, videoEditRenderingSupported } from './renderVideoEdit';
import {
  isVideoEditBusy,
  type VideoEditSessionPhase,
  type VideoEditSource,
  type VideoEditTool,
} from './types';
import { videoEditPreviewSupported } from './videoEditShader';

type HistoryState = Readonly<{
  past: readonly VideoEditSpec[];
  present: VideoEditSpec;
  future: readonly VideoEditSpec[];
}>;

type VideoEditCandidate = Readonly<{
  validated: ValidatedExistingVideo;
  spec: VideoEditSpec;
}>;

const editedFilename = (filename: string): string => {
  const base = filename.replace(/\.(mp4|mov|webm)$/iu, '') || 'video';
  const timestamp = new Date().toISOString().replace(/[-:.]/gu, '').replace('Z', '');
  return `${base}-edited-${timestamp}.mp4`;
};

const resetToolSpec = (
  tool: VideoEditTool,
  draft: VideoEditSpec,
  baseline: VideoEditSpec,
): VideoEditSpec => {
  switch (tool) {
    case 'trim':
      return { ...draft, trim: baseline.trim };
    case 'crop':
      return { ...draft, crop: baseline.crop };
    case 'rotate':
      return {
        ...draft,
        rotation: baseline.rotation,
        flipHorizontal: baseline.flipHorizontal,
        flipVertical: baseline.flipVertical,
      };
    case 'lighting':
      return { ...draft, adjustments: baseline.adjustments };
    case 'filters':
      return { ...draft, filter: baseline.filter };
  }
};

export const useVideoEditSession = () => {
  const [source, setSource] = useState<VideoEditSource | null>(null);
  const [baseline, setBaseline] = useState<VideoEditSpec>(() => createDefaultVideoEditSpec(100));
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createDefaultVideoEditSpec(100),
    future: [],
  }));
  const [activeTool, setActiveTool] = useState<VideoEditTool>('trim');
  const [showingBefore, setShowingBefore] = useState(false);
  const [splitComparison, setSplitComparison] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [phase, setPhase] = useState<VideoEditSessionPhase>('closed');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<VideoEditCandidate | null>(null);
  const [supported, setSupported] = useState(false);
  const [lastApplied, setLastApplied] = useState<Readonly<{
    sourceArtifactId: string;
    editedArtifactId: string;
    spec: VideoEditSpec;
  }> | null>(null);
  const transactionStartRef = useRef<VideoEditSpec | null>(null);
  const renderControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const sourceGeometry = useMemo(
    () =>
      source
        ? {
            width: source.metadata.width,
            height: source.metadata.height,
            durationMs: source.metadata.durationMs,
          }
        : null,
    [source],
  );
  const draft = history.present;
  const dirty = !videoEditSpecsEqual(draft, baseline);
  const begin = useCallback((nextSource: VideoEditSource) => {
    generationRef.current += 1;
    renderControllerRef.current?.abort();
    renderControllerRef.current = null;
    const nextBaseline = createDefaultVideoEditSpec(nextSource.metadata.durationMs);
    setSource(nextSource);
    setBaseline(nextBaseline);
    setHistory({ past: [], present: nextBaseline, future: [] });
    setActiveTool('trim');
    setShowingBefore(false);
    setSplitComparison(false);
    setPlayheadMs(0);
    setProgress(0);
    setError(null);
    setCandidate(null);
    setLastApplied(null);
    setSupported(videoEditPreviewSupported() && videoEditRenderingSupported());
    setPhase('editing');
  }, []);

  const close = useCallback(() => {
    generationRef.current += 1;
    renderControllerRef.current?.abort();
    renderControllerRef.current = null;
    transactionStartRef.current = null;
    setSource(null);
    setCandidate(null);
    setShowingBefore(false);
    setSplitComparison(false);
    setError(null);
    setProgress(0);
    setPhase('closed');
  }, []);

  const normalize = useCallback(
    (spec: VideoEditSpec): VideoEditSpec =>
      sourceGeometry ? normalizeVideoEditSpec(spec, sourceGeometry) : spec,
    [sourceGeometry],
  );

  const applySpec = useCallback(
    (next: VideoEditSpec) => {
      const normalized = normalize(next);
      setHistory((current) => {
        if (videoEditSpecsEqual(current.present, normalized)) return current;
        return {
          past: [...current.past, current.present].slice(-VIDEO_EDIT_HISTORY_LIMIT),
          present: normalized,
          future: [],
        };
      });
    },
    [normalize],
  );

  const beginTransaction = useCallback(() => {
    transactionStartRef.current ??= history.present;
  }, [history.present]);

  const previewSpec = useCallback(
    (next: VideoEditSpec) => {
      const normalized = normalize(next);
      setHistory((current) => ({ ...current, present: normalized }));
    },
    [normalize],
  );

  const commitTransaction = useCallback(() => {
    const start = transactionStartRef.current;
    transactionStartRef.current = null;
    if (!start) return;
    setHistory((current) =>
      videoEditSpecsEqual(start, current.present)
        ? current
        : {
            past: [...current.past, start].slice(-VIDEO_EDIT_HISTORY_LIMIT),
            present: current.present,
            future: [],
          },
    );
  }, []);

  const undo = useCallback(() => {
    transactionStartRef.current = null;
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, VIDEO_EDIT_HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    transactionStartRef.current = null;
    setHistory((current) => {
      const [next, ...remaining] = current.future;
      if (!next) return current;
      return {
        past: [...current.past, current.present].slice(-VIDEO_EDIT_HISTORY_LIMIT),
        present: next,
        future: remaining,
      };
    });
  }, []);

  const resetTool = useCallback(
    () => applySpec(resetToolSpec(activeTool, history.present, baseline)),
    [activeTool, applySpec, baseline, history.present],
  );
  const resetAll = useCallback(() => applySpec(baseline), [applySpec, baseline]);

  const startRender = useCallback(async () => {
    if (!source || !sourceGeometry || !dirty || renderControllerRef.current) return;
    if (!supported) {
      setError('This browser cannot render local video edits without blocking the Studio.');
      setPhase('error');
      return;
    }
    const generation = ++generationRef.current;
    const controller = new AbortController();
    renderControllerRef.current = controller;
    const spec = history.present;
    const geometry = getVideoEditOutputGeometry(sourceGeometry, spec);
    setError(null);
    setCandidate(null);
    setProgress(0);
    setPhase('rendering');
    try {
      const rendered = await renderVideoEdit({
        source: source.artifact.media,
        spec,
        sourceWidth: source.metadata.width,
        sourceHeight: source.metadata.height,
        requireAudio: source.metadata.hasAudio,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (generation === generationRef.current) setProgress(nextProgress);
        },
      });
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setPhase('validating');
      const validated = await validateEditedVideoOutput(
        rendered.blob,
        {
          width: geometry.width,
          height: geometry.height,
          durationMs: geometry.durationMs,
          requireAudio: source.metadata.hasAudio,
          filename: editedFilename(source.artifact.filename),
        },
        controller.signal,
      );
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setProgress(1);
      setCandidate({ validated, spec });
      setPhase('awaiting-replacement');
    } catch (renderError) {
      if (controller.signal.aborted || generation !== generationRef.current) {
        if (generation === generationRef.current) setPhase('editing');
        return;
      }
      setError(
        renderError instanceof Error
          ? renderError.message
          : 'The browser could not render this edit. The current video remains unchanged.',
      );
      setPhase('error');
    } finally {
      if (renderControllerRef.current === controller) renderControllerRef.current = null;
    }
  }, [dirty, history.present, source, sourceGeometry, supported]);

  const cancelRender = useCallback(() => {
    generationRef.current += 1;
    renderControllerRef.current?.abort();
    renderControllerRef.current = null;
    setProgress(0);
    setError(null);
    setCandidate(null);
    setPhase('editing');
  }, []);

  const resumeEditing = useCallback(() => {
    setCandidate(null);
    setError(null);
    setProgress(0);
    setPhase('editing');
  }, []);

  const beginCommit = useCallback(() => setPhase('committing'), []);
  const failCommit = useCallback((message: string) => {
    setError(message);
    setCandidate(null);
    setPhase('error');
  }, []);
  const completeCommit = useCallback(
    (editedArtifactId: string) => {
      if (!source || !candidate) return;
      setLastApplied({
        sourceArtifactId: source.artifact.id,
        editedArtifactId,
        spec: candidate.spec,
      });
      setPhase('complete');
    },
    [candidate, source],
  );

  useEffect(() => {
    if (!dirty && !isVideoEditBusy(phase)) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, phase]);

  useEffect(() => () => renderControllerRef.current?.abort(), []);

  return useMemo(
    () => ({
      source,
      baseline,
      draft,
      activeTool,
      showingBefore,
      splitComparison,
      playheadMs,
      phase,
      progress,
      error,
      candidate,
      lastApplied,
      dirty,
      supported,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      begin,
      close,
      setActiveTool,
      setShowingBefore,
      setSplitComparison,
      setPlayheadMs,
      applySpec,
      beginTransaction,
      previewSpec,
      commitTransaction,
      undo,
      redo,
      resetTool,
      resetAll,
      startRender,
      cancelRender,
      resumeEditing,
      beginCommit,
      failCommit,
      completeCommit,
    }),
    [
      source,
      baseline,
      draft,
      activeTool,
      showingBefore,
      splitComparison,
      playheadMs,
      phase,
      progress,
      error,
      candidate,
      lastApplied,
      dirty,
      supported,
      history.past.length,
      history.future.length,
      begin,
      close,
      applySpec,
      beginTransaction,
      previewSpec,
      commitTransaction,
      undo,
      redo,
      resetTool,
      resetAll,
      startRender,
      cancelRender,
      resumeEditing,
      beginCommit,
      failCommit,
      completeCommit,
    ],
  );
};

export type VideoEditSession = ReturnType<typeof useVideoEditSession>;
