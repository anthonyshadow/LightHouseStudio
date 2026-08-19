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
        Rendering saves nothing yet. Keep the preview to make it the current cut; your original
        video stays unchanged.
      </StatusNotice>
      {appliedProjectEdit ? (
        <StatusNotice tone="neutral" title="Applied Project edit" role="status">
          The current cut already includes the saved edit from{' '}
          {Math.round(appliedProjectEdit.trim.startMs)}–{Math.round(appliedProjectEdit.trim.endMs)}{' '}
          ms, {appliedProjectEdit.crop.preset} crop, and {appliedProjectEdit.filter} filter. New
          controls start from that render, so the earlier edit is not applied twice.
        </StatusNotice>
      ) : null}
    </>
  ),
});
