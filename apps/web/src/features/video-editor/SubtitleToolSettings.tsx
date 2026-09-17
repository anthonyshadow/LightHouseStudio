import { createSubtitleCueAt, type SubtitleCue } from '@studio/domain';
import type { RefObject } from 'react';
import { selectSubtitleCue } from './seekEditorVideo';
import { SubtitleCueEditor } from './SubtitleCueEditor';
import type { VideoEditSession } from './useVideoEditSession';

type Props = Readonly<{
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
}>;

/**
 * The single clip's Subtitles tool: {@link SubtitleCueEditor} against one source's clock.
 *
 * Cues here live in the source's own time and never leave memory until a render bakes them, so an
 * untyped cue is kept while the operator is mid-edit and dropped at the finalize step. That is why
 * this adapter's commit does nothing with the cue's id, where the arrangement's has to act on it.
 */
export const SubtitleToolSettings = ({ session, videoRef }: Props) => {
  const cues = session.draft.subtitles;
  const durationMs = session.source?.metadata.durationMs ?? 0;
  const { trim } = session.draft;
  if (!session.source) return null;

  const replaceCue = (next: SubtitleCue, mode: 'apply' | 'preview') => {
    const spec = {
      ...session.draft,
      subtitles: cues.map((cue) => (cue.id === next.id ? next : cue)),
    };
    if (mode === 'apply') session.applySpec(spec);
    else session.previewSpec(spec);
  };

  return (
    <SubtitleCueEditor
      cues={cues}
      selectedCueId={session.selectedSubtitleId}
      timelineDurationMs={durationMs}
      playheadMs={session.playheadMs}
      addLabel="Add subtitle at playhead"
      emptyNotice="No subtitles yet. Move the playhead to where the first line should appear, then add one. Subtitles are burned into the render exactly as the preview shows them."
      describeCue={(cue) =>
        cue.endMs <= trim.startMs || cue.startMs >= trim.endMs ? 'Outside the trim' : null
      }
      onAdd={() => {
        const cue = createSubtitleCueAt(session.draft, session.playheadMs, crypto.randomUUID());
        session.applySpec({ ...session.draft, subtitles: [...cues, cue] });
        session.setSelectedSubtitleId(cue.id);
        return cue.id;
      }}
      onSelectCue={(cue) => selectSubtitleCue(videoRef, session, cue, durationMs)}
      onPreviewCue={(cue) => replaceCue(cue, 'preview')}
      onApplyCue={(cue) => replaceCue(cue, 'apply')}
      onBeginEdit={session.beginTransaction}
      onCommitEdit={() => session.commitTransaction()}
      onRemoveCue={session.removeSubtitleCue}
    />
  );
};
