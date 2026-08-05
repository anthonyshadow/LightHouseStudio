import { useTheme } from '@emotion/react';
import {
  FULL_VIDEO_CROP,
  getVideoEditOutputGeometry,
  normalizeVideoCrop,
  rotatedVideoEditDimensions,
} from '@studio/domain';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '../../ui';
import { formatVideoEditTime, type VideoEditStagePreviewContract } from './types';
import { createVideoEditFrameRenderer } from './videoEditShader';
import {
  canvasFrameStyles,
  cropHandleStyles,
  cropMoveHandleStyles,
  cropSelectionStyles,
  playbackControlsStyles,
  previewLayerStyles,
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
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Readonly<{
    edge: CropEdge;
    x: number;
    y: number;
    crop: CropState;
  }> | null>(null);
  const [playing, setPlaying] = useState(false);
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
  const previewSpecRef = useRef(previewSpec);
  useEffect(() => {
    previewSpecRef.current = previewSpec;
  }, [previewSpec]);
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
    let frameId = 0;
    let videoFrameId = 0;
    const render = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          renderer.render(video, previewSpecRef.current);
        } catch {
          // A transient seek/frame gap is retried on the next animation frame.
        }
      }
      if ('requestVideoFrameCallback' in video) {
        videoFrameId = video.requestVideoFrameCallback(render);
      } else {
        frameId = requestAnimationFrame(render);
      }
    };
    render();
    return () => {
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
      setPlaying(!video.paused);
    };
    const updatePlayback = () => {
      setPlaying(!video.paused);
      updateTime();
    };
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('play', updatePlayback);
    video.addEventListener('pause', updatePlayback);
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('play', updatePlayback);
      video.removeEventListener('pause', updatePlayback);
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

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (
        video.currentTime * 1_000 < contract.spec.trim.startMs ||
        video.currentTime * 1_000 >= contract.spec.trim.endMs
      ) {
        video.currentTime = contract.spec.trim.startMs / 1_000;
      }
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  return (
    <div css={previewLayerStyles()} data-video-edit-preview="">
      {!contract.showingBefore ? (
        <div
          ref={frameRef}
          css={canvasFrameStyles(theme, displayGeometry.aspectRatio)}
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
      <div css={playbackControlsStyles(theme)} aria-label="Video edit playback controls">
        <Button
          size="small"
          variant="primary"
          aria-label={playing ? 'Pause edited preview' : 'Play edited preview'}
          onClick={togglePlayback}
        >
          {playing ? '❚❚' : '▶'}
        </Button>
        <label>
          <span>
            <span>{formatVideoEditTime(contract.playheadMs)}</span>
            <span>{formatVideoEditTime(contract.spec.trim.endMs)}</span>
          </span>
          <input
            type="range"
            min={contract.spec.trim.startMs}
            max={contract.spec.trim.endMs}
            step={10}
            value={Math.min(
              contract.spec.trim.endMs,
              Math.max(contract.spec.trim.startMs, contract.playheadMs),
            )}
            aria-label="Edited preview playhead"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              const video = videoRef.current;
              if (video) video.currentTime = next / 1_000;
              contract.onPlayheadChange(next);
            }}
          />
        </label>
      </div>
    </div>
  );
};
