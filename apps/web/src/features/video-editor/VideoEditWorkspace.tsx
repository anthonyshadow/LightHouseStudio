import { Global, useTheme } from '@emotion/react';
import {
  VIDEO_EDIT_AUDIO_LEVEL_MAX,
  VIDEO_EDIT_CROP_PRESETS,
  VIDEO_EDIT_FILTERS,
  cropForVideoEditPreset,
  rotatedVideoEditDimensions,
  type VideoEditAdjustments,
  type VideoEditCropPreset,
  type VideoEditFilter,
  type VideoEditSpec,
} from '@studio/domain';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { AppIcon, type AppIconName, Button, StatusNotice } from '../../ui';
import { EditRange } from './EditRange';
import { SubtitleToolSettings } from './SubtitleToolSettings';
import type { VideoEditSession } from './useVideoEditSession';
import { VideoEditTimeline } from './VideoEditTimeline';
import { isVideoEditBusy, type VideoEditTool } from './types';
import {
  editSettingsBodyStyles,
  editSettingsStyles,
  editToolRailFrameStyles,
  editToolRailStyles,
  editorFooterStyles,
  editorHeaderStyles,
  editorWorkspaceStyles,
  historyCompareStyles,
  inspectorIntroStyles,
  optionGridStyles,
  renderProgressStyles,
  videoEditStageLayoutStyles,
} from './VideoEditWorkspace.styles';

const TOOLS: readonly Readonly<{
  id: VideoEditTool;
  label: string;
  icon: AppIconName;
  description: string;
}>[] = [
  {
    id: 'trim',
    label: 'Trim',
    icon: 'scissors',
    description: 'Set the visible in and out points; playback loops inside the selection.',
  },
  {
    id: 'crop',
    label: 'Crop',
    icon: 'crop',
    description: 'Choose a ratio, then drag the frame or use its keyboard-accessible handles.',
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: 'rotate',
    description: 'Rotate or flip the frame; the result is baked into the local render.',
  },
  {
    id: 'lighting',
    label: 'Lighting',
    icon: 'lighting',
    description: 'Adjustments combine with the selected filter and render locally.',
  },
  {
    id: 'filters',
    label: 'Filters',
    icon: 'filters',
    description: 'Choose a look rendered through the same local color pipeline as the preview.',
  },
  {
    id: 'subtitles',
    label: 'Subtitles',
    icon: 'subtitles',
    description:
      'Timed text burned into the render, laid out exactly as the preview shows it. Subtitles may overlap; they stack.',
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'audio',
    description: 'Set how loud the clip plays, or mute it.',
  },
];

const ADJUSTMENT_LABELS: Record<keyof VideoEditAdjustments, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  temperature: 'Temperature',
  highlights: 'Highlights',
  shadows: 'Shadows',
};

const CROP_LABELS: Record<VideoEditCropPreset, string> = {
  original: 'Original',
  freeform: 'Freeform',
  '16:9': '16:9',
  '9:16': '9:16',
  '1:1': '1:1',
  '4:5': '4:5',
};

const FILTER_LABELS: Record<VideoEditFilter, string> = {
  original: 'Original',
  vivid: 'Vivid',
  warm: 'Warm',
  cool: 'Cool',
  mono: 'Mono',
  fade: 'Fade',
};

const updateTrim = (session: VideoEditSession, key: 'startMs' | 'endMs', value: number) =>
  session.previewSpec({ ...session.draft, trim: { ...session.draft.trim, [key]: value } });

