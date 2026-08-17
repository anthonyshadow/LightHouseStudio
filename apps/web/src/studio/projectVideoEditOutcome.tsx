import type { VideoEditSpec } from '@studio/domain';
import type { VideoEditOutcome } from '../features/video-editor/VideoEditWorkspace';
import { StatusNotice } from '../ui';

/**
 * How the local video editor presents itself inside a Project.
 *
 * A Project already owns durable media, so a render is a disposable preview that must be adopted
 * before it counts — the opposite of the standalone flow, where rendering *is* the save. That
 * distinction is Project policy, so it lives here rather than as a mode flag inside the shared
 * editor.
 */
export const projectVideoEditOutcome = (
  appliedProjectEdit: VideoEditSpec | null,
): VideoEditOutcome => ({
  commitLabel: 'Render preview',
  errorTitle: 'Render preview not ready',
  notices: (
    <>
      <StatusNotice tone="neutral" title="Temporary Render preview" role="status">
        Rendering does not save Project media. After validation, explicitly adopt the preview to
        make it durable working media; the immutable original stays unchanged.
      </StatusNotice>
      {appliedProjectEdit ? (
        <StatusNotice tone="neutral" title="Applied Project edit" role="status">
          The current working-media bytes already include the retained edit from{' '}
          {Math.round(appliedProjectEdit.trim.startMs)}–{Math.round(appliedProjectEdit.trim.endMs)}{' '}
          ms, {appliedProjectEdit.crop.preset} crop, and {appliedProjectEdit.filter} filter. New
          controls start from that rendered baseline so the historical edit is not applied twice.
        </StatusNotice>
      ) : null}
    </>
  ),
});
