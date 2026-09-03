import { useTheme } from '@emotion/react';
import {
  FULL_VIDEO_CROP,
  getVideoEditOutputGeometry,
  normalizeVideoCrop,
  rotatedVideoEditDimensions,
  type NormalizedVideoCrop,
  type VideoEditSpec,
} from '@studio/domain';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { AppIcon, Button } from '../../ui';
import { createSubtitleOverlaySync } from './subtitleRasterizer';
import type { VideoEditStagePreviewContract } from './types';
import { createVideoEditFrameRenderer } from './videoEditShader';
import {
  canvasFrameStyles,
  comparisonBadgeStyles,
  cropHandleStyles,
  cropMoveHandleStyles,
  cropSelectionStyles,
  previewLayerStyles,
  rotateControlsStyles,
  splitDividerStyles,
} from './VideoEditStagePreview.styles';

type Props = Readonly<{
  videoRef: RefObject<HTMLVideoElement | null>;
  contract: VideoEditStagePreviewContract;
}>;

type CropEdge = 'move' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type CropState = VideoEditStagePreviewContract['spec']['crop'];

const CROP_HANDLES = [
  ['top-left', 'left', 'top'],
  ['top-right', 'right', 'top'],
  ['bottom-left', 'left', 'bottom'],
  ['bottom-right', 'right', 'bottom'],
] as const;

const cropKeyboardDelta = (key: string, amount: number): readonly [number, number] | null => {
  switch (key) {
    case 'ArrowLeft':
      return [-amount, 0];
    case 'ArrowRight':
      return [amount, 0];
    case 'ArrowUp':
      return [0, -amount];
    case 'ArrowDown':
      return [0, amount];
    default:
      return null;
  }
};

const updateCrop = (
  contract: VideoEditStagePreviewContract,
  edge: CropEdge,
  deltaX: number,
  deltaY: number,
  crop: CropState = contract.spec.crop,
): CropState => {
  const current = crop.rectangle;
  const next = { ...current };
  if (edge === 'move') {
    next.x += deltaX;
    next.y += deltaY;
  } else {
    if (edge.includes('left')) {
      next.x += deltaX;
      next.width -= deltaX;
    } else {
      next.width += deltaX;
    }
    if (edge.includes('top')) {
      next.y += deltaY;
      next.height -= deltaY;
    } else {
      next.height += deltaY;
    }
  }
  const nextCrop = {
    preset: edge === 'move' ? crop.preset : ('freeform' as const),
    rectangle: normalizeVideoCrop(next),
  };
  contract.onCropChange({
    ...contract.spec,
    crop: nextCrop,
  });
  return nextCrop;
};