const ToolSettings = ({
  session,
  videoRef,
}: {
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
}) => {
  const theme = useTheme();
  const source = session.source;
  if (!source) return null;

  if (session.activeTool === 'subtitles') {
    return <SubtitleToolSettings session={session} videoRef={videoRef} />;
  }

  if (session.activeTool === 'trim') {
    return (
      <>
        <EditRange
          label="Start time"
          value={session.draft.trim.startMs}
          minimum={0}
          maximum={session.draft.trim.endMs - 100}
          step={10}
          onStart={session.beginTransaction}
          onChange={(value) => updateTrim(session, 'startMs', value)}
          onCommit={session.commitTransaction}
        />
        <Button
          size="small"
          variant="secondary"
          onClick={() =>
            session.applySpec({
              ...session.draft,
              trim: { ...session.draft.trim, startMs: session.playheadMs },
            })
          }
        >
          Set start to playhead
        </Button>
        <EditRange
          label="End time"
          value={session.draft.trim.endMs}
          minimum={session.draft.trim.startMs + 100}
          maximum={source.metadata.durationMs}
          step={10}
          onStart={session.beginTransaction}
          onChange={(value) => updateTrim(session, 'endMs', value)}
          onCommit={session.commitTransaction}
        />
        <Button
          size="small"
          variant="secondary"
          onClick={() =>
            session.applySpec({
              ...session.draft,
              trim: { ...session.draft.trim, endMs: session.playheadMs },
            })
          }
        >
          Set end to playhead
        </Button>
      </>
    );
  }

  if (session.activeTool === 'crop') {
    const rotated = rotatedVideoEditDimensions(
      source.metadata.width,
      source.metadata.height,
      session.draft.rotation,
    );
    return (
      <div css={optionGridStyles(theme, 2)}>
        {VIDEO_EDIT_CROP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={session.draft.crop.preset === preset}
            onClick={() =>
              session.applySpec({
                ...session.draft,
                crop: {
                  preset,
                  rectangle: cropForVideoEditPreset(
                    preset,
                    rotated.width,
                    rotated.height,
                    session.draft.crop.rectangle,
                  ),
                },
              })
            }
          >
            {CROP_LABELS[preset]}
          </button>
        ))}
      </div>
    );
  }

  if (session.activeTool === 'rotate') {
    const rotate = (amount: number) =>
      session.applySpec({
        ...session.draft,
        rotation: ((session.draft.rotation + amount + 360) % 360) as VideoEditSpec['rotation'],
      });
    return (
      <div css={optionGridStyles(theme, 2)}>
        <button type="button" onClick={() => rotate(-90)}>
          Rotate left
        </button>
        <button type="button" onClick={() => rotate(90)}>
          Rotate right
        </button>
        <button
          type="button"
          aria-pressed={session.draft.flipHorizontal}
          onClick={() =>
            session.applySpec({
              ...session.draft,
              flipHorizontal: !session.draft.flipHorizontal,
            })
          }
        >
          Flip horizontal
        </button>
        <button
          type="button"
          aria-pressed={session.draft.flipVertical}
          onClick={() =>
            session.applySpec({ ...session.draft, flipVertical: !session.draft.flipVertical })
          }
        >
          Flip vertical
        </button>
      </div>
    );
  }

  if (session.activeTool === 'audio') {
    return (
      <>
        <EditRange
          label="Level"
          value={session.draft.audio.level}
          minimum={0}
          maximum={VIDEO_EDIT_AUDIO_LEVEL_MAX}
          format={(value) => `${value}%`}
          onStart={session.beginTransaction}
          onChange={(value) =>
            session.previewSpec({
              ...session.draft,
              audio: { ...session.draft.audio, level: value },
            })
          }
          onCommit={session.commitTransaction}
        />
        <div css={optionGridStyles(theme, 1)}>
          <button
            type="button"
            aria-pressed={session.draft.audio.muted}
            onClick={() =>
              session.applySpec({
                ...session.draft,
                audio: { ...session.draft.audio, muted: !session.draft.audio.muted },
              })
            }
          >
            {session.draft.audio.muted ? 'Muted' : 'Mute'}
          </button>
        </div>
        <p css={{ margin: 0, fontSize: theme.fontSizes.metadata, color: theme.colors.textMuted }}>
          Whether the saved video carries audio at all is chosen with its placement when you save.
        </p>
      </>
    );
  }

  if (session.activeTool === 'lighting') {
    return (
      <>
        {(Object.keys(ADJUSTMENT_LABELS) as (keyof VideoEditAdjustments)[]).map((key) => (
          <EditRange
            key={key}
            label={ADJUSTMENT_LABELS[key]}
            value={session.draft.adjustments[key]}
            minimum={-100}
            maximum={100}
            onStart={session.beginTransaction}
            onChange={(value) =>
              session.previewSpec({
                ...session.draft,
                adjustments: { ...session.draft.adjustments, [key]: value },
              })
            }
            onCommit={session.commitTransaction}
          />
        ))}
      </>
    );
  }

  return (
    <div css={optionGridStyles(theme, 2)}>
      {VIDEO_EDIT_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          aria-pressed={session.draft.filter === filter}
          onClick={() => session.applySpec({ ...session.draft, filter })}
        >
          {FILTER_LABELS[filter]}
        </button>
      ))}
    </div>
  );
};

/** Describes what the caller does with a successfully rendered local edit. */
export type VideoEditOutcome = Readonly<{
  commitLabel: string;
  errorTitle: string;
  readyTitle?: string;
  readyDescription?: string;
  notices?: ReactNode;
}>;

