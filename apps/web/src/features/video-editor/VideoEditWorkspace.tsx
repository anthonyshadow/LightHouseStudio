import { useTheme } from '@emotion/react';
import {
  VIDEO_EDIT_CROP_PRESETS,
  VIDEO_EDIT_FILTERS,
  cropForVideoEditPreset,
  rotatedVideoEditDimensions,
  type VideoEditAdjustments,
  type VideoEditCropPreset,
  type VideoEditFilter,
  type VideoEditSpec,
} from '@studio/domain';
import { Button, StatusNotice } from '../../ui';
import type { VideoEditSession } from './useVideoEditSession';
import { formatVideoEditTime, isVideoEditBusy, type VideoEditTool } from './types';
import {
  editSettingsBodyStyles,
  editSettingsStyles,
  editToolRailStyles,
  editorFooterStyles,
  optionGridStyles,
  rangeFieldStyles,
  renderProgressStyles,
} from './VideoEditWorkspace.styles';

const TOOLS: readonly Readonly<{ id: VideoEditTool; label: string }>[] = [
  { id: 'trim', label: 'Trim' },
  { id: 'crop', label: 'Crop' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'filters', label: 'Filters' },
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

type EditRangeProps = Readonly<{
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step?: number;
  onStart: () => void;
  onChange: (value: number) => void;
  onCommit: () => void;
}>;

const EditRange = ({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  onStart,
  onChange,
  onCommit,
}: EditRangeProps) => {
  const theme = useTheme();
  return (
    <label css={rangeFieldStyles(theme)}>
      <span>
        <span>{label}</span>
        <output>{step >= 10 ? formatVideoEditTime(value) : value}</output>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={onStart}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')
            onStart();
        }}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </label>
  );
};

const updateTrim = (session: VideoEditSession, key: 'startMs' | 'endMs', value: number) =>
  session.previewSpec({ ...session.draft, trim: { ...session.draft.trim, [key]: value } });

const ToolSettings = ({ session }: { session: VideoEditSession }) => {
  const theme = useTheme();
  const source = session.source;
  if (!source) return null;
  if (session.activeTool === 'trim') {
    return (
      <>
        <h3>Trim selection</h3>
        <p>Playback loops between the selected start and end times.</p>
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
      <>
        <h3>Crop</h3>
        <p>Choose a ratio, then drag the frame or use its keyboard-accessible corner handles.</p>
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
      </>
    );
  }
  if (session.activeTool === 'rotate') {
    const rotate = (amount: number) =>
      session.applySpec({
        ...session.draft,
        rotation: ((session.draft.rotation + amount + 360) % 360) as VideoEditSpec['rotation'],
      });
    return (
      <>
        <h3>Rotate and flip</h3>
        <p>Rotation is baked into the rendered frames; the output does not rely on metadata.</p>
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
      </>
    );
  }
  if (session.activeTool === 'lighting') {
    return (
      <>
        <h3>Lighting</h3>
        <p>Adjustments are combined with the selected filter and rendered locally.</p>
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
    <>
      <h3>Filters</h3>
      <p>Filters use the same local color renderer as the live preview.</p>
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
    </>
  );
};

export type VideoEditWorkspaceProps = Readonly<{
  session: VideoEditSession;
  onRequestDiscard: () => void;
  projectMode?: boolean;
  appliedProjectEdit?: VideoEditSpec | null;
}>;

export const VideoEditWorkspace = ({
  session,
  onRequestDiscard,
  projectMode = false,
  appliedProjectEdit = null,
}: VideoEditWorkspaceProps) => {
  const theme = useTheme();
  const busy = isVideoEditBusy(session.phase);
  const activeToolLabel = TOOLS.find((tool) => tool.id === session.activeTool)?.label;
  return (
    <>
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
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          data-edit-rail-reset=""
          disabled={!session.dirty || busy}
          onClick={session.resetTool}
        >
          Reset tool
        </button>
      </nav>

      <aside
        css={editSettingsStyles(theme)}
        aria-label="Video edit settings"
        data-capture-controls=""
        data-video-edit-settings=""
      >
        <header>
          <h2>{activeToolLabel} settings</h2>
          <div data-editor-history="">
            <Button
              size="small"
              variant="quiet"
              aria-label="Undo video edit"
              disabled={!session.canUndo || busy}
              onClick={session.undo}
            >
              ↶
            </Button>
            <Button
              size="small"
              variant="quiet"
              aria-label="Redo video edit"
              disabled={!session.canRedo || busy}
              onClick={session.redo}
            >
              ↷
            </Button>
          </div>
        </header>
        <div
          css={editSettingsBodyStyles(theme)}
          role="region"
          aria-label={`${activeToolLabel} controls`}
        >
          <Button
            size="small"
            variant={session.showingBefore ? 'primary' : 'secondary'}
            aria-pressed={session.showingBefore}
            onClick={() => session.setShowingBefore(!session.showingBefore)}
          >
            {session.showingBefore ? 'Showing before' : 'Preview before'}
          </Button>
          {!session.supported ? (
            <StatusNotice tone="warning" title="Local editor unavailable">
              This browser cannot provide the required WebGL, WebCodecs, worker, and OffscreenCanvas
              path. Your current video is unchanged and can still be saved.
            </StatusNotice>
          ) : null}
          {projectMode ? (
            <StatusNotice tone="neutral" title="Temporary Render preview" role="status">
              Rendering does not save Project media. After validation, explicitly adopt the preview
              to make it durable working media; the immutable original stays unchanged.
            </StatusNotice>
          ) : null}
          {projectMode && appliedProjectEdit ? (
            <StatusNotice tone="neutral" title="Applied Project edit" role="status">
              The current working-media bytes already include the retained edit from{' '}
              {Math.round(appliedProjectEdit.trim.startMs)}–
              {Math.round(appliedProjectEdit.trim.endMs)} ms, {appliedProjectEdit.crop.preset} crop,
              and {appliedProjectEdit.filter} filter. New controls start from that rendered baseline
              so the historical edit is not applied twice.
            </StatusNotice>
          ) : null}
          <ToolSettings session={session} />
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
            <StatusNotice
              tone="danger"
              title={projectMode ? 'Render preview not ready' : 'Edit not saved'}
              role="alert"
            >
              {session.error}
            </StatusNotice>
          ) : null}
        </div>
        <footer css={editorFooterStyles(theme)}>
          <Button
            size="small"
            variant="quiet"
            disabled={!session.dirty || busy}
            onClick={session.resetAll}
          >
            Reset all
          </Button>
          <div data-editor-primary-actions="">
            <Button
              variant="primary"
              busy={busy}
              disabled={!session.dirty || !session.supported || busy}
              onClick={() => void session.startRender()}
            >
              {projectMode ? 'Render preview' : 'Save edited video'}
            </Button>
            <Button variant="danger" disabled={busy} onClick={onRequestDiscard}>
              Discard
            </Button>
          </div>
        </footer>
      </aside>
    </>
  );
};