export const VideoEditStagePreview = ({ videoRef, contract }: Props) => {
  'use memo';

  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Readonly<{
    edge: CropEdge;
    x: number;
    y: number;
    crop: CropState;
  }> | null>(null);
  const geometry = useMemo(
    () =>
      getVideoEditOutputGeometry(
        {
          width: contract.sourceWidth,
          height: contract.sourceHeight,
          durationMs: contract.spec.trim.endMs,
        },
        contract.spec,
      ),
    [contract.sourceHeight, contract.sourceWidth, contract.spec],
  );
  const cropMode = contract.activeTool === 'crop';
  const rotatedGeometry = useMemo(
    () =>
      rotatedVideoEditDimensions(
        contract.sourceWidth,
        contract.sourceHeight,
        contract.spec.rotation,
      ),
    [contract.sourceHeight, contract.sourceWidth, contract.spec.rotation],
  );
  const displayGeometry = cropMode
    ? { ...rotatedGeometry, aspectRatio: rotatedGeometry.width / rotatedGeometry.height }
    : geometry;
  const previewSpec = useMemo(
    () =>
      cropMode
        ? {
            ...contract.spec,
            crop: { preset: 'original' as const, rectangle: FULL_VIDEO_CROP },
          }
        : contract.spec,
    [contract.spec, cropMode],
  );
  /**
   * What a draw reads, mirrored from props so the frame loop never closes over a stale render. In
   * crop mode the canvas shows the whole rotated source and the output frame is the crop rectangle
   * inside it, so subtitles lay out there — exactly where the export will put them.
   */
  const drawInputsRef = useRef<{ spec: VideoEditSpec; crop: NormalizedVideoCrop | null }>({
    spec: previewSpec,
    crop: null,
  });
  const drawRef = useRef<(() => void) | null>(null);
  const previewScale = Math.min(1, 1280 / Math.max(displayGeometry.width, displayGeometry.height));
  const trimStartMs = contract.spec.trim.startMs;
  const trimEndMs = contract.spec.trim.endMs;
  const onPlayheadChange = contract.onPlayheadChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || contract.showingBefore) return;
    canvas.width = Math.max(2, Math.round(displayGeometry.width * previewScale));
    canvas.height = Math.max(2, Math.round(displayGeometry.height * previewScale));
    let renderer: ReturnType<typeof createVideoEditFrameRenderer>;
    try {
      renderer = createVideoEditFrameRenderer(canvas);
    } catch {
      return;
    }
    const frameRenderer = renderer;
    const syncOverlay = createSubtitleOverlaySync(
      () =>
        Object.assign(document.createElement('canvas'), {
          width: canvas.width,
          height: canvas.height,
        }),
      (overlay) => frameRenderer.setOverlay(overlay),
    );
    const draw = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const { spec, crop } = drawInputsRef.current;
      const frame = crop
        ? {
            x: crop.x * canvas.width,
            y: crop.y * canvas.height,
            width: crop.width * canvas.width,
            height: crop.height * canvas.height,
          }
        : { x: 0, y: 0, width: canvas.width, height: canvas.height };
      try {
        syncOverlay(spec.subtitles, video.currentTime * 1_000, frame);
        frameRenderer.render(video, spec);
      } catch {
        // A transient seek/frame gap is retried on the next animation frame.
      }
    };
    let frameId = 0;
    let videoFrameId = 0;
    const render = () => {
      draw();
      if ('requestVideoFrameCallback' in video) {
        videoFrameId = video.requestVideoFrameCallback(render);
      } else {
        frameId = requestAnimationFrame(render);
      }
    };
    drawRef.current = draw;
    render();
    return () => {
      drawRef.current = null;
      if (videoFrameId && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoFrameId);
      }
      if (frameId) cancelAnimationFrame(frameId);
      renderer.dispose();
    };
  }, [
    contract.showingBefore,
    displayGeometry.height,
    displayGeometry.width,
    previewScale,
    videoRef,
  ]);

  // The draft changed: mirror it for the frame loop, and draw once if the video is paused — a
  // paused video presents no new frame, so a subtitle being typed or a slider moved would
  // otherwise wait for playback; a playing one is already being drawn every frame.
  useEffect(() => {
    drawInputsRef.current = {
      spec: previewSpec,
      crop: cropMode ? contract.spec.crop.rectangle : null,
    };
    if (videoRef.current?.paused !== false) drawRef.current?.();
  }, [contract.spec.crop.rectangle, cropMode, previewSpec, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => {
      const currentMs = video.currentTime * 1_000;
      if (!video.paused && currentMs >= trimEndMs) {
        video.currentTime = trimStartMs / 1_000;
        void video.play().catch(() => undefined);
        return;
      }
      onPlayheadChange(currentMs);
    };
    video.addEventListener('timeupdate', updateTime);
    return () => {
      video.removeEventListener('timeupdate', updateTime);
    };
  }, [onPlayheadChange, trimEndMs, trimStartMs, videoRef]);

  const beginDrag = (edge: CropEdge, event: React.PointerEvent<HTMLElement>) => {
    contract.onCropStart();
    dragRef.current = {
      edge,
      x: event.clientX,
      y: event.clientY,
      crop: contract.spec.crop,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!drag || !frame?.width || !frame.height) return;
    const crop = updateCrop(
      contract,
      drag.edge,
      (event.clientX - drag.x) / frame.width,
      (event.clientY - drag.y) / frame.height,
      drag.crop,
    );
    dragRef.current = { edge: drag.edge, x: event.clientX, y: event.clientY, crop };
  };
  const finishDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    contract.onCropCommit();
  };
  const handleKeyboard = (edge: CropEdge, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const amount = event.shiftKey ? 0.05 : 0.01;
    const delta = cropKeyboardDelta(event.key, amount);
    if (!delta) return;
    event.preventDefault();
    contract.onCropStart();
    updateCrop(contract, edge, delta[0], delta[1]);
  };
  const commitKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key.startsWith('Arrow')) contract.onCropCommit();
  };

  const rotate = (amount: number) =>
    contract.onApplySpec({
      ...contract.spec,
      rotation: ((contract.spec.rotation + amount + 360) %
        360) as VideoEditStagePreviewContract['spec']['rotation'],
    });

  return (
    <div css={previewLayerStyles()} data-video-edit-preview="">
      {!contract.showingBefore ? (
        <div
          ref={frameRef}
          css={canvasFrameStyles(theme, displayGeometry.aspectRatio, contract.splitComparison)}
          data-video-edit-frame=""
        >
          <canvas ref={canvasRef} aria-hidden="true" />
          {contract.activeTool === 'crop' ? (
            <div
              css={cropSelectionStyles(theme, contract.spec.crop.rectangle)}
              data-crop-selection=""
              onPointerDown={(event) => beginDrag('move', event)}
              onPointerMove={continueDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <button
                type="button"
                aria-label="Move crop selection"
                css={cropMoveHandleStyles(theme)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginDrag('move', event);
                }}
                onPointerMove={continueDrag}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onKeyDown={(event) => handleKeyboard('move', event)}
                onKeyUp={commitKeyboard}
              />
              {CROP_HANDLES.map(([edge, horizontal, vertical]) => (
                <button
                  key={edge}
                  type="button"
                  aria-label={`Resize crop from ${edge.replace('-', ' ')}`}
                  css={cropHandleStyles(theme, horizontal, vertical)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    beginDrag(edge, event);
                  }}
                  onPointerMove={continueDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                  onKeyDown={(event) => handleKeyboard(edge, event)}
                  onKeyUp={commitKeyboard}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {contract.showingBefore ? <span css={comparisonBadgeStyles(theme)}>Original</span> : null}
      {contract.splitComparison && !contract.showingBefore ? (
        <span css={splitDividerStyles(theme)} aria-hidden="true" />
      ) : null}
      {contract.activeTool === 'rotate' && !contract.showingBefore ? (
        <div css={rotateControlsStyles(theme)} aria-label="On-frame rotation controls">
          <Button
            size="small"
            variant="quiet"
            aria-label="Rotate left 90 degrees"
            onClick={() => rotate(-90)}
          >
            <AppIcon name="undo" width="1rem" height="1rem" />
            −90°
          </Button>
          <output>{contract.spec.rotation}°</output>
          <Button
            size="small"
            variant="quiet"
            aria-label="Rotate right 90 degrees"
            onClick={() => rotate(90)}
          >
            +90°
            <AppIcon name="redo" width="1rem" height="1rem" />
          </Button>
        </div>
      ) : null}
    </div>
  );
};