const SAVE_EDITED_VIDEO: VideoEditOutcome = {
  commitLabel: 'Save edited video',
  errorTitle: 'Edit not saved',
  readyTitle: 'Ready to save locally',
  readyDescription: 'Saving replaces the current edited preview. Discard requires confirmation.',
};

const isTextEntry = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('textarea, select, [contenteditable="true"], input:not([type="range"])'),
  );
};

export type VideoEditWorkspaceProps = Readonly<{
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
  onRequestDiscard: () => void;
  outcome?: VideoEditOutcome;
}>;

export const VideoEditWorkspace = ({
  session,
  videoRef,
  onRequestDiscard,
  outcome = SAVE_EDITED_VIDEO,
}: VideoEditWorkspaceProps) => {
  const theme = useTheme();
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const busy = isVideoEditBusy(session.phase);
  const activeTool = TOOLS.find((tool) => tool.id === session.activeTool) ?? TOOLS[0]!;
  const setShowingBefore = session.setShowingBefore;

  useEffect(() => {
    const holdCompare = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'c' || event.repeat || isTextEntry(event.target)) return;
      setShowingBefore(true);
    };
    const releaseCompare = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'c') setShowingBefore(false);
    };
    const releaseOnBlur = () => setShowingBefore(false);
    window.addEventListener('keydown', holdCompare);
    window.addEventListener('keyup', releaseCompare);
    window.addEventListener('blur', releaseOnBlur);
    return () => {
      window.removeEventListener('keydown', holdCompare);
      window.removeEventListener('keyup', releaseCompare);
      window.removeEventListener('blur', releaseOnBlur);
    };
  }, [setShowingBefore]);

  useEffect(() => {
    if (!inspectorExpanded) return;
    // Escape inside a text field belongs to the field — a subtitle being typed must not fold the
    // inspector away from under the cursor.
    const collapseOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isTextEntry(event.target)) setInspectorExpanded(false);
    };
    window.addEventListener('keydown', collapseOnEscape);
    return () => window.removeEventListener('keydown', collapseOnEscape);
  }, [inspectorExpanded]);

  return (
    <div
      css={editorWorkspaceStyles()}
      data-video-edit-workspace=""
      data-inspector-expanded={inspectorExpanded ? 'true' : 'false'}
    >
      <Global styles={videoEditStageLayoutStyles(theme)} />
      <header css={editorHeaderStyles(theme)} data-video-editor-header="">
        <div>
          <h1>Edit video</h1>
          <p>Local edits stay in this browser until you save.</p>
        </div>
        <span data-editor-dirty={session.dirty ? 'true' : 'false'}>
          <span aria-hidden="true" />
          {session.dirty ? 'Unsaved edits' : 'No unsaved edits'}
        </span>
      </header>

      <div css={editToolRailFrameStyles(theme)}>
        <nav
          css={editToolRailStyles(theme)}
          aria-label="Video editing tools"
          data-studio-tool-rail=""
          data-video-edit-tool-rail=""
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-current={session.activeTool === tool.id ? 'page' : undefined}
              disabled={busy}
              onClick={() => session.setActiveTool(tool.id)}
            >
              <AppIcon name={tool.icon} width="1rem" height="1rem" />
              {tool.label}
            </button>
          ))}
        </nav>
        <span data-tool-overflow-cue="" aria-hidden="true">
          <AppIcon name="chevronRight" width="0.9rem" height="0.9rem" />
          <AppIcon name="chevronRight" width="0.9rem" height="0.9rem" />
        </span>
      </div>

      <section
        css={historyCompareStyles(theme)}
        aria-labelledby="video-editor-history-title"
        data-video-editor-history=""
      >
        <header>
          <h2 id="video-editor-history-title">History and compare</h2>
          <span>Hold C to show original</span>
        </header>
        <div>
          <Button
            size="small"
            variant="secondary"
            disabled={!session.canUndo || busy}
            onClick={session.undo}
          >
            <AppIcon name="undo" width="1rem" height="1rem" />
            Undo
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={!session.canRedo || busy}
            onClick={session.redo}
          >
            <AppIcon name="redo" width="1rem" height="1rem" />
            Redo
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={!session.dirty || busy}
            onClick={session.resetTool}
          >
            <AppIcon name="reset" width="1rem" height="1rem" />
            Reset tool
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={!session.dirty || busy}
            onClick={session.resetAll}
          >
            <AppIcon name="history" width="1rem" height="1rem" />
            Reset all
          </Button>
          <Button
            size="small"
            variant="secondary"
            aria-label="Hold to show original. Keyboard shortcut C."
            aria-pressed={session.showingBefore}
            disabled={busy}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              session.setShowingBefore(true);
            }}
            onPointerUp={() => session.setShowingBefore(false)}
            onPointerCancel={() => session.setShowingBefore(false)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') session.setShowingBefore(true);
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') session.setShowingBefore(false);
            }}
            onBlur={() => session.setShowingBefore(false)}
          >
            <AppIcon name="compare" width="1rem" height="1rem" />
            Hold Compare
            <kbd>C</kbd>
          </Button>
          <Button
            size="small"
            variant="quiet"
            aria-pressed={session.splitComparison}
            disabled={busy}
            onClick={() => {
              session.setShowingBefore(false);
              session.setSplitComparison(!session.splitComparison);
            }}
          >
            <AppIcon name="split" width="1rem" height="1rem" />
            Split
          </Button>
        </div>
      </section>

      <VideoEditTimeline session={session} videoRef={videoRef} />

      <aside
        css={editSettingsStyles(theme)}
        aria-label="Video edit settings"
        data-capture-controls=""
        data-video-edit-settings=""
        data-expanded={inspectorExpanded ? 'true' : 'false'}
      >
        <header>
          <div>
            <span data-inspector-drag-handle="" aria-hidden="true" />
            <span data-inspector-title="">
              <AppIcon name={activeTool.icon} width="1rem" height="1rem" />
              <h2>{activeTool.label} settings</h2>
              {session.dirty ? <strong>Edited</strong> : null}
            </span>
          </div>
          <Button
            size="small"
            variant="quiet"
            aria-label={inspectorExpanded ? 'Collapse inspector' : 'Expand inspector'}
            aria-expanded={inspectorExpanded}
            onClick={() => setInspectorExpanded((expanded) => !expanded)}
          >
            <span data-desktop-inspector-icon="">
              <AppIcon
                name={inspectorExpanded ? 'collapse' : 'chevronLeft'}
                width="1.1rem"
                height="1.1rem"
              />
            </span>
            <span data-mobile-inspector-icon="">
              <AppIcon name="chevronDown" width="1.1rem" height="1.1rem" />
            </span>
          </Button>
        </header>
        <div
          css={editSettingsBodyStyles(theme)}
          role="region"
          aria-label={`${activeTool.label} controls`}
        >
          <div css={inspectorIntroStyles(theme)}>
            <div>
              <h3>{activeTool.label}</h3>
              <p>{activeTool.description}</p>
            </div>
            <Button
              size="small"
              variant="quiet"
              disabled={!session.dirty || busy}
              onClick={session.resetTool}
            >
              <AppIcon name="reset" width="1rem" height="1rem" />
              Reset
            </Button>
          </div>
          <ToolSettings session={session} videoRef={videoRef} />
          {/* Only when the probe has actually answered; `null` is still asking. */}
          {session.supported === false ? (
            <StatusNotice tone="warning" title="Local editor unavailable">
              This browser cannot provide the required WebGL, WebCodecs, worker, and OffscreenCanvas
              path. Your current video is unchanged and can still be saved.
            </StatusNotice>
          ) : null}
          {outcome.notices}
          {session.phase === 'rendering' || session.phase === 'validating' ? (
            <div css={renderProgressStyles(theme)} role="status" aria-live="polite">
              <span>
                <strong>
                  {session.phase === 'rendering' ? 'Rendering locally' : 'Validating output'}
                </strong>
                <span>{Math.round(session.progress * 100)}%</span>
              </span>
              <progress max={1} value={session.progress} />
              <Button size="small" variant="quiet" onClick={session.cancelRender}>
                Cancel render
              </Button>
            </div>
          ) : null}
          {session.error ? (
            <StatusNotice tone="danger" title={outcome.errorTitle} role="alert">
              {session.error}
            </StatusNotice>
          ) : null}
        </div>
      </aside>

      <footer
        css={editorFooterStyles(theme)}
        aria-label="Editor actions"
        data-video-editor-actions=""
      >
        <div>
          <strong>{outcome.readyTitle ?? 'Ready to save locally'}</strong>
          <span>
            {outcome.readyDescription ??
              'Saving replaces the current edited preview. Discard requires confirmation.'}
          </span>
        </div>
        <Button
          variant="primary"
          busy={busy}
          disabled={!session.dirty || !session.supported || busy}
          onClick={() => void session.startRender()}
        >
          <AppIcon name="save" width="1.1rem" height="1.1rem" />
          {outcome.commitLabel}
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          aria-label="Discard"
          data-editor-discard=""
          onClick={onRequestDiscard}
        >
          <AppIcon name="trash" width="1.1rem" height="1.1rem" />
          <span>Discard</span>
        </Button>
      </footer>
    </div>
  );
};
